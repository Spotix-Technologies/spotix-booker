/**
 * app/api/maps/session/route.ts
 *
 * POST /api/maps/session
 *
 * Called once when the map-picker modal opens. Picks a provider (Google →
 * Mapbox → Geoapify, first one that's enabled and under its daily cap),
 * atomically counts it against today's usage, and returns the browser-
 * facing key/token for THAT provider only, plus a sessionToken to thread
 * through every subsequent autocomplete/reverse/place call this session.
 *
 * See lib/maps/limits.ts for the selection + daily-limit logic, and
 * lib/maps/config.ts for the env vars involved.
 */

import { NextRequest, NextResponse } from "next/server"
import { authenticateMapsRequest } from "@/lib/maps/auth"
import { reserveMapProviderSession } from "@/lib/maps/limits"

export async function POST(request: NextRequest) {
  const auth = await authenticateMapsRequest(request)
  if (auth instanceof NextResponse) return auth

  try {
    const result = await reserveMapProviderSession(auth.userId)
    // ok:false is a legitimate, expected outcome when every provider is
    // exhausted/unavailable — still a 200 so the client renders the
    // support message instead of a generic error state.
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error("[POST /api/maps/session] error:", error)
    return NextResponse.json({ success: false, error: "Failed to start a map session" }, { status: 500 })
  }
}
