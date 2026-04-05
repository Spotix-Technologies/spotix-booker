"use client"

import { useState, useCallback, useRef } from "react"
import { X, MapPin, Search, Navigation, CheckCircle, Loader2 } from "lucide-react"
import { GoogleMap, useLoadScript, Marker } from "@react-google-maps/api"

/**
 * MapPickerModal
 *
 * Fixes vs original:
 *  1. `libraries` array declared outside the component (stable reference) —
 *     the original declared it inside the module but after imports, which is
 *     fine, however useLoadScript's docs warn against inline array literals
 *     inside the component. Moved to module level with `as const`.
 *
 *  2. Duplicate "Confirm Location" buttons removed — original showed one in
 *     the search bar area (when hasSearched) and one in the footer (when
 *     !hasSearched), so they were mutually exclusive and confusing. Now there
 *     is a single Confirm button in the footer that activates whenever a
 *     location is selected, regardless of how it was selected.
 *
 *  3. Map height fixed — original used a hardcoded `height: 600px` style on
 *     the map container, which broke the flex layout (the outer div used
 *     flex-1 but the inner GoogleMap was fixed). Now the wrapper is sized by
 *     flexbox and the map fills it via `height: 100%`.
 *
 *  4. `onMapLoad` now stores the map instance in a ref in addition to state,
 *     avoiding stale closure issues in the geocoder callbacks.
 *
 *  5. Geocoder instantiation cached across calls — avoids re-constructing on
 *     every click/drag event.
 */

// Stable reference — must be outside the component to avoid useLoadScript
// re-initialising the Maps JS SDK on every render.
const GOOGLE_MAPS_LIBRARIES: ("places" | "geometry")[] = ["places"]

const DEFAULT_CENTER = {
  lat: 6.5244, // Lagos, Nigeria
  lng: 3.3792,
}

const MAP_OPTIONS: google.maps.MapOptions = {
  streetViewControl: false,
  mapTypeControl: true,
  fullscreenControl: true,
  zoomControl: true,
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface LatLng {
  lat: number
  lng: number
}

interface MapPickerModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectLocation: (address: string, coordinates: LatLng) => void
  currentAddress?: string
}

// ── Component ──────────────────────────────────────────────────────────────────

