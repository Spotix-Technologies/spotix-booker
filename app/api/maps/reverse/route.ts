/**
 * app/api/maps/reverse/route.ts
 *
 * GET /api/maps/reverse?provider=google|mapbox|geoapify&lat=&lng=
 *
 * Turns a clicked/dragged map pin back into a human-readable address,
 * via whichever provider the current session was assigned. Doesn't touch
 * Firestore — see lib/maps/limits.ts for why usage is counted once per
 * session rather than per call.
 */

import { NextRequest, NextResponse } from "next/server"
import { authenticateMapsRequest } from "@/lib/maps/auth"
import { reverseGeocodeFor, isMapProvider } from "@/lib/maps/dispatch"

export async function GET(request: NextRequest) {
  const auth = await authenticateMapsRequest(request)
  if (auth instanceof NextResponse) return auth

  const provider = request.nextUrl.searchParams.get("provider")
  const lat = Number(request.nextUrl.searchParams.get("lat"))
  const lng = Number(request.nextUrl.searchParams.get("lng"))

  if (!isMapProvider(provider)) {
    return NextResponse.json({ success: false, error: "Invalid or missing provider" }, { status: 400 })
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ success: false, error: "Missing or invalid lat/lng query parameters" }, { status: 400 })
  }

  try {
    const address = await reverseGeocodeFor(provider, { lat, lng })
    return NextResponse.json({ success: true, address })
  } catch (error) {
    console.error(`[GET /api/maps/reverse] ${provider} failed:`, error)
    return NextResponse.json({ success: false, error: "Reverse geocoding failed" }, { status: 502 })
  }
}
