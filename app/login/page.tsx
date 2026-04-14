"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import LoginConversionTracker from "@/app/login/LoginConversionTracker";

function messageForSignInCode(code: string | undefined, error: string | undefined): string {
  switch (code) {
    case "user_not_found":
      return "No account found for this email.";
    case "invalid_password":
      return "Incorrect password.";
    case "demo_seed_missing":
      return "Demo admin is missing in the database. Run: npm run db:seed";
    case "configuration":
      return "Sign-in is not configured (set ADMIN_PASSWORD or run db:seed).";
    case "credentials":
    default:
      if (error === "CredentialsSignin") {
        return "Sign-in failed. Check your email and password.";
      }
      return error ? `Sign-in failed (${error}).` : "Sign-in failed.";
  }
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl: "/dashboard",
    });

    if (!result?.ok || result.error) {
      setError(messageForSignInCode(result?.code, result?.error));
      setLoading(false);
      return;
    }

    router.refresh();
    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none hero-glow opacity-60" />
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-[400px] w-[600px] rounded-full bg-indigo-500/15 blur-3xl pointer-events-none" />

      <Suspense fallback={null}>
        <LoginConversionTracker />
      </Suspense>

      <div className="w-full max-w-sm relative">
        {/* Brand mark */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 justify-center mb-4">
            <div className="h-10 w-10 rounded-xl bg-[var(--hero-gradient)] flex items-center justify-center text-sm font-bold text-white premium-ring">
              M
            </div>
          </div>
          <div className="text-[10px] font-semibold text-muted-2 uppercase tracking-[0.22em]">
            Mulify Library
          </div>
          <div className="text-2xl font-semibold text-foreground mt-1 tracking-tight">Sign in</div>
          <div className="text-sm text-muted mt-1">Sign in to your growth intelligence workspace</div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-border bg-card/60 glass premium-ring p-6 space-y-4"
        >
          <div>
            <label className="text-[11px] font-semibold text-muted-2 uppercase tracking-[0.14em] mb-1.5 block">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full bg-surface-2/60 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder-muted-2 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-muted-2 uppercase tracking-[0.14em] mb-1.5 block">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-surface-2/60 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder-muted-2 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="text-red-300 text-sm text-center bg-red-500/10 border border-red-500/25 rounded-xl px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-primary hover:opacity-90 disabled:opacity-50 rounded-xl text-sm font-semibold text-primary-foreground transition-opacity shadow-[0_8px_30px_rgba(109,93,246,0.25)]"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {/* Access note — no self-serve signup language */}
        <div className="mt-5 rounded-xl border border-border bg-card/40 glass px-4 py-3 text-center">
          <p className="text-xs text-muted leading-relaxed">
            Access is by invitation.{" "}
            <span className="text-foreground font-medium">Your workspace admin will create your credentials.</span>
          </p>
          <p className="text-xs text-muted mt-1.5">
            Need a workspace?{" "}
            <Link href="/book-demo" className="text-indigo-400 hover:text-indigo-300 transition-colors font-medium">
              Book a demo →
            </Link>
          </p>
        </div>

        <div className="mt-4 text-center text-xs text-muted flex items-center justify-center gap-3">
          <Link href="/" className="text-muted-2 hover:text-foreground transition-colors">
            ← Home
          </Link>
          <span className="text-border">·</span>
          <Link href="/pricing" className="text-muted-2 hover:text-foreground transition-colors">
            Pricing
          </Link>
          <span className="text-border">·</span>
          <Link href="/book-demo" className="text-muted-2 hover:text-foreground transition-colors">
            Book demo
          </Link>
        </div>
      </div>
    </div>
  );
}