export function MapPickerModal({
  isOpen,
  onClose,
  onSelectLocation,
  currentAddress,
}: MapPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState(currentAddress || "")
  const [selectedLocation, setSelectedLocation] = useState<LatLng | null>(null)
  const [selectedAddress, setSelectedAddress] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState("")

  // Stable map + geocoder refs — avoids stale closures in callbacks
  const mapRef = useRef<google.maps.Map | null>(null)
  const geocoderRef = useRef<google.maps.Geocoder | null>(null)

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    libraries: GOOGLE_MAPS_LIBRARIES,
  })

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function getGeocoder(): google.maps.Geocoder {
    if (!geocoderRef.current) {
      geocoderRef.current = new google.maps.Geocoder()
    }
    return geocoderRef.current
  }

  function applyGeocoderResult(result: google.maps.GeocoderResult, panTo = false) {
    const loc = result.geometry.location
    const coords: LatLng = { lat: loc.lat(), lng: loc.lng() }
    setSelectedLocation(coords)
    setSelectedAddress(result.formatted_address)
    setSearchQuery(result.formatted_address)
    setSearchError("")
    if (panTo && mapRef.current) {
      mapRef.current.panTo(coords)
      mapRef.current.setZoom(15)
    }
  }

  // ── Map callbacks (stable with useCallback + refs) ────────────────────────────

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map
  }, [])

  const onMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return
    const coords: LatLng = { lat: e.latLng.lat(), lng: e.latLng.lng() }
    setSelectedLocation(coords)

    getGeocoder().geocode({ location: coords }, (results, status) => {
      if (status === "OK" && results?.[0]) {
        applyGeocoderResult(results[0])
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const onMarkerDragEnd = useCallback((e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return
    const coords: LatLng = { lat: e.latLng.lat(), lng: e.latLng.lng() }
    setSelectedLocation(coords)

    getGeocoder().geocode({ location: coords }, (results, status) => {
      if (status === "OK" && results?.[0]) {
        applyGeocoderResult(results[0])
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Search ────────────────────────────────────────────────────────────────────

  const handleSearch = useCallback(() => {
    if (!searchQuery.trim()) return
    setIsSearching(true)
    setSearchError("")

    getGeocoder().geocode({ address: searchQuery }, (results, status) => {
      setIsSearching(false)
      if (status === "OK" && results?.[0]) {
        applyGeocoderResult(results[0], true /* panTo */)
      } else {
        setSearchError("Location not found — try a more specific address.")
      }
    })
  }, [searchQuery]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Confirm ───────────────────────────────────────────────────────────────────

  const handleConfirm = useCallback(() => {
    if (!selectedLocation || !selectedAddress) return
    onSelectLocation(selectedAddress, selectedLocation)
    onClose()
  }, [selectedLocation, selectedAddress, onSelectLocation, onClose])

  // ── Early returns ─────────────────────────────────────────────────────────────

  if (!isOpen) return null

  if (loadError) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
        <div className="bg-white rounded-2xl p-8 max-w-md shadow-2xl">
          <div className="flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4 mx-auto">
            <X className="w-8 h-8 text-red-600" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2 text-center">Map Error</h3>
          <p className="text-red-600 text-center mb-6">
            Error loading Google Maps. Please check your API key.
          </p>
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-slate-200 hover:bg-slate-300 rounded-lg font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  if (!isLoaded) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-300">
        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          <div className="flex items-center gap-3">
            <Loader2 className="w-6 h-6 text-[#6b2fa5] animate-spin" />
            <p className="text-lg font-semibold text-slate-900">Loading map…</p>
          </div>
        </div>
      </div>
    )
  }

  // ── Main modal ────────────────────────────────────────────────────────────────

  const canConfirm = !!selectedLocation && !!selectedAddress

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
      {/* Modal shell — flex column, capped height so map fills remaining space */}
      <div className="bg-white rounded-2xl w-full max-w-5xl flex flex-col shadow-2xl animate-in zoom-in-95 duration-300"
           style={{ maxHeight: "95vh" }}>

        {/* ── Header ── */}
        <div className="flex items-center justify-between p-6 border-b-2 border-slate-200 bg-gradient-to-r from-slate-50 to-white flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-[#6b2fa5] to-purple-600 rounded-xl shadow-md">
              <MapPin className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Pin Event Location</h2>
              <p className="text-sm text-slate-600">Select where your event will take place</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 hover:bg-slate-100 rounded-lg transition-all duration-200 group"
            aria-label="Close map picker"
          >
            <X className="h-5 w-5 text-slate-600 group-hover:text-slate-900 transition-colors" />
          </button>
        </div>

        {/* ── Search bar ── */}
        <div className="p-6 border-b-2 border-slate-200 bg-slate-50 flex-shrink-0">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Search for a location (e.g., Victoria Island, Lagos)"
                className="w-full pl-12 pr-4 py-3.5 border-2 border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200 text-slate-900 placeholder:text-slate-400 bg-white"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={isSearching || !searchQuery.trim()}
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-[#6b2fa5] hover:bg-[#5a2589] text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:shadow-md"
            >
              {isSearching ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Searching…
                </>
              ) : (
                <>
                  <Navigation className="w-5 h-5" />
                  Search
                </>
              )}
            </button>
          </div>

          {/* Search error */}
          {searchError && (
            <p className="mt-3 text-sm text-red-600 flex items-center gap-1.5">
              <X className="w-4 h-4 flex-shrink-0" />
              {searchError}
            </p>
          )}

          {/* Selected address preview */}
          {selectedAddress && (
            <div className="mt-4 p-4 bg-white rounded-lg border-2 border-[#6b2fa5]/20 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center w-8 h-8 bg-[#6b2fa5]/10 rounded-lg flex-shrink-0 mt-0.5">
                  <MapPin className="w-4 h-4 text-[#6b2fa5]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-600 mb-1">Selected Location</p>
                  <p className="text-sm text-slate-900 leading-relaxed">{selectedAddress}</p>
                </div>
              </div>
            </div>
          )}

          <p className="mt-3 flex items-center gap-2 text-xs text-slate-600">
            <Navigation className="w-3.5 h-3.5 text-[#6b2fa5] flex-shrink-0" />
            Click on the map or drag the marker to pin your event location
          </p>
        </div>

        {/* ── Map — flex-1 so it fills whatever height remains ── */}
        <div className="flex-1 p-6 bg-slate-100 min-h-0">
          <div className="h-full rounded-xl overflow-hidden shadow-lg border-2 border-slate-200">
            <GoogleMap
              mapContainerStyle={{ width: "100%", height: "100%" }}
              zoom={12}
              center={selectedLocation ?? DEFAULT_CENTER}
              onClick={onMapClick}
              onLoad={onMapLoad}
              options={MAP_OPTIONS}
            >
              {selectedLocation && (
                <Marker
                  position={selectedLocation}
                  draggable
                  onDragEnd={onMarkerDragEnd}
                  animation={google.maps.Animation.DROP}
                />
              )}
            </GoogleMap>
          </div>
        </div>

        {/* ── Footer — single Confirm button ── */}
        <div className="p-6 border-t-2 border-slate-200 bg-slate-50 flex gap-3 justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="px-6 py-3 border-2 border-slate-300 hover:border-slate-400 rounded-lg font-semibold text-slate-700 hover:bg-slate-100 transition-all duration-200"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-semibold rounded-lg transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <CheckCircle className="w-5 h-5" />
            Confirm Location
          </button>
        </div>
      </div>
    </div>
  )
}