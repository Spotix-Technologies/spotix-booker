/**
 * lib/maps/auth.ts
 *
 * Same spotix_at cookie / Bearer token check used by
 * app/api/create-event/draft/route.ts, shared across all /api/maps/*
 * routes so it isn't re-implemented four times.
 */

import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyAccessToken } from "@/lib/auth-tokens"

export async function authenticateMapsRequest(
  request: NextRequest
): Promise<{ userId: string } | NextResponse> {
  const cookieStore = await cookies()
  const cookieToken = cookieStore.get("spotix_at")?.value
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const token = cookieToken || bearer
  if (!token) {
    return NextResponse.json({ success: false, error: "No access token" }, { status: 401 })
  }
  try {
    const payload = await verifyAccessToken(token, "spotix-booker")
    return { userId: payload.uid }
  } catch {
    return NextResponse.json({ success: false, error: "Invalid or expired access token" }, { status: 401 })
  }
}
