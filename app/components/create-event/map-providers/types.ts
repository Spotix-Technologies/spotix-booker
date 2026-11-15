import type { LatLng } from "@/lib/maps/types"

/** Common props every provider's <XMapCanvas /> implements identically,
 *  so map-picker-modal.tsx can swap between them without special-casing. */
export interface MapCanvasProps {
  /** Browser-facing key/token for this session's chosen provider. */
  clientKey: string
  center: LatLng
  marker: LatLng | null
  onMapClick: (lat: number, lng: number) => void
  onMarkerDragEnd: (lat: number, lng: number) => void
  onReady?: () => void
  onError?: (message: string) => void
}

/** Imperative handle so the modal can fly the map to a searched location. */
export interface MapCanvasHandle {
  flyTo: (lat: number, lng: number, zoom?: number) => void
}
