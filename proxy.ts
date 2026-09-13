/**
 * proxy.ts  (project root)
 *
 * Authentication + role-based access control for all non-public routes.
 *
 * How this works:
 *
 * The access token (JWT, 15 min) is stored in an `httpOnly` cookie called
 * `spotix_at` — set by /api/auth on login and /api/auth/refresh on rotation.
 * proxy reads this cookie and cryptographically verifies the JWT using
 * the Web Crypto API (Edge-safe; no Node.js required).
 *
 * On expiry the browser should have already called /api/auth/refresh before
 * the next navigation (handled by auth-client.ts). If it hasn't, the user is
 * redirected to /login with their intended path preserved.
 *
 *  Cookie responsibilities
 *
 *   spotix_at   httpOnly, Secure, SameSite=Lax, Max-Age=15min  ← JWT access token
 *               Set by: POST /api/auth, POST /api/auth/refresh
 *               Read by: this proxy
 *
 *   spotix_rt   httpOnly, Secure, SameSite=Lax, Max-Age=30d    ← raw refresh token
 *   spotix_rtid httpOnly, Secure, SameSite=Lax, Max-Age=30d    ← Firestore doc ID
 *               Set by: POST /api/auth, POST /api/auth/refresh
 *               Read by: POST /api/auth/refresh (via request body from client)
 *
 * NOTE: refresh token cookies are httpOnly so the client JS never sees the raw
 * value. The client asks /api/auth/refresh which reads them server-side.
 *
 *  Route rules
 *
 *   Public          /login                     Always accessible
 *   Non-booker      /not-booker                Accessible only when authenticated
 *   Protected       Everything else            Requires auth + isBooker === true
 *.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAccessTokenEdge } from "@/lib/auth-edge";
import { PAYOUT_ACCESS_HEADER } from "@/lib/payout-access-gate";

//  Route classification

/** Completely public — no token required, no redirect for unauthenticated users */
const PUBLIC_ROUTES = new Set(["/login"]);

/**
 * Authenticated non-bookers land here.
 * Must be in the matcher so proxy runs on it, but only booker-check is skipped.
 */
const NON_BOOKER_ROUTES = new Set(["/not-booker"]);

//  Cookie name (must match what /api/auth sets)
const ACCESS_TOKEN_COOKIE = "spotix_at";

/** Matches /api/payout, /api/polls/payout, /api/elections/{id}/payout, and /api/listings/{id}/payout. */
function isPayoutApiRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/api/payout") ||
    pathname.startsWith("/api/polls/payout") ||
    /^\/api\/elections\/[^/]+\/payout/.test(pathname) ||
    /^\/api\/listings\/[^/]+\/payout/.test(pathname)
  );
}

/**
 * Every response proxy returns MUST be uncacheable.
 *
 * Without this, Next.js's client Router Cache / Full Route Cache is free to
 * reuse a previous auth decision (allow, or redirect-to-login) for a soft
 * client-side navigation instead of re-running this middleware against the
 * request's current cookies. That's invisible in `next dev` (which never
 * caches route responses) but very visible in production: a page that just
 * got a fresh `spotix_at` cookie via silent refresh can still get served a
 * stale "redirect to /login" decision on the very next soft navigation,
 * which looks exactly like "stuck on the preloader until I hit refresh."
 *
 * A hard refresh always "fixes" it because it bypasses the client cache and
 * forces a brand-new request through this middleware.
 */
function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store, must-revalidate");
  return response;
}

//  proxy 

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  //  0. Payout API routes — inject the server-only access secret
  // These bypass the booker page-auth flow below entirely: they're API
  // routes, they verify the `spotix_at` cookie themselves (same convention
  // as every other /api route per the matcher note), and a redirect-to-
  // /login response would be wrong for a fetch() caller anyway. This
  // proxy's only job for these paths is to attach PAYOUT_ACCESS_SECRET —
  // stripping any client-forged copy first — before the request reaches
  // the route handler.
  if (isPayoutApiRoute(pathname)) {
    const secret = process.env.PAYOUT_ACCESS_SECRET;
    const headers = new Headers(request.headers);
    headers.delete(PAYOUT_ACCESS_HEADER); // strip any forged copy
    if (secret) headers.set(PAYOUT_ACCESS_HEADER, secret);
    return noStore(NextResponse.next({ request: { headers } }));
  }

  //  1. Fully public routes 
  if (PUBLIC_ROUTES.has(pathname)) {
    const token = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
    const payload = await verifyAccessTokenEdge(token, "spotix-booker");

    // Already logged-in bookers visiting /login → home
    if (payload?.isBooker) {
      return noStore(NextResponse.redirect(new URL("/", request.url)));
    }

    // Authenticated non-bookers visiting /login → /not-booker
    if (payload && !payload.isBooker) {
      return noStore(NextResponse.redirect(new URL("/not-booker", request.url)));
    }

    // Unauthenticated → allow through to login page
    return noStore(NextResponse.next());
  }

  //  2. Verify access token 
  const token = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const payload = await verifyAccessTokenEdge(token, "spotix-booker");

  if (!payload) {
    /**
     * No valid token — could mean:
     *   a) Not logged in at all
     *   b) Access token expired (client should have refreshed; it didn't in time)
     *
     * In case (b) the browser will receive a redirect to /login, which will
     * trigger auth-client.ts to attempt a silent refresh via /api/auth/refresh,
     * then redirect back to the original path.
     *
     * We set a `redirect` search param so /login can bounce back after auth.
     */
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("redirect", pathname);
    }
    return noStore(NextResponse.redirect(loginUrl));
  }

  //  3. Non-booker routes 
  if (NON_BOOKER_ROUTES.has(pathname)) {
    // Bookers don't need to see /not-booker — send them home
    if (payload.isBooker) {
      return noStore(NextResponse.redirect(new URL("/", request.url)));
    }
    // Non-booker on /not-booker — allow
    return noStore(NextResponse.next());
  }

  //  4. Protected routes — booker check 
  if (!payload.isBooker) {
    return noStore(NextResponse.redirect(new URL("/not-booker", request.url)));
  }

  //  5. Authenticated booker — allow and forward identity headers 
  /**
   * Inject verified identity into request headers so API routes and
   * server components can read them without re-verifying the JWT.
   *
   * Usage in a server component:
   *   import { headers } from "next/headers"
   *   const uid = (await headers()).get("x-user-id")
   */
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", payload.uid);
  requestHeaders.set("x-user-email", payload.email);
  requestHeaders.set("x-user-is-booker", String(payload.isBooker));
  requestHeaders.set("x-device-id", payload.deviceId);

  return noStore(NextResponse.next({ request: { headers: requestHeaders } }));
}

//  Matcher 

export const config = {
  matcher: [
    /*
     * Run on all paths EXCEPT:
     *   - /api/*            API routes handle their own auth via verifyAccessToken()
     *   - /_next/static/*   Static build assets
     *   - /_next/image/*    Image optimisation
     *   - /favicon.ico
     *   - Any file with an image/media extension
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|otf)).*)",
    // Pulled back in specifically so PAYOUT_ACCESS_SECRET can be attached
    // server-side — see the branch 0 comment above.
    "/api/payout/:path*",
    "/api/polls/payout/:path*",
    // FIX: elections payout was missing here — this is what caused the 401.
    "/api/elections/:electionId/payout/:path*",
    "/api/listings/:listingId/payout/:path*",
  ],
};
