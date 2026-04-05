/**
 * app/api/auth/logout/route.ts
 *
 * POST /api/auth/logout
 *
 * Revokes the refresh token in Firestore and clears all auth cookies.
 * The access token (spotix_at) is short-lived (15 min) so there's no need
 * to server-side invalidate it — clearing the cookie is sufficient.
 *
 * Optional body:
 *   allDevices : boolean — if true, revoke ALL tokens for this user
 *
 * Auth: spotix_at httpOnly cookie (set by /api/auth or /api/auth/refresh)
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth-tokens";
import {
  getRefreshTokenById,
  revokeRefreshToken,
  revokeAllTokensForUser,
} from "@/lib/refresh-token-repo";
import {
  COOKIE_ACCESS_TOKEN,
  COOKIE_REFRESH_TOKEN_ID,
  clearAuthCookies,
} from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEV_TAG = "API developed and maintained by Spotix Technologies";

function ok<T extends object>(data: T) {
  return NextResponse.json({ ...data, developer: DEV_TAG });
}

function err(error: string, message: string, status: number) {
  return NextResponse.json({ error, message, developer: DEV_TAG }, { status });
}

export async function POST(request: NextRequest) {
  // ── 1. Verify access token from httpOnly cookie ──────────────────────────────
  const token = request.cookies.get(COOKIE_ACCESS_TOKEN)?.value;

  if (!token) {
    // No token — just clear cookies and succeed (idempotent logout)
    const res = ok({ success: true, message: "Logged out" });
    clearAuthCookies(res);
    return res;
  }

  let payload;
  try {
    payload = await verifyAccessToken(token, "spotix-booker");
  } catch {
    // Expired access token on logout is fine — still clear cookies
    const res = ok({ success: true, message: "Logged out" });
    clearAuthCookies(res);
    return res;
  }

  // ── 2. Parse optional body ───────────────────────────────────────────────────
  let allDevices = false;
  try {
    const body = await request.json();
    allDevices = body?.allDevices === true;
  } catch {
    // Body is optional
  }

  // ── 3. All-device logout ─────────────────────────────────────────────────────
  if (allDevices) {
    await revokeAllTokensForUser(payload.uid);
    const res = ok({ success: true, message: "Logged out from all devices" });
    clearAuthCookies(res);
    return res;
  }

  // ── 4. Single-device logout — revoke this device's refresh token ─────────────
  const refreshTokenId = request.cookies.get(COOKIE_REFRESH_TOKEN_ID)?.value;

  if (refreshTokenId) {
    const stored = await getRefreshTokenById(refreshTokenId);

    if (stored && stored.userId === payload.uid) {
      await revokeRefreshToken(refreshTokenId);
    }
    // If token not found or already revoked — treat as success
  }

  const res = ok({ success: true, message: "Logged out successfully" });
  clearAuthCookies(res);
  return res;
}