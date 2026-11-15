/**
 * app/api/maps/autocomplete/route.ts
 *
 * GET /api/maps/autocomplete?provider=google|mapbox|geoapify&q=...&sessionToken=...
 *
 * Server-side proxy so none of the three providers' API keys ever reach
 * the browser for this call. `sessionToken` is the one issued by
 * /api/maps/session for this map-picker session — it does not cause a
 * new Firestore read/write here (the daily counter was already
 * incremented once when the session was reserved; see lib/maps/limits.ts
 * for why counting per-session rather than per-keystroke is both correct
 * and cheap).
 */

import { NextRequest, NextResponse } from "next/server"
import { authenticateMapsRequest } from "@/lib/maps/auth"
import { autocompleteFor, isMapProvider } from "@/lib/maps/dispatch"

export async function GET(request: NextRequest) {
  const auth = await authenticateMapsRequest(request)
  if (auth instanceof NextResponse) return auth

  const provider = request.nextUrl.searchParams.get("provider")
  const q = request.nextUrl.searchParams.get("q")?.trim()
  const sessionToken = request.nextUrl.searchParams.get("sessionToken")

  if (!isMapProvider(provider)) {
    return NextResponse.json({ success: false, error: "Invalid or missing provider" }, { status: 400 })
  }
  if (!q) {
    return NextResponse.json({ success: false, error: "Missing required query parameter: q" }, { status: 400 })
  }
  if (!sessionToken) {
    return NextResponse.json({ success: false, error: "Missing sessionToken" }, { status: 400 })
  }

  try {
    const suggestions = await autocompleteFor(provider, q, sessionToken)
    return NextResponse.json({ success: true, suggestions })
  } catch (error) {
    console.error(`[GET /api/maps/autocomplete] ${provider} failed:`, error)
    return NextResponse.json({ success: false, error: "Location search failed" }, { status: 502 })
  }
}
