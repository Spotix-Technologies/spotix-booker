/**
 * app/api/geocode/reverse/route.ts
 *
 * GET /api/geocode/reverse?lat={lat}&lng={lng}
 *
 * Server-side proxy to Nominatim's reverse-geocoding endpoint — turns a
 * clicked/dragged map pin back into a human-readable address. Replaces
 * the google.maps.Geocoder().geocode({ location }) calls that used to
 * live in map-picker-modal.tsx. See app/api/geocode/search/route.ts for
 * why this is proxied server-side rather than called from the browser.
 */

import { NextRequest, NextResponse } from "next/server"

const USER_AGENT = "SpotixBooker/1.0 (+https://booker.spotix.com.ng; support@spotix.com.ng)"

let lastRequestAt = 0
async function throttle() {
  const wait = 1100 - (Date.now() - lastRequestAt)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastRequestAt = Date.now()
}

export async function GET(request: NextRequest) {
  const lat = request.nextUrl.searchParams.get("lat")
  const lng = request.nextUrl.searchParams.get("lng")

  const latNum = Number(lat)
  const lngNum = Number(lng)
  if (!lat || !lng || isNaN(latNum) || isNaN(lngNum)) {
    return NextResponse.json({ error: "Missing or invalid lat/lng query parameters" }, { status: 400 })
  }

  try {
    await throttle()

    const url = new URL("https://nominatim.openstreetmap.org/reverse")
    url.searchParams.set("lat", String(latNum))
    url.searchParams.set("lon", String(lngNum))
    url.searchParams.set("format", "jsonv2")
    url.searchParams.set("addressdetails", "1")

    const res = await fetch(url.toString(), {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" },
    })

    if (!res.ok) {
      return NextResponse.json({ error: "Reverse geocoding failed" }, { status: 502 })
    }

    const data = (await res.json()) as any
    if (!data || data.error) {
      return NextResponse.json({ error: "No address found for this location" }, { status: 404 })
    }

    return NextResponse.json({
      displayName: data.display_name as string,
      address: data.address ?? null,
    })
  } catch (error) {
    console.error("[geocode/reverse] Nominatim request failed:", error)
    return NextResponse.json({ error: "Reverse geocoding failed" }, { status: 500 })
  }
}
