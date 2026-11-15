/**
 * map-providers/constants.ts
 *
 * Tunables shared by the three map canvases, kept out of the components
 * so changing a zoom level or pinning a different Maps API version is a
 * one-line edit in one place.
 */

/** Maps JS API release channel. "weekly" tracks the current weekly build. */
export const GOOGLE_MAPS_VERSION = "weekly"

/**
 * Cloud-based map styling ID.
 *
 * This MUST be a Map ID that actually exists in Google Cloud Console
 * (Google Maps Platform → Map management → Create map ID, type
 * "JavaScript"). An arbitrary string is NOT a valid Map ID — Google
 * rejects it with InvalidMapIdError and renders a degraded/blank map.
 *
 * Leave NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID unset and the map simply loads
 * with default styling (no Map ID sent at all), which is a perfectly
 * valid configuration. Set it once you've created a real ID, and the
 * picker automatically upgrades to AdvancedMarkerElement, since advanced
 * markers require a map that was created with a Map ID.
 *
 * NEXT_PUBLIC_ prefix is required: this is read in the browser.
 */
export const GOOGLE_MAP_ID = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "").trim()

/** Initial zoom when the picker opens with no pin dropped yet. */
export const DEFAULT_MAP_ZOOM = 12

/** Zoom used when flying to a location chosen from search. */
export const SEARCH_RESULT_ZOOM = 15
