/**
 * app/api/auth/refresh/route.ts
 *
 * POST /api/auth/refresh
 *
 * Silently rotates tokens using httpOnly cookies.
 * The browser automatically sends spotix_rt + spotix_rtid (scoped to this path).
 * Client JS does NOT need to pass them in the request body — they're invisible to JS.
 *
 * Optional body:
 *   deviceMeta : object? — updated device metadata
 *
 * On success:
 *   - Issues new access token → updates spotix_at cookie + returns in body
 *   - Issues new refresh token → updates spotix_rt + spotix_rtid cookies
 *   - Old refresh token is atomically revoked in Firestore
 *
 * On failure (revoked, expired, tampered):
 *   - Clears all auth cookies
 *   - Returns 401 — client should redirect to /login
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { signAccessToken, verifyRefreshTokenHash, type DeviceMeta } from "@/lib/auth-tokens";
import {
  getRefreshTokenById,
  rotateRefreshToken,
  revokeAllTokensForUser,
} from "@/lib/refresh-token-repo";
import {
  COOKIE_ACCESS_TOKEN,
  COOKIE_REFRESH_TOKEN,
  COOKIE_REFRESH_TOKEN_ID,
  setAuthCookies,
  clearAuthCookies,
} from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEV_TAG = "API developed and maintained by Spotix Technologies";

function ok<T extends object>(data: T, status = 200) {
  return NextResponse.json({ ...data, developer: DEV_TAG }, { status });
}

function err(error: string, message: string, status: number) {
  return NextResponse.json({ error, message, developer: DEV_TAG }, { status });
}

export async function POST(request: NextRequest) {
  try {
    // ── 1. Read refresh token data from httpOnly cookies ─────────────────────
    //    These are automatically sent by the browser because the cookies are
    //    scoped to Path=/api/auth/refresh. Client JS cannot read them.
    const refreshToken = request.cookies.get(COOKIE_REFRESH_TOKEN)?.value;
    const refreshTokenId = request.cookies.get(COOKIE_REFRESH_TOKEN_ID)?.value;

    if (!refreshToken || !refreshTokenId) {
      return err("Unauthorized", "No refresh token present. Please login again.", 401);
    }

    // ── 2. Read optional deviceMeta from body ────────────────────────────────
    let deviceMeta: DeviceMeta = {};
    try {
      const body = await request.json();
      deviceMeta = body?.deviceMeta || {};
    } catch {
      // Body is optional — proceed without it
    }

    // ── 3. Fetch stored token record ─────────────────────────────────────────
    const stored = await getRefreshTokenById(refreshTokenId);

    if (!stored) {
      const res = err("Unauthorized", "Refresh token not found", 401);
      clearAuthCookies(res as unknown as NextResponse);
      return res;
    }

    // ── 4. Validate token state ──────────────────────────────────────────────

    // 4a. Revocation check — reused revoked token = possible theft
    if (stored.isRevoked) {
      console.warn(
        `[SECURITY] Revoked spotix_rt cookie presented. userId=${stored.userId}. ` +
        `Revoking all sessions as precaution.`
      );
      await revokeAllTokensForUser(stored.userId);
      const res = NextResponse.json(
        {
          error: "Unauthorized",
          message: "Token reuse detected. All sessions revoked. Please login again.",
          developer: DEV_TAG,
        },
        { status: 401 }
      );
      clearAuthCookies(res);
      return res;
    }

    // 4b. Expiry check
    if (stored.expiresAt < new Date()) {
      const res = err("Unauthorized", "Refresh token has expired. Please login again.", 401);
      clearAuthCookies(res as unknown as NextResponse);
      return res;
    }

    // 4c. Hash verification (bcrypt compare)
    const hashValid = await verifyRefreshTokenHash(refreshToken, stored.tokenHash);
    if (!hashValid) {
      console.warn(
        `[SECURITY] Refresh token hash mismatch for tokenId=${refreshTokenId}. ` +
        `Possible cookie tampering.`
      );
      const res = err("Unauthorized", "Invalid refresh token", 401);
      clearAuthCookies(res as unknown as NextResponse);
      return res;
    }

    // ── 5. Fetch up-to-date user claims ──────────────────────────────────────
    let isBooker = false;
    let email = "";

    try {
      const userDoc = await adminDb.collection("users").doc(stored.userId).get();
      if (!userDoc.exists) {
        const res = err("Not Found", "User no longer exists", 404);
        clearAuthCookies(res as unknown as NextResponse);
        return res;
      }
      const userData = userDoc.data()!;
      isBooker = userData.isBooker || false;
      email = userData.email || "";
    } catch (firestoreErr) {
      console.error("Firestore error during token refresh:", firestoreErr);
      return err("Database Error", "Unable to retrieve user data", 500);
    }

    // ── 6. Rotate refresh token (atomic Firestore transaction) ───────────────
    const {
      tokenId: newRefreshTokenId,
      rawToken: newRefreshToken,
      expiresAt: newRefreshExpiresAt,
    } = await rotateRefreshToken(
      refreshTokenId,
      stored.userId,
      stored.deviceId,
      deviceMeta
    );

    // ── 7. Sign new access token ─────────────────────────────────────────────
    const newAccessToken = await signAccessToken({
      uid: stored.userId,
      email,
      isBooker,
      deviceId: stored.deviceId,
    }, "spotix-booker");

    // ── 8. Return new tokens — update cookies ────────────────────────────────
    const response = NextResponse.json(
      {
        success: true,
        message: "Tokens rotated successfully",
        // accessToken in body for client JS memory / Authorization headers
        accessToken: newAccessToken,
        refreshExpiresAt: newRefreshExpiresAt.toISOString(),
        developer: DEV_TAG,
      },
      { status: 200 }
    );

    setAuthCookies(response, newAccessToken, newRefreshToken, newRefreshTokenId);

    return response;
  } catch (error: any) {
    console.error("Token refresh route error:", error);
    return err("Internal Server Error", "Token rotation failed", 500);
  }
}