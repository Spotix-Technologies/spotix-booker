/**
 * app/api/auth/sessions/route.ts
 *
 * GET /api/auth/sessions
 *
 * Returns all active (non-revoked, non-expired) refresh token sessions
 * for the authenticated user, so the logout dialog can list them.
 *
 * Auth: spotix_at httpOnly cookie
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth-tokens";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { COOKIE_ACCESS_TOKEN } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEV_TAG = "API developed and maintained by Spotix Technologies";

function err(error: string, message: string, status: number) {
  return NextResponse.json({ error, message, developer: DEV_TAG }, { status });
}

export async function GET(request: NextRequest) {
  // ── 1. Verify access token ────────────────────────────────────────────────
  const token = request.cookies.get(COOKIE_ACCESS_TOKEN)?.value;
  if (!token) return err("UNAUTHORIZED", "Not authenticated", 401);

  let payload: { uid: string };
  try {
    payload = await verifyAccessToken(token, "spotix-booker");
  } catch {
    return err("UNAUTHORIZED", "Invalid or expired token", 401);
  }

  // ── 2. Query active sessions ──────────────────────────────────────────────
  const now = Timestamp.now();
  const snap = await adminDb
    .collection("refreshTokens")
    .where("userId", "==", payload.uid)
    .where("isRevoked", "==", false)
    .where("expiresAt", ">", now)
    .orderBy("expiresAt", "desc")
    .get();

  // ── 3. Also grab the current refresh token ID to mark "this device" ───────
  const currentTokenId = request.cookies.get("spotix_rti")?.value ?? null;

  const sessions = snap.docs.map((doc) => {
    const d = doc.data();
    return {
      tokenId: doc.id,
      deviceId: d.deviceId,
      deviceMeta: d.deviceMeta || {},
      createdAt: (d.createdAt as Timestamp).toDate().toISOString(),
      lastUsedAt: (d.lastUsedAt as Timestamp).toDate().toISOString(),
      expiresAt: (d.expiresAt as Timestamp).toDate().toISOString(),
      isCurrent: doc.id === currentTokenId,
    };
  });

  return NextResponse.json({ sessions, developer: DEV_TAG });
}