"use client"

/**
 * map-providers/mapbox-map-canvas.tsx
 *
 * Renders an interactive map using Mapbox GL JS, loaded from Mapbox's CDN
 * (no npm dependency needed) with the public token /api/maps/session
 * handed back. Restrict the token's allowed URLs in the Mapbox dashboard.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react"
import { loadExternalScript, loadExternalStyle } from "./script-loader"
import type { MapCanvasHandle, MapCanvasProps } from "./types"

const MAPBOX_GL_VERSION = "3.7.0"
const SCRIPT_URL = `https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_GL_VERSION}/mapbox-gl.js`
const STYLE_URL = `https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_GL_VERSION}/mapbox-gl.css`

declare global {
  interface Window {
    mapboxgl?: any
  }
}

export const MapboxMapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(function MapboxMapCanvas(
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
        if (cancelled || !containerRef.current || !window.mapboxgl) return
        window.mapboxgl.accessToken = clientKey
        mapRef.current = new window.mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/streets-v12",
          center: [center.lng, center.lat],
          zoom: 12,
        })
        mapRef.current.addControl(new window.mapboxgl.NavigationControl(), "top-right")
        mapRef.current.on("click", (e: any) => {
          onMapClick(e.lngLat.lat, e.lngLat.lng)
        })
        mapRef.current.on("load", () => onReady?.())
      })
      .catch((err) => {
        console.error("Failed to load Mapbox GL JS:", err)
        onError?.("Could not load Mapbox.")
      })

    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!mapRef.current || !window.mapboxgl) return

    if (!marker) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }

    if (!markerRef.current) {
      markerRef.current = new window.mapboxgl.Marker({ draggable: true })
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
