"use client"

/**
 * map-providers/google-map-canvas.tsx
 *
 * Renders an interactive Google Map using the Maps JavaScript API,
 * loaded client-side with the browser key /api/maps/session handed back
 * (only ever the key for the provider that was actually chosen — the
 * server never discloses Google's key unless Google is the session's
 * provider). Restrict this key by HTTP referrer in Google Cloud Console;
 * that's the standard way to keep a client-loaded Maps key safe, since
 * the JS API fundamentally has to run in the browser.
 *
 * The API is pulled in through ./google-loader, which awaits
 * google.maps.importLibrary() — mandatory with `loading=async`, where the
 * script's onload only means "the bootstrap stub arrived", not "the Map
 * class exists". See that file for the full explanation.
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react"
import { loadGoogleMaps, type GoogleMapsLibraries } from "./google-loader"
import { DEFAULT_MAP_ZOOM, GOOGLE_MAP_ID, SEARCH_RESULT_ZOOM } from "./constants"
import type { LatLng } from "@/lib/maps/types"
import type { MapCanvasHandle, MapCanvasProps } from "./types"

/** Accepts either a google.maps.LatLng (methods) or a plain literal. */
function toLatLngLiteral(value: any): LatLng | null {
  if (!value) return null
  const lat = typeof value.lat === "function" ? value.lat() : value.lat
  const lng = typeof value.lng === "function" ? value.lng() : value.lng
  return typeof lat === "number" && typeof lng === "number" ? { lat, lng } : null
}

export const GoogleMapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(function GoogleMapCanvas(
  { clientKey, center, marker, onMapClick, onMarkerDragEnd, onReady, onError },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const libsRef = useRef<GoogleMapsLibraries | null>(null)
  const [mapInitialised, setMapInitialised] = useState(false)

  // Latest-value refs: the map is mounted once, so callbacks captured at
  // mount time would otherwise go stale after a re-render.
  const centerRef = useRef(center)
  const onMapClickRef = useRef(onMapClick)
  const onMarkerDragEndRef = useRef(onMarkerDragEnd)
  const onReadyRef = useRef(onReady)
  const onErrorRef = useRef(onError)
  useEffect(() => {
    centerRef.current = center
    onMapClickRef.current = onMapClick
    onMarkerDragEndRef.current = onMarkerDragEnd
    onReadyRef.current = onReady
    onErrorRef.current = onError
  })

  useImperativeHandle(ref, () => ({
    flyTo: (lat, lng, zoom = SEARCH_RESULT_ZOOM) => {
      mapRef.current?.panTo({ lat, lng })
      mapRef.current?.setZoom(zoom)
    },
  }))

  const detachMarker = useCallback(() => {
    const m = markerRef.current
    if (!m) return
    // AdvancedMarkerElement detaches via .map, the classic Marker via setMap.
    if (typeof m.setMap === "function") m.setMap(null)
    else m.map = null
    markerRef.current = null
  }, [])

  // Mount the map once.
  useEffect(() => {
    let cancelled = false

    loadGoogleMaps(clientKey)
      .then((libs) => {
        if (cancelled || !containerRef.current) return
        libsRef.current = libs

        const map = new libs.maps.Map(containerRef.current, {
          center: centerRef.current,
          zoom: DEFAULT_MAP_ZOOM,
          // Only send mapId when a real Cloud-created ID is configured;
          // an invalid one triggers InvalidMapIdError and a degraded map.
          ...(GOOGLE_MAP_ID ? { mapId: GOOGLE_MAP_ID } : {}),
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        })
        mapRef.current = map

        map.addListener("click", (e: any) => {
          const pos = toLatLngLiteral(e?.latLng)
          if (pos) onMapClickRef.current(pos.lat, pos.lng)
        })

        // "idle" fires after the first tiles have settled, so the picker's
        // loading overlay clears only once there's actually a map to see.
        libs.core.event.addListenerOnce(map, "idle", () => {
          if (!cancelled) onReadyRef.current?.()
        })

        // Lets the marker effect below run now that the map exists.
        setMapInitialised(true)
      })
      .catch((err) => {
        console.error("Failed to load Google Maps:", err)
        if (!cancelled) onErrorRef.current?.("Could not load Google Maps.")
      })

    return () => {
      cancelled = true
      detachMarker()
      if (mapRef.current && libsRef.current?.core?.event) {
        libsRef.current.core.event.clearInstanceListeners(mapRef.current)
      }
      mapRef.current = null
    }
    // Intentionally mount-once — clientKey is fixed for one picker session
    // and every callback is read through a ref above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the marker in sync with `marker`.
  useEffect(() => {
    const libs = libsRef.current
    if (!mapInitialised || !mapRef.current || !libs) return

    if (!marker) {
      detachMarker()
      return
    }

    if (markerRef.current) {
      if (typeof markerRef.current.setPosition === "function") markerRef.current.setPosition(marker)
      else markerRef.current.position = marker
      return
    }

    const handleDragEnd = (e: any) => {
      const pos = toLatLngLiteral(e?.latLng) ?? toLatLngLiteral(markerRef.current?.position)
      if (pos) onMarkerDragEndRef.current(pos.lat, pos.lng)
    }

    // AdvancedMarkerElement is the current API, but it only renders on a map
    // created with a real Map ID — otherwise fall back to the classic marker.
    if (GOOGLE_MAP_ID && typeof libs.marker?.AdvancedMarkerElement === "function") {
      const advanced = new libs.marker.AdvancedMarkerElement({
        map: mapRef.current,
        position: marker,
        gmpDraggable: true,
      })
      advanced.addListener("dragend", handleDragEnd)
      markerRef.current = advanced
      return
    }

    // NOTE: the legacy Marker lives in the *marker* library — it is NOT on
    // the object returned by importLibrary("maps"). The global namespace is
    // checked last so a legacy (non-async) bootstrap still works.
    const LegacyMarker =
      (typeof libs.marker?.Marker === "function" && libs.marker.Marker) ||
      (typeof window.google?.maps?.Marker === "function" && window.google.maps.Marker) ||
      null

    if (!LegacyMarker) {
      console.error("No usable Google Maps marker class was found.")
      onErrorRef.current?.("Could not place the map marker.")
      return
    }

    const classic = new LegacyMarker({
      map: mapRef.current,
      position: marker,
      draggable: true,
    })
    classic.addListener("dragend", handleDragEnd)
    markerRef.current = classic
  }, [marker, mapInitialised, detachMarker])

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
})
