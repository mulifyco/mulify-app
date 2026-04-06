// Simple credential-based auth for Phase 1 internal access
// Using Next-Auth v5 with credentials provider
// Phase 2: replace with proper SSO or team-based auth

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const adminEmail = process.env.ADMIN_EMAIL ?? "admin@mulify.co";
        const adminPassword = process.env.ADMIN_PASSWORD;

        if (!adminPassword) {
          throw new Error("ADMIN_PASSWORD not configured");
        }

        if (credentials?.email !== adminEmail) {
          return null;
        }

        const passwordString = credentials?.password as string;
        // Support both raw password comparison and bcrypt hash
        let valid = false;
        if (adminPassword.startsWith("$2")) {
          valid = await bcrypt.compare(passwordString, adminPassword);
        } else {
          valid = passwordString === adminPassword;
        }

        if (!valid) return null;

        return {
          id: "admin",
          email: adminEmail,
          name: "Admin",
          role: "admin",
        };
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
        token.role = (user as { role?: string }).role ?? "admin";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string }).role = token.role as string;
      }
      return session;
    },
  },
});
