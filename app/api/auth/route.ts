/**
 * app/api/auth/route.ts
 *
 * POST /api/auth  — Login: verify Firebase ID token → issue access + refresh tokens
 * GET  /api/auth  — Session check: verify access token from cookie or Authorization header
 *
 * Cookie strategy (for middleware compatibility):
 *
 *   spotix_at   httpOnly, Secure, SameSite=Lax, Max-Age=15min
 *               Contains the signed JWT access token.
 *               Read by middleware to authenticate page navigations.
 *               Also returned in the JSON body so client JS can use it
 *               for API calls via the Authorization header.
 *
 *   spotix_rt   httpOnly, Secure, SameSite=Lax, Max-Age=30d, Path=/api/auth/refresh
 *               Raw refresh token. Never readable by client JS.
 *               Only sent by the browser to the refresh endpoint.
 *
 *   spotix_rtid httpOnly, Secure, SameSite=Lax, Max-Age=30d, Path=/api/auth/refresh
 *               Firestore document ID of the stored refresh token record.
 *               Only sent by the browser to the refresh endpoint.
 *
 * The refresh endpoint reads spotix_rt + spotix_rtid from cookies directly,
 * so client JS never needs to handle raw refresh token values.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import {
  signAccessToken,
  verifyAccessToken,
  newDeviceId,
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_DAYS,
  type DeviceMeta,
} from "@/lib/auth-tokens";
import {
  revokeActiveTokensForDevice,
  issueRefreshToken,
} from "@/lib/refresh-token-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Cookie names — keep in sync with middleware.ts and /api/auth/refresh ───────
export const COOKIE_ACCESS_TOKEN = "spotix_at";
export const COOKIE_REFRESH_TOKEN = "spotix_rt";
export const COOKIE_REFRESH_TOKEN_ID = "spotix_rtid";

const IS_PROD = process.env.NODE_ENV === "production";

// ── Shared response helpers ────────────────────────────────────────────────────
const DEV_TAG = "API developed and maintained by Spotix Technologies";

function ok<T extends object>(data: T, status = 200) {
  return NextResponse.json({ ...data, developer: DEV_TAG }, { status });
}

function err(error: string, message: string, status: number, details?: string) {
  return NextResponse.json(
    { error, message, ...(details ? { details } : {}), developer: DEV_TAG },
    { status }
  );
}

/**
 * Attach all three auth cookies to a NextResponse.
 * Centralised so login and refresh set identical cookie attributes.
 */
export function setAuthCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken: string,
  refreshTokenId: string
): void {
  // Access token cookie — short-lived, sent on every request for middleware
  response.cookies.set(COOKIE_ACCESS_TOKEN, accessToken, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "lax",
    maxAge: ACCESS_TOKEN_TTL_SECONDS,
    path: "/",
  });

  // Refresh token cookies — long-lived, scoped to only reach the refresh endpoint
  const refreshMaxAge = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60;

  response.cookies.set(COOKIE_REFRESH_TOKEN, refreshToken, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "lax",
    maxAge: refreshMaxAge,
    path: "/api/auth/refresh",
  });

  response.cookies.set(COOKIE_REFRESH_TOKEN_ID, refreshTokenId, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "lax",
    maxAge: refreshMaxAge,
    path: "/api/auth/refresh",
  });
}

/**
 * Clear all three auth cookies (called on logout or fatal refresh failure).
 */
export function clearAuthCookies(response: NextResponse): void {
  response.cookies.set(COOKIE_ACCESS_TOKEN, "", { maxAge: 0, path: "/" });
  response.cookies.set(COOKIE_REFRESH_TOKEN, "", { maxAge: 0, path: "/api/auth/refresh" });
  response.cookies.set(COOKIE_REFRESH_TOKEN_ID, "", { maxAge: 0, path: "/api/auth/refresh" });
}

