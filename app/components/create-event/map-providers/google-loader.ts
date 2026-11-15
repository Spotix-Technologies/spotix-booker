/**
 * map-providers/google-loader.ts
 *
 * Loads the Google Maps JavaScript API and resolves only when it is
 * genuinely usable.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Two separate traps, both of which crash a naive `new google.maps.Map(...)`:
 *
 * 1. With `&loading=async`, maps/api/js serves a small bootstrap stub. Its
 *    <script> `onload` fires when the stub is parsed — at which point
 *    `window.google.maps` exists but the real classes have not downloaded.
 *    Hence: "window.google.maps.Map is not a constructor".
 *
 * 2. `onload` fires even when Google refuses to initialise the API at all
 *    (key blocked, Maps JavaScript API not enabled on the project, billing
 *    disabled, referrer not allow-listed). The response is a valid script
 *    that simply never populates the namespace.
 *
 * So we don't trust `onload` for readiness. We pass `callback=` and let
 * Google tell us when the API is actually up, hook `gm_authFailure` to
 * catch auth rejections with a precise message, and time out with an
 * actionable diagnostic if neither ever fires.
 *
 * Which class lives in which library (the part that trips everyone up):
 *   maps   → Map, InfoWindow, TrafficLayer, …
 *   core   → event, LatLng, LatLngBounds, ControlPosition, …
 *   marker → AdvancedMarkerElement, PinElement, AND the legacy Marker
 *
 * In particular `Marker` is NOT on the maps library. Under `loading=async`
 * the flat `google.maps.*` namespace is only populated for libraries that
 * have actually been imported, so reach for these objects, not the global.
 */

import { loadExternalScript } from "./script-loader"
import { GOOGLE_MAPS_VERSION } from "./constants"

declare global {
  interface Window {
    google?: any
    gm_authFailure?: () => void
  }
}

export interface GoogleMapsLibraries {
  /** google.maps.{Map, InfoWindow, …} */
  maps: any
  /** Core namespace — where `event` (addListenerOnce, …) lives. */
  core: any
  /** google.maps.marker.{AdvancedMarkerElement, Marker, …} — null if unavailable. */
  marker: any | null
}

/** Global name Google calls once the API is ready. Must be a global. */
const READY_CALLBACK = "__spotixGoogleMapsReady"

/** How long to wait for that callback before giving up. */
const READY_TIMEOUT_MS = 15_000

const AUTH_FAILURE_MESSAGE =
  "Google rejected the Maps browser key (gm_authFailure). Check that the key is " +
  "valid, that billing is enabled on the project, and that this origin is in the " +
  "key's HTTP-referrer allow-list."

const NEVER_INITIALISED_MESSAGE =
  "The Google Maps script loaded but the API never initialised. Usual causes: the " +
  "Maps JavaScript API is not enabled on the project, billing is not enabled, the " +
  "key is restricted to different referrers, or a browser extension blocked the " +
  "request. Open the Network tab and read the response body of the maps/api/js " +
  "request — Google states the exact reason there."

let librariesPromise: Promise<GoogleMapsLibraries> | null = null

function bootstrapUrlFor(key: string) {
  // Built by hand rather than with URLSearchParams so the commas in
  // `libraries` stay literal — Google's loader expects them unencoded.
  return (
    "https://maps.googleapis.com/maps/api/js" +
    `?key=${encodeURIComponent(key)}` +
    `&v=${GOOGLE_MAPS_VERSION}` +
    "&libraries=maps,marker" +
    "&loading=async" +
    `&callback=${READY_CALLBACK}`
  )
}

/** True once the API has fully initialised on this page. */
function apiIsReady() {
  return (
    typeof window.google?.maps?.importLibrary === "function" ||
    typeof window.google?.maps?.Map === "function"
  )
}

/** Injects the bootstrap and waits for Google's own ready callback. */
function waitForApi(clientKey: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // Already initialised by an earlier mount — the callback fires once per
    // page load and won't fire again, so short-circuit.
    if (apiIsReady()) {
      resolve()
      return
    }

    let settled = false
    const finish = (err?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (err) reject(err)
      else resolve()
    }

    const timer = setTimeout(() => finish(new Error(NEVER_INITIALISED_MESSAGE)), READY_TIMEOUT_MS)

    // Google invokes this the moment the API is usable.
    ;(window as any)[READY_CALLBACK] = () => finish()

    // Google invokes this on any authentication/authorisation rejection.
    // It is the single most informative signal available for a bad key.
    window.gm_authFailure = () => {
      console.error(AUTH_FAILURE_MESSAGE)
      finish(new Error(AUTH_FAILURE_MESSAGE))
    }

    loadExternalScript(bootstrapUrlFor(clientKey)).catch((err) =>
      finish(
        new Error(
          `Could not fetch the Google Maps script (${
            err instanceof Error ? err.message : String(err)
          }). It may have been blocked by an extension, a firewall, or CSP.`
        )
      )
    )
  })
}

/**
 * Resolves once the Maps API is genuinely usable. Safe to call from every
 * mount — the underlying work happens at most once per page load.
 */
export function loadGoogleMaps(clientKey: string): Promise<GoogleMapsLibraries> {
  if (librariesPromise) return librariesPromise

  librariesPromise = (async () => {
    if (!clientKey) {
      throw new Error("No Google Maps browser key was provided for this session")
    }

    await waitForApi(clientKey)

    const importLibrary = window.google?.maps?.importLibrary

    // Legacy (non-async) bootstrap already on the page from elsewhere: the
    // classes sit directly on the namespace and importLibrary may not exist.
    if (typeof importLibrary !== "function") {
      if (typeof window.google?.maps?.Map === "function") {
        return {
          maps: window.google.maps,
          core: window.google.maps,
          marker: window.google.maps.marker ?? window.google.maps,
        }
      }
      throw new Error(NEVER_INITIALISED_MESSAGE)
    }

    // Must be invoked on google.maps so `this` is bound correctly.
    const [maps, core] = await Promise.all([
      window.google.maps.importLibrary("maps"),
      window.google.maps.importLibrary("core"),
    ])

    // Optional: the canvas degrades to the legacy marker without it.
    const marker = await window.google.maps.importLibrary("marker").catch((err: unknown) => {
      console.warn("Google Maps marker library unavailable, falling back:", err)
      return null
    })

    return { maps, core, marker }
  })()

  // Don't cache a rejection — a transient failure (or a fixed console
  // setting) shouldn't break the picker for the rest of the session.
  librariesPromise.catch(() => {
    librariesPromise = null
  })

  return librariesPromise
}
