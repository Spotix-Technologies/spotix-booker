/**
 * lib/maps/config.ts
 *
 * Every env var the maps system reads, in one place, so renaming one
 * later is a one-line change instead of a grep-and-replace across routes.
 *
 * For each provider there are two toggles:
 *   MAX_<PROVIDER>_MAPS_CALL  — number, daily call budget per organizer
 *   IS_<PROVIDER>_AVAILABLE   — "1" or "0", kill switch for the whole provider
 *
 * Google's names match exactly what was asked for (`Max_Google_Maps_Call`,
 * `is_GMAPS_AVAILABLE`); Mapbox/Geoapify follow the same shape.
 *
 * Provider order is fixed: google → mapbox → geoapify. If a provider is
 * unavailable or has hit its daily cap, the next one in the list is used.
 * If all three are unavailable, the caller gets a message pointing at
 * support@spotix.com.ng — see lib/maps/limits.ts.
 */

import type { MapProvider } from "./types"

export const PROVIDER_ORDER: MapProvider[] = ["google", "mapbox", "geoapify"]

export const NO_PROVIDER_MESSAGE =
  "You've either hit daily maps calls on all our providers or no map provider is available. Contact support (support@spotix.com.ng)"

interface ProviderEnvConfig {
  /** Env var holding the daily call cap, e.g. Max_Google_Maps_Call */
  maxCallsEnvVar: string
  /** Env var holding the "1"/"0" availability kill switch */
  availableEnvVar: string
  /** Fallback cap used only if the env var above is unset/invalid */
  defaultMaxCalls: number
}

export const PROVIDER_ENV: Record<MapProvider, ProviderEnvConfig> = {
  google: {
    maxCallsEnvVar: "Max_Google_Maps_Call",
    availableEnvVar: "is_GMAPS_AVAILABLE",
    defaultMaxCalls: 200,
  },
  mapbox: {
    maxCallsEnvVar: "Max_Mapbox_Maps_Call",
    availableEnvVar: "is_MAPBOX_AVAILABLE",
    defaultMaxCalls: 500,
  },
  geoapify: {
    maxCallsEnvVar: "Max_Geoapify_Maps_Call",
    availableEnvVar: "is_GEOAPIFY_AVAILABLE",
    defaultMaxCalls: 500,
  },
}

/** Server-side API keys — never sent to the client as-is. */
export const PROVIDER_SERVER_KEY_ENV: Record<MapProvider, string> = {
  google: "GOOGLE_MAPS_SERVER_KEY",
  mapbox: "MAPBOX_SECRET_TOKEN",
  geoapify: "GEOAPIFY_API_KEY",
}

/**
 * Browser-facing key/token for the provider actually chosen for a session.
 * Google and Mapbox support issuing a separate, more-restricted key for
 * client use (HTTP-referrer-restricted in each console) — falls back to
 * the server key if a dedicated browser key isn't configured. Geoapify's
 * key is designed to be used client-side (restrict by domain in their
 * dashboard) so it reuses the same key either way.
 */
export const PROVIDER_BROWSER_KEY_ENV: Record<MapProvider, string> = {
  google: "GOOGLE_MAPS_BROWSER_KEY",
  mapbox: "MAPBOX_PUBLIC_TOKEN",
  geoapify: "GEOAPIFY_API_KEY",
}

export function isProviderEnabledByEnv(provider: MapProvider): boolean {
  const raw = process.env[PROVIDER_ENV[provider].availableEnvVar]
  return raw === "1"
}

export function envMaxCalls(provider: MapProvider): number {
  const raw = process.env[PROVIDER_ENV[provider].maxCallsEnvVar]
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : PROVIDER_ENV[provider].defaultMaxCalls
}

export function serverKeyFor(provider: MapProvider): string | undefined {
  return process.env[PROVIDER_SERVER_KEY_ENV[provider]]
}

export function browserKeyFor(provider: MapProvider): string | undefined {
  return process.env[PROVIDER_BROWSER_KEY_ENV[provider]] || serverKeyFor(provider)
}

/** Today's date key, e.g. "2026-09-16" — used as the limits sub-doc id.
 *  Deliberately UTC-based so it resets at a fixed, predictable instant
 *  everywhere regardless of server region. */
export function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}
