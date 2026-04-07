/**
 * app/api/auth/logout/session/route.ts
 *
 * POST /api/auth/logout/session
 *
 * Revokes a single refresh token by tokenId WITHOUT clearing the caller's
 * own cookies — used when the user wants to kick a specific OTHER device.
 *
 * Body: { tokenId: string }
 * Auth: spotix_at httpOnly cookie
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth-tokens";
import {
  getRefreshTokenById,
  revokeRefreshToken,
} from "@/lib/refresh-token-repo";
import { COOKIE_ACCESS_TOKEN } from "../../route";

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
  // ── 1. Auth ───────────────────────────────────────────────────────────────
  const token = request.cookies.get(COOKIE_ACCESS_TOKEN)?.value;
  if (!token) return err("UNAUTHORIZED", "Not authenticated", 401);

  let payload: { uid: string };
  try {
    payload = await verifyAccessToken(token, "spotix-booker");
  } catch {
    return err("UNAUTHORIZED", "Invalid or expired token", 401);
  }

  // ── 2. Parse body ─────────────────────────────────────────────────────────
  let tokenId: string;
  try {
    const body = await request.json();
    tokenId = body?.tokenId;
    if (!tokenId || typeof tokenId !== "string") throw new Error();
  } catch {
    return err("BAD_REQUEST", "tokenId is required", 400);
  }

  // ── 3. Verify ownership before revoking ───────────────────────────────────
  const stored = await getRefreshTokenById(tokenId);
  if (!stored) return err("NOT_FOUND", "Session not found", 404);
  if (stored.userId !== payload.uid) {
    return err("FORBIDDEN", "You cannot revoke another user's session", 403);
  }

  await revokeRefreshToken(tokenId);

  return ok({ success: true, message: "Session revoked" });
}