/**
 * lib/maps/google.ts
 *
 * Server-side calls to Google's Places API (New) and Geocoding API.
 * GOOGLE_MAPS_SERVER_KEY never leaves this file — the browser only ever
 * gets GOOGLE_MAPS_BROWSER_KEY (a separate, HTTP-referrer-restricted key,
 * see lib/maps/config.ts), used solely to load the Maps JS renderer.
 *
 * sessionToken is threaded through autocomplete + placeDetails exactly as
 * Google's docs describe, so a full search (many keystrokes + one details
 * call) bills as a single Autocomplete session instead of per-request.
 */

import { serverKeyFor } from "./config"
import type { LatLng, PlaceSuggestion, ResolvedPlace } from "./types"

function requireKey(): string {
  const key = serverKeyFor("google")
  if (!key) throw new Error("GOOGLE_MAPS_SERVER_KEY is not configured")
  return key
}

export async function googleAutocomplete(query: string, sessionToken: string): Promise<PlaceSuggestion[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": requireKey(),
    },
    body: JSON.stringify({ input: query, sessionToken }),
  })

  if (!res.ok) {
    console.error("[maps/google] autocomplete failed:", res.status, await res.text().catch(() => ""))
    throw new Error("Google autocomplete request failed")
  }

  const data = (await res.json()) as any
  const suggestions = (data.suggestions ?? []) as any[]

  return suggestions
    .filter((s) => s.placePrediction)
    .map((s) => ({
      id: s.placePrediction.placeId as string,
      label: (s.placePrediction.text?.text as string) ?? "",
    }))
}

export async function googlePlaceDetails(placeId: string, sessionToken: string): Promise<ResolvedPlace> {
  const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`)
  url.searchParams.set("sessionToken", sessionToken)

  const res = await fetch(url.toString(), {
    headers: {
      "X-Goog-Api-Key": requireKey(),
      "X-Goog-FieldMask": "id,formattedAddress,location",
    },
  })

  if (!res.ok) {
    console.error("[maps/google] place details failed:", res.status, await res.text().catch(() => ""))
    throw new Error("Google place details request failed")
  }

  const data = (await res.json()) as any
  if (!data.location) throw new Error("Google place details returned no location")

  return {
    address: data.formattedAddress ?? "",
    location: { lat: data.location.latitude, lng: data.location.longitude },
  }
}

export async function googleReverseGeocode(point: LatLng): Promise<string> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json")
  url.searchParams.set("latlng", `${point.lat},${point.lng}`)
  url.searchParams.set("key", requireKey())

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error("Google reverse geocode request failed")

  const data = (await res.json()) as any
  if (data.status !== "OK" || !data.results?.length) {
    throw new Error(`Google reverse geocode returned status ${data.status}`)
  }

  return data.results[0].formatted_address as string
}
