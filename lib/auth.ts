// Simple credential-based auth for Phase 1 internal access
// Using Next-Auth v5 with credentials provider
// Phase 2: replace with proper SSO or team-based auth

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { CredentialsSignin } from "next-auth";
import { Plan, ProductEventType } from "@prisma/client";
import prisma from "@/lib/prisma";

/** Must match prisma/seed.ts demo admin. */
export const DEMO_ADMIN_EMAIL = "admin@mulify.co";

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function credentialsSignIn(code: string): never {
  const err = new CredentialsSignin();
  err.code = code;
  throw err;
}

function isJwtSessionError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "type" in e &&
    (e as { type?: string }).type === "JWTSessionError"
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  // Prefer AUTH_SECRET (Auth.js v5); env-local mirrors NEXTAUTH_SECRET in dev.
  secret: process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim(),
  logger: {
    error(error) {
      // Invalid/old session cookies log as JWTSessionError; console.error triggers the Next.js dev overlay.
      if (isJwtSessionError(error)) {
        console.warn(
          "[auth] Invalid or stale session cookie (e.g. AUTH_SECRET changed). Clear cookies for this site or use a private window, then sign in again."
        );
        return;
      }
      const red = "\x1b[31m";
      const reset = "\x1b[0m";
      const name =
        error instanceof Error && "type" in error
          ? String((error as Error & { type?: string }).type)
          : error instanceof Error
            ? error.name
            : "Error";
      console.error(`${red}[auth][error]${reset} ${name}: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof Error && error.stack) {
        console.error(error.stack.replace(/.*\n/, "").substring(1));
      }
    },
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const emailNorm = normalizeEmail(credentials?.email);
        const passwordString =
          typeof credentials?.password === "string" ? credentials.password : "";

        if (!emailNorm) {
          credentialsSignIn("credentials");
        }

        const isDev = process.env.NODE_ENV === "development";
        const demoBypass = process.env.DEMO_LOGIN_BYPASS === "true";

        if (isDev && demoBypass && emailNorm === DEMO_ADMIN_EMAIL) {
          const row = await prisma.user.findFirst({
            where: { email: { equals: DEMO_ADMIN_EMAIL, mode: "insensitive" } },
            select: { id: true, email: true, billingPlan: true },
          });
          if (!row) {
            credentialsSignIn("demo_seed_missing");
          }
          return {
            id: row.id,
            email: row.email,
            name: "Admin",
            role: "admin",
            plan: String(row.billingPlan ?? "PRO"),
          };
        }

        const userRow = await prisma.user.findFirst({
          where: { email: { equals: emailNorm, mode: "insensitive" } },
          select: { id: true, email: true, passwordHash: true, billingPlan: true },
        });

        if (userRow) {
          if (!userRow.passwordHash) {
            if (emailNorm === DEMO_ADMIN_EMAIL) {
              credentialsSignIn("demo_seed_missing");
            }
            credentialsSignIn("invalid_password");
          }
          const valid = await bcrypt.compare(passwordString, userRow.passwordHash);
          if (!valid) {
            credentialsSignIn("invalid_password");
          }
          return {
            id: userRow.id,
            email: userRow.email,
            name: "Admin",
            role: "admin",
            plan: String(userRow.billingPlan ?? "FREE"),
          };
        }

        const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL ?? DEMO_ADMIN_EMAIL);
        const adminPassword = process.env.ADMIN_PASSWORD?.trim();
        if (emailNorm === adminEmail) {
          if (!adminPassword) {
            if (emailNorm === DEMO_ADMIN_EMAIL) {
              credentialsSignIn("demo_seed_missing");
            }
            credentialsSignIn("configuration");
          }
          let valid = false;
          if (adminPassword.startsWith("$2")) {
            valid = await bcrypt.compare(passwordString, adminPassword);
          } else {
            valid = passwordString === adminPassword;
          }
          if (!valid) {
            credentialsSignIn("invalid_password");
          }
          const envRow = await prisma.user.upsert({
            where: { email: adminEmail },
            create: {
              email: adminEmail,
              credits: 3,
              plan: Plan.PRO,
              billingPlan: "PRO",
            },
            update: {},
            select: { id: true, email: true, billingPlan: true },
          });
          return {
            id: envRow.id,
            email: envRow.email,
            name: "Admin",
            role: "admin",
            plan: String(envRow.billingPlan ?? "PRO"),
          };
        }

        credentialsSignIn("user_not_found");
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as { id?: string; role?: string; plan?: string };
        token.role = u.role ?? "admin";
        token.plan = u.plan ?? "FREE";
        if (u.id) {
          token.sub = u.id;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const email = session.user.email ?? null;
        (session.user as { id?: string }).id =
          typeof token.sub === "string" && token.sub ? token.sub : "";
        (session.user as { role?: string }).role =
          typeof token.role === "string" ? token.role : "admin";

        const envPlan = process.env.NEXT_PUBLIC_DEFAULT_PLAN?.trim();
        if (envPlan) {
          (session.user as { plan?: string }).plan = envPlan;
          return session;
        }

        if (email) {
          const u = await prisma.user.upsert({
            where: { email },
            create: {
              email,
              credits: 3,
              billingPlan: "FREE",
            },
            update: {},
            select: { id: true, billingPlan: true, activeWorkspaceId: true },
          });
          (session.user as { id?: string }).id = u.id;
          (session.user as { plan?: string }).plan = String(u.billingPlan ?? "FREE");

          if (!u.activeWorkspaceId) {
            const ws = await prisma.workspace.create({
              data: {
                name: "Default workspace",
                ownerUserId: u.id,
                billingPlan: String(u.billingPlan ?? "FREE"),
                members: {
                  create: { userId: u.id, role: "OWNER" },
                },
              } as any,
              select: { id: true },
            });
            await prisma.user.update({ where: { id: u.id }, data: { activeWorkspaceId: ws.id } });
          }
        } else {
          (session.user as { plan?: string }).plan =
            typeof token.plan === "string" ? token.plan : "FREE";
        }
      }
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      const id = user?.id;
      if (typeof id !== "string" || !id) return;
      try {
        const { trackProductEvent } = await import("@/server/services/product-analytics.service");
        const u = await prisma.user.findUnique({
          where: { id },
          select: { activeWorkspaceId: true },
        });
        await trackProductEvent({
          eventType: ProductEventType.LOGIN_SUCCESS,
          userId: id,
          workspaceId: u?.activeWorkspaceId ?? null,
          metadata: { via: "nextauth_signIn" },
        });
      } catch {
        /* best-effort */
      }
    },
  },
});
