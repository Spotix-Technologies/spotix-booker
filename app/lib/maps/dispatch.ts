/**
 * lib/maps/dispatch.ts
 *
 * Thin routing layer so app/api/maps/* route handlers don't need a
 * switch statement each — they just call autocompleteFor(provider, ...)
 * etc. and this picks the right provider module.
 */

import { googleAutocomplete, googlePlaceDetails, googleReverseGeocode } from "./google"
import { mapboxAutocomplete, mapboxReverseGeocode } from "./mapbox"
import { geoapifyAutocomplete, geoapifyReverseGeocode } from "./geoapify"
import type { LatLng, MapProvider, PlaceSuggestion } from "./types"

export function isMapProvider(value: unknown): value is MapProvider {
  return value === "google" || value === "mapbox" || value === "geoapify"
}

export async function autocompleteFor(
  provider: MapProvider,
  query: string,
  sessionToken: string
): Promise<PlaceSuggestion[]> {
  switch (provider) {
    case "google":
      return googleAutocomplete(query, sessionToken)
    case "mapbox":
      return mapboxAutocomplete(query, sessionToken)
    case "geoapify":
      return geoapifyAutocomplete(query)
  }
}

export async function reverseGeocodeFor(provider: MapProvider, point: LatLng): Promise<string> {
  switch (provider) {
    case "google":
      return googleReverseGeocode(point)
    case "mapbox":
      return mapboxReverseGeocode(point)
    case "geoapify":
      return geoapifyReverseGeocode(point)
  }
}

/** Only Google needs a separate Place Details round trip — Mapbox and
 *  Geoapify already return coordinates in their autocomplete results. */
export async function placeDetailsFor(provider: MapProvider, placeId: string, sessionToken: string) {
  if (provider !== "google") {
    throw new Error(`${provider} does not require a place-details lookup`)
  }
  return googlePlaceDetails(placeId, sessionToken)
}
