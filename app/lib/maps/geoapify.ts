/**
 * lib/maps/geoapify.ts
 *
 * Server-side calls to Geoapify's Geocoding API (autocomplete + reverse).
 * Third and final fallback provider — 3,000 free credits/day as of
 * writing (1 credit ≈ 1 request), which combined with only being reached
 * after Google *and* Mapbox are both exhausted makes it very unlikely to
 * be hit hard in practice. Like Mapbox, results already carry coordinates
 * so no separate details call is needed.
 */

import { serverKeyFor } from "./config"
import type { LatLng, PlaceSuggestion } from "./types"

function requireKey(): string {
  const key = serverKeyFor("geoapify")
  if (!key) throw new Error("GEOAPIFY_API_KEY is not configured")
  return key
}

export async function geoapifyAutocomplete(query: string): Promise<PlaceSuggestion[]> {
  const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete")
  url.searchParams.set("text", query)
  url.searchParams.set("limit", "5")
  url.searchParams.set("apiKey", requireKey())

  const res = await fetch(url.toString())
  if (!res.ok) {
    console.error("[maps/geoapify] autocomplete failed:", res.status, await res.text().catch(() => ""))
    throw new Error("Geoapify autocomplete request failed")
  }

  const data = (await res.json()) as any
  const features = (data.features ?? []) as any[]

  return features.map((f, i) => ({
    id: f.properties?.place_id ?? `geoapify-${i}`,
    label: f.properties?.formatted ?? "",
    location: { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] },
  }))
}

export async function geoapifyReverseGeocode(point: LatLng): Promise<string> {
  const url = new URL("https://api.geoapify.com/v1/geocode/reverse")
  url.searchParams.set("lat", String(point.lat))
  url.searchParams.set("lon", String(point.lng))
  url.searchParams.set("apiKey", requireKey())

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error("Geoapify reverse geocode request failed")

  const data = (await res.json()) as any
  const feature = data.features?.[0]
  if (!feature) throw new Error("Geoapify reverse geocode returned no results")

  return feature.properties?.formatted ?? ""
}
