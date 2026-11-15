/**
 * lib/maps/mapbox.ts
 *
 * Server-side calls to Mapbox's Geocoding API v6. Used as the second map
 * provider — generous free tier (100k geocoding requests/month, 50k map
 * loads/month as of writing), no billing surprises for a low/mid-traffic
 * app. Forward geocoding results already include coordinates, so unlike
 * Google there's no separate "place details" round trip needed —
 * selecting a suggestion resolves instantly client-side.
 */

import { serverKeyFor } from "./config"
import type { LatLng, PlaceSuggestion } from "./types"

function requireToken(): string {
  const token = serverKeyFor("mapbox")
  if (!token) throw new Error("MAPBOX_SECRET_TOKEN is not configured")
  return token
}

export async function mapboxAutocomplete(query: string, sessionToken: string): Promise<PlaceSuggestion[]> {
  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward")
  url.searchParams.set("q", query)
  url.searchParams.set("autocomplete", "true")
  url.searchParams.set("limit", "5")
  url.searchParams.set("access_token", requireToken())
  // Mapbox doesn't meter by session token the way Google does, but passing
  // one groups requests in their dashboard/logs for the same search.
  url.searchParams.set("session_token", sessionToken)

  const res = await fetch(url.toString())
  if (!res.ok) {
    console.error("[maps/mapbox] forward geocode failed:", res.status, await res.text().catch(() => ""))
    throw new Error("Mapbox search request failed")
  }

  const data = (await res.json()) as any
  const features = (data.features ?? []) as any[]

  return features.map((f, i) => ({
    id: f.properties?.mapbox_id ?? `mapbox-${i}`,
    label: f.properties?.full_address ?? f.properties?.name ?? "",
    location: { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] },
  }))
}

export async function mapboxReverseGeocode(point: LatLng): Promise<string> {
  const url = new URL("https://api.mapbox.com/search/geocode/v6/reverse")
  url.searchParams.set("longitude", String(point.lng))
  url.searchParams.set("latitude", String(point.lat))
  url.searchParams.set("access_token", requireToken())

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error("Mapbox reverse geocode request failed")

  const data = (await res.json()) as any
  const feature = data.features?.[0]
  if (!feature) throw new Error("Mapbox reverse geocode returned no results")

  return feature.properties?.full_address ?? feature.properties?.name ?? ""
}