// ── POST /api/auth ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { idToken, deviceMeta = {} } = body as {
      idToken: string;
      deviceId?: string;
      deviceMeta?: DeviceMeta;
    };

    if (!idToken) {
      return err("Bad Request", "ID token is required", 400);
    }

    // Verify Firebase ID token
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (firebaseErr: any) {
      const isExpired =
        firebaseErr.code === "auth/id-token-expired" ||
        firebaseErr.message?.includes("expired");
      return err(
        "Unauthorized",
        isExpired
          ? "Authentication token has expired. Please login again"
          : "Invalid authentication token",
        401,
        firebaseErr.message
      );
    }

    const { uid, email } = decodedToken;
    const deviceId: string = (body.deviceId as string | undefined) || newDeviceId();

    // Fetch user profile
    let userData: FirebaseFirestore.DocumentData;
    let isBooker = false;
    let balance = 0;

    try {
      const userDoc = await adminDb.collection("users").doc(uid).get();
      if (!userDoc.exists) {
        return err("Not Found", "User profile not found", 404);
      }
      userData = userDoc.data()!;
      isBooker = userData.isBooker || false;
    } catch (firestoreErr: any) {
      console.error("Firestore user fetch error:", firestoreErr);
      return err("Database Error", "Unable to retrieve user data", 500);
    }

    // Fetch balance (non-fatal)
    try {
      const iwssDoc = await adminDb.collection("IWSS").doc(uid).get();
      if (iwssDoc.exists) balance = iwssDoc.data()?.balance || 0;
    } catch {
      // non-fatal
    }

    // Revoke existing active tokens for this device
    try {
      await revokeActiveTokensForDevice(uid, deviceId);
    } catch (revokeErr) {
      console.error("Token revocation error:", revokeErr);
    }

    // Issue new refresh token
    const {
      tokenId: refreshTokenId,
      rawToken: refreshToken,
      expiresAt: refreshExpiresAt,
    } = await issueRefreshToken(uid, deviceId, deviceMeta);

    // Sign access token (never stored, lives only in cookie + JS memory)
    const accessToken = await signAccessToken({ uid, email: email!, isBooker, deviceId }, "spotix-booker");

    // Update last login (non-fatal)
    adminDb
      .collection("users")
      .doc(uid)
      .update({ lastLogin: new Date().toISOString() })
      .catch((e) => console.error("lastLogin update failed:", e));

    // Build response
    const response = NextResponse.json(
      {
        success: true,
        message: "Session created successfully",
        // accessToken in body: client stores in memory for Authorization headers
        accessToken,
        // refreshExpiresAt in body: client uses for proactive refresh scheduling
        refreshExpiresAt: refreshExpiresAt.toISOString(),
        user: {
          uid,
          email,
          username: userData.username || "",
          fullName: userData.fullName || "",
          emailVerified: decodedToken.email_verified || false,
          isBooker,
          balance,
          createdAt: userData.createdAt || "",
          lastLogin: new Date().toISOString(),
        },
        developer: DEV_TAG,
      },
      { status: 200 }
    );

    // Set httpOnly cookies for middleware + refresh endpoint
    setAuthCookies(response, accessToken, refreshToken, refreshTokenId);

    return response;
  } catch (error: any) {
    console.error("Login route error:", error);
    return err("Internal Server Error", "An unexpected error occurred", 500, error.message);
  }
}

// ── GET /api/auth ──────────────────────────────────────────────────────────────
/**
 * Stateless session check.
 * Prefers the spotix_at cookie; falls back to Authorization header.
 */
export async function GET(request: NextRequest) {
  try {
    const cookieToken = request.cookies.get(COOKIE_ACCESS_TOKEN)?.value;
    const headerToken = request.headers.get("Authorization")?.replace("Bearer ", "");
    const token = cookieToken || headerToken;

    if (!token) {
      return ok({ authenticated: false, message: "No access token provided" });
    }

    try {
      const payload = await verifyAccessToken(token, "spotix-booker");
      return ok({
        authenticated: true,
        uid: payload.uid,
        email: payload.email,
        isBooker: payload.isBooker,
        deviceId: payload.deviceId,
      });
    } catch (jwtErr: any) {
      return ok({
        authenticated: false,
        message:
          jwtErr.code === "ERR_JWT_EXPIRED"
            ? "Access token expired"
            : "Invalid access token",
      });
    }
  } catch (error: any) {
    console.error("Session check error:", error);
    return err("Internal Server Error", "Session check failed", 500, error.message);
  }
}