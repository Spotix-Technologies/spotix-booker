/**
 * lib/maps/types.ts
 *
 * Shared types for the multi-provider map system (Google Maps → Mapbox →
 * Geoapify, in that order). One small file so every server route and
 * client component agrees on the same shapes.
 */

/** The three supported map/geocoding providers, tried in this order. */
export const MAP_PROVIDERS = ["google", "mapbox", "geoapify"] as const
export type MapProvider = (typeof MAP_PROVIDERS)[number]

export interface LatLng {
  lat: number
  lng: number
}

/** A single autocomplete suggestion, normalized across all three providers. */
export interface PlaceSuggestion {
  /** Opaque id — for Google this is a real placeId that needs a Details
   *  call to resolve coordinates; for Mapbox/Geoapify it's a synthetic id
   *  and `location` is already populated, so no follow-up call is needed. */
  id: string
  label: string
  /** Present for Mapbox/Geoapify (their autocomplete responses include
   *  coordinates directly). Absent for Google — resolve via /api/maps/place. */
  location?: LatLng
}

export interface ResolvedPlace {
  address: string
  location: LatLng
}

/** Per-user override for one provider, stored at
 *  users/{userId}/settings/mapAccess. `null`/absent fields inherit the
 *  env-wide default. */
export interface ProviderOverride {
  /** true = force on, false = force off, undefined = inherit env IS_*_AVAILABLE */
  enabled?: boolean
  /** overrides the env daily-call cap for just this user */
  dailyLimit?: number
}

export type MapAccessOverrides = Partial<Record<MapProvider, ProviderOverride>>

/** What /api/maps/session hands back to the client. */
export type MapSessionResult =
  | {
      ok: true
      provider: MapProvider
      /** Browser-facing key/token for the chosen provider only — the other
       *  two providers' keys are never sent to the client. */
      clientKey: string
      sessionToken: string
    }
  | {
      ok: false
      message: string
    }
