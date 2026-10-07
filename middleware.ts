import { NextResponse, type NextRequest } from "next/server";

/**
 * Local-server guard + CSP.
 *
 * The app is a server on the user's own machine that can write files and deploy to their Google
 * account, so any website they visit could try to talk to it:
 *  - DNS rebinding (evil.com resolving to 127.0.0.1) → reject any Host that isn't loopback.
 *  - Cross-site requests (CSRF from an open tab) → state-changing methods must come from our own origin.
 * The CSP is nonce-based and Report-Only until Monaco + the preview iframe are verified clean.
 */

const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function buildCsp(nonce: string): string {
  return [
    `default-src 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
    `script-src 'self' 'nonce-${nonce}' 'unsafe-eval' https://cdn.jsdelivr.net`,
    `worker-src 'self' blob:`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `connect-src 'self'`,
    `frame-src 'self' blob: data: https://script.google.com`,
  ].join("; ");
}

function forbidden(reason: string): NextResponse {
  return NextResponse.json({ error: "forbidden", reason }, { status: 403 });
}

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  if (!LOOPBACK_HOST.test(host)) return forbidden("host");

  if (!SAFE_METHODS.has(request.method)) {
    const origin = request.headers.get("origin");
    const site = request.headers.get("sec-fetch-site");
    if (origin) {
      let originHost = "";
      try {
        originHost = new URL(origin).host;
      } catch {
        return forbidden("origin");
      }
      if (originHost !== host) return forbidden("origin");
    } else if (site && site !== "same-origin" && site !== "none") {
      return forbidden("cross-site");
    }
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const nonce = btoa(String.fromCharCode(...bytes));
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy-Report-Only", buildCsp(nonce));
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
