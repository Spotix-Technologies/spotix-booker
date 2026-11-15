"use client"

/**
 * map-providers/geoapify-map-canvas.tsx
 *
 * Geoapify doesn't ship its own JS map SDK — the standard integration is
 * MapLibre GL JS (open-source, no key required for the library itself)
 * pointed at Geoapify's hosted vector style, which does take the API key
 * as a query param. Loaded from a CDN, no npm dependency needed.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react"
import { loadExternalScript, loadExternalStyle } from "./script-loader"
import type { MapCanvasHandle, MapCanvasProps } from "./types"

const MAPLIBRE_VERSION = "4.7.1"
const SCRIPT_URL = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js`
const STYLE_URL = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`

declare global {
  interface Window {
    maplibregl?: any
  }
}

export const GeoapifyMapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(function GeoapifyMapCanvas(
  { clientKey, center, marker, onMapClick, onMarkerDragEnd, onReady, onError },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)

  useImperativeHandle(ref, () => ({
    flyTo: (lat, lng, zoom = 15) => {
      mapRef.current?.flyTo({ center: [lng, lat], zoom })
    },
  }))

  useEffect(() => {
    let cancelled = false
    loadExternalStyle(STYLE_URL)

    loadExternalScript(SCRIPT_URL)
      .then(() => {
        if (cancelled || !containerRef.current || !window.maplibregl) return
        mapRef.current = new window.maplibregl.Map({
          container: containerRef.current,
          style: `https://maps.geoapify.com/v1/styles/osm-bright/style.json?apiKey=${encodeURIComponent(clientKey)}`,
          center: [center.lng, center.lat],
          zoom: 12,
        })
        mapRef.current.addControl(new window.maplibregl.NavigationControl(), "top-right")
        mapRef.current.on("click", (e: any) => {
          onMapClick(e.lngLat.lat, e.lngLat.lng)
        })
        mapRef.current.on("load", () => onReady?.())
        mapRef.current.on("error", (e: any) => {
          console.error("MapLibre/Geoapify error:", e?.error)
          onError?.("Could not load the map.")
        })
      })
      .catch((err) => {
        console.error("Failed to load MapLibre GL JS:", err)
        onError?.("Could not load the map.")
      })

    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!mapRef.current || !window.maplibregl) return

    if (!marker) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }

    if (!markerRef.current) {
      markerRef.current = new window.maplibregl.Marker({ draggable: true })
        .setLngLat([marker.lng, marker.lat])
        .addTo(mapRef.current)
      markerRef.current.on("dragend", () => {
        const pos = markerRef.current.getLngLat()
        onMarkerDragEnd(pos.lat, pos.lng)
      })
    } else {
      markerRef.current.setLngLat([marker.lng, marker.lat])
    }
  }, [marker, onMarkerDragEnd])

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
})
