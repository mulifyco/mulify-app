import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function hasSessionCookie(req: NextRequest): boolean {
  // NextAuth/Auth.js cookie names vary by version and secure context.
  const candidates = [
    "authjs.session-token",
    "__Secure-authjs.session-token",
    "next-auth.session-token",
    "__Secure-next-auth.session-token",
  ];
  return candidates.some((name) => {
    const v = req.cookies.get(name)?.value;
    return Boolean(v && v.length > 10);
  });
}

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public routes
  if (
    pathname === "/" ||
    pathname.startsWith("/pricing") ||
    pathname.startsWith("/demo") ||
    pathname.startsWith("/book-demo") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/accept-invite") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/billing/webhook") ||
    pathname.startsWith("/api/public/") ||
    pathname.startsWith("/api/gtm/inbound-demo") ||
    (pathname.startsWith("/api/analytics/event") && req.method === "POST") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  // Require auth for everything else
  if (!hasSessionCookie(req)) {
    const loginUrl = new URL("/login", req.url);
    const callback = `${req.nextUrl.pathname}${req.nextUrl.search}`;
    if (callback && callback !== "/") {
      loginUrl.searchParams.set("callbackUrl", callback);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
