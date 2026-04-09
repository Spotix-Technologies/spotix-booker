import { NextRequest, NextResponse } from "next/server"

/**
 * middleware.ts
 *
 * Enforces session validation on protected routes.
 * Automatically attempts to refresh the access token if needed.
 *
 * Protected routes that require authentication:
 *   /dashboard, /events, /profile, /listings, /event-info
 *
 * Public routes that don't require this middleware:
 *   /login, /signup, /, /api/auth/*
 */

const PROTECTED_ROUTES = [
  "/dashboard",
  "/events",
  "/profile",
  "/listings",
  "/event-info",
]

const PUBLIC_ROUTES = [
  "/login",
  "/signup",
  "/",
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public routes and API routes to pass through
  if (PUBLIC_ROUTES.some((route) => pathname === route) || pathname.startsWith("/api/")) {
    return NextResponse.next()
  }

  // Check if this is a protected route
  const isProtected = PROTECTED_ROUTES.some((route) => pathname.startsWith(route))

  if (!isProtected) {
    return NextResponse.next()
  }

  // For protected routes, check if the refresh token cookie exists
  const refreshToken = request.cookies.get("spotix_rt")?.value
  const accessToken = request.cookies.get("spotix_at")?.value

  // If we have a refresh token, the session is valid (even if access token is expired)
  // The access token will be refreshed on the client via tryRefreshTokens()
  if (refreshToken) {
    // Session is valid, allow the request
    return NextResponse.next()
  }

  // No refresh token — user is not authenticated
  // Redirect to login with the current path as the redirect target
  const loginUrl = new URL("/login", request.url)
  loginUrl.searchParams.set("redirect", pathname)
  return NextResponse.redirect(loginUrl)
}

// Configure which routes the middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    "/((?!api|_next/static|_next/image|favicon.ico|public).*)",
  ],
}
