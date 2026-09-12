/**
 * app/api/geocode/search/route.ts
 *
 * GET /api/geocode/search?q={freeText}
 *
 * Thin server-side proxy to OpenStreetMap's Nominatim search API — this
 * replaces the Google Maps Geocoder that map-picker-modal.tsx used to call
 * directly from the browser. Free, no API key, no billing.
 *
 * Why proxy instead of calling Nominatim straight from the client:
 *  - Nominatim's usage policy (https://operations.osmfoundation.org/policies/nominatim/)
 *    requires a real identifying User-Agent — browsers won't let client JS
 *    set that header, so this has to go through a server route.
 *  - Same policy asks for max ~1 request/second per app — the debounce
 *    below plus this being a single shared route gives us one throttle
 *    point instead of every browser tab hammering Nominatim independently.
 *  - Keeps us free to swap providers later (e.g. self-hosted Nominatim,
 *    Mapbox, LocationIQ) without touching map-picker-modal.tsx at all.
 */

import { NextRequest, NextResponse } from "next/server"

// Contact info in the User-Agent, per Nominatim's policy — replace with a
// real support address/domain before shipping.
const USER_AGENT = "SpotixBooker/1.0 (+https://booker.spotix.com.ng; support@spotix.com.ng)"

// Extremely light in-memory throttle — one Nominatim request in flight at
// a time, min 1100ms between calls, matching their "max 1 req/s" policy.
// Best-effort only (resets on cold start / doesn't coordinate across
// serverless instances) — good enough for a low-traffic internal proxy.
let lastRequestAt = 0
async function throttle() {
  const wait = 1100 - (Date.now() - lastRequestAt)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastRequestAt = Date.now()
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim()
  if (!q) {
    return NextResponse.json({ error: "Missing required query parameter: q" }, { status: 400 })
  }

  try {
    await throttle()

    const url = new URL("https://nominatim.openstreetmap.org/search")
    url.searchParams.set("q", q)
    url.searchParams.set("format", "jsonv2")
    url.searchParams.set("addressdetails", "1")
    url.searchParams.set("limit", "5")

    const res = await fetch(url.toString(), {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" },
      // Nominatim results for a given query are stable enough to cache
      // briefly — cuts repeat lookups for popular venue names.
      next: { revalidate: 60 },
    })

    if (!res.ok) {
      return NextResponse.json({ error: "Location search failed" }, { status: 502 })
    }

    const results = (await res.json()) as any[]

    return NextResponse.json({
      results: results.map((r) => ({
        displayName: r.display_name as string,
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
      })),
    })
  } catch (error) {
    console.error("[geocode/search] Nominatim request failed:", error)
    return NextResponse.json({ error: "Location search failed" }, { status: 500 })
  }
}
