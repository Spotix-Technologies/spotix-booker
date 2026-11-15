/**
 * app/api/maps/place/route.ts
 *
 * GET /api/maps/place?provider=google&placeId=...&sessionToken=...
 *
 * Only Google's autocomplete returns a bare placeId that needs a follow-up
 * Details call to resolve coordinates — Mapbox and Geoapify already embed
 * coordinates in their autocomplete suggestions, so the client never
 * calls this route for those two providers.
 */

import { NextRequest, NextResponse } from "next/server"
import { authenticateMapsRequest } from "@/lib/maps/auth"
import { placeDetailsFor, isMapProvider } from "@/lib/maps/dispatch"

export async function GET(request: NextRequest) {
  const auth = await authenticateMapsRequest(request)
  if (auth instanceof NextResponse) return auth

  const provider = request.nextUrl.searchParams.get("provider")
  const placeId = request.nextUrl.searchParams.get("placeId")
  const sessionToken = request.nextUrl.searchParams.get("sessionToken")

  if (!isMapProvider(provider)) {
    return NextResponse.json({ success: false, error: "Invalid or missing provider" }, { status: 400 })
  }
  if (!placeId || !sessionToken) {
    return NextResponse.json({ success: false, error: "Missing placeId or sessionToken" }, { status: 400 })
  }

  try {
    const place = await placeDetailsFor(provider, placeId, sessionToken)
    return NextResponse.json({ success: true, ...place })
  } catch (error) {
    console.error(`[GET /api/maps/place] ${provider} failed:`, error)
    return NextResponse.json({ success: false, error: "Failed to resolve place details" }, { status: 502 })
  }
}
