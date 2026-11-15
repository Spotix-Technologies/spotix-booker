"use client"

/**
 * app/components/create-event/map-picker-modal.tsx
 *
 * Multi-provider event-location picker. Replaces the previous
 * Leaflet + Nominatim implementation with three key-based providers —
 * Google Maps, Mapbox, then Geoapify — tried in that order every time
 * the modal opens:
 *
 *   1. POST /api/maps/session picks whichever provider is enabled and
 *      still under its daily cap for this organizer (per-user overrides
 *      set by an admin take priority over the env-wide defaults — see
 *      lib/maps/limits.ts), and hands back a client-facing key/token for
 *      THAT provider only, plus a sessionToken.
 *   2. The matching <XMapCanvas /> renders the actual map (click/drag to
 *      drop a pin) using that key.
 *   3. Search-as-you-type goes through useAutocomplete → the server
 *      proxy routes, which use the same provider + sessionToken so
 *      keystrokes don't rack up individual billed calls.
 *
 * If every provider is unavailable/exhausted, /api/maps/session returns
 * ok:false and this renders the support message instead of a map.
 *
 * External props are unchanged from the old Leaflet version, so
 * create-one-time-event.tsx didn't need to change at all.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { X, MapPin, Search, Navigation, CheckCircle, Loader2 } from "lucide-react"
import { authFetch } from "@/lib/auth-client"
import { ResponsiveSheet } from "@/components/ui/responsive-sheet"
import { useAutocomplete } from "./map-providers/use-autocomplete"
import { GoogleMapCanvas } from "./map-providers/google-map-canvas"
import { MapboxMapCanvas } from "./map-providers/mapbox-map-canvas"
import { GeoapifyMapCanvas } from "./map-providers/geoapify-map-canvas"
import type { MapCanvasHandle } from "./map-providers/types"
import type { MapProvider, PlaceSuggestion } from "@/lib/maps/types"

interface MapPickerModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectLocation: (address: string, coordinates: { lat: number; lng: number }) => void
  currentAddress?: string
}

const defaultCenter = { lat: 6.5244, lng: 3.3792 } // Lagos, Nigeria

type SessionState =
  | { status: "loading" }
  | { status: "unavailable"; message: string }
  | { status: "error" }
  | { status: "ready"; provider: MapProvider; clientKey: string; sessionToken: string }

export function MapPickerModal({ isOpen, onClose, onSelectLocation, currentAddress }: MapPickerModalProps) {
  const [session, setSession] = useState<SessionState>({ status: "loading" })
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [selectedAddress, setSelectedAddress] = useState("")
  const [hasSearched, setHasSearched] = useState(false)
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false)
  const [isResolvingSuggestion, setIsResolvingSuggestion] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [mapReady, setMapReady] = useState(false)

  const canvasRef = useRef<MapCanvasHandle>(null)

  const provider = session.status === "ready" ? session.provider : null
  const sessionToken = session.status === "ready" ? session.sessionToken : null
  const { query, setQuery, suggestions, setSuggestions, loading: isSearching, error: searchError, setError: setSearchError } =
    useAutocomplete(provider, sessionToken)

  // Start (or restart) a provider session every time the modal opens.
  useEffect(() => {
    if (!isOpen) return

    setSession({ status: "loading" })
    setSelectedLocation(null)
    setSelectedAddress(currentAddress || "")
    setQuery(currentAddress || "")
    setHasSearched(false)
    setMapReady(false)

    let cancelled = false
    authFetch("/api/maps/session", { method: "POST" })
      .then(async (res) => {
        const data = await res.json()
        if (cancelled) return
        if (res.ok && data.success && data.ok) {
          setSession({ status: "ready", provider: data.provider, clientKey: data.clientKey, sessionToken: data.sessionToken })
        } else if (res.ok && data.success && !data.ok) {
          setSession({ status: "unavailable", message: data.message })
        } else {
          setSession({ status: "error" })
        }
      })
      .catch((err) => {
        console.error("Failed to start map session:", err)
        if (!cancelled) setSession({ status: "error" })
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const reverseGeocode = useCallback(
    async (lat: number, lng: number) => {
      if (!provider) return
      setIsReverseGeocoding(true)
      try {
        const res = await authFetch(`/api/maps/reverse?provider=${provider}&lat=${lat}&lng=${lng}`)
        const data = await res.json()
        if (res.ok && data.success && data.address) {
          setSelectedAddress(data.address)
          setQuery(data.address)
        }
      } catch (err) {
        console.error("Reverse geocoding failed:", err)
      } finally {
        setIsReverseGeocoding(false)
      }
    },
    [provider, setQuery]
  )

  const onMapClick = useCallback(
    (lat: number, lng: number) => {
      setShowSuggestions(false)
      setSelectedLocation({ lat, lng })
      reverseGeocode(lat, lng)
    },
    [reverseGeocode]
  )

  const onMarkerDragEnd = useCallback(
    (lat: number, lng: number) => {
      setSelectedLocation({ lat, lng })
      reverseGeocode(lat, lng)
    },
    [reverseGeocode]
  )

  const selectSuggestion = useCallback(
    async (suggestion: PlaceSuggestion) => {
      if (!provider || !sessionToken) return
      setShowSuggestions(false)

      if (suggestion.location) {
        // Mapbox / Geoapify already give us coordinates — no extra call needed.
        setSelectedLocation(suggestion.location)
        setSelectedAddress(suggestion.label)
        setQuery(suggestion.label)
        setHasSearched(true)
        canvasRef.current?.flyTo(suggestion.location.lat, suggestion.location.lng, 15)
        return
      }

      // Google: resolve the placeId to coordinates.
      setIsResolvingSuggestion(true)
      try {
        const res = await authFetch(
          `/api/maps/place?provider=${provider}&placeId=${encodeURIComponent(suggestion.id)}&sessionToken=${sessionToken}`
        )
        const data = await res.json()
        if (res.ok && data.success && data.location) {
          setSelectedLocation(data.location)
          setSelectedAddress(data.address || suggestion.label)
          setQuery(data.address || suggestion.label)
          setHasSearched(true)
          canvasRef.current?.flyTo(data.location.lat, data.location.lng, 15)
        } else {
          setSearchError("Could not resolve that location. Please try again.")
        }
      } catch (err) {
        console.error("Failed to resolve suggestion:", err)
        setSearchError("Could not resolve that location. Please try again.")
      } finally {
        setIsResolvingSuggestion(false)
      }
    },
    [provider, sessionToken, setQuery, setSearchError]
  )

  const handleSearchSubmit = () => {
    if (suggestions.length > 0) {
      selectSuggestion(suggestions[0])
    }
  }

  const handleDone = () => {
    if (selectedLocation && selectedAddress) {
      onSelectLocation(selectedAddress, selectedLocation)
      onClose()
    }
  }

  const handleClearLocation = () => {
    setSelectedLocation(null)
    setSelectedAddress("")
    setQuery("")
    setSuggestions([])
    setHasSearched(false)
    setSearchError("")
  }

  const renderCanvas = () => {
    if (session.status !== "ready") return null
    const shared = {
      clientKey: session.clientKey,
      center: selectedLocation ?? defaultCenter,
      marker: selectedLocation,
      onMapClick,
      onMarkerDragEnd,
      onReady: () => setMapReady(true),
      onError: () => setSession({ status: "error" }),
    }
    switch (session.provider) {
      case "google":
        return <GoogleMapCanvas ref={canvasRef} {...shared} />
      case "mapbox":
        return <MapboxMapCanvas ref={canvasRef} {...shared} />
      case "geoapify":
        return <GeoapifyMapCanvas ref={canvasRef} {...shared} />
    }
  }

  const isReady = session.status === "ready"

  return (
    <ResponsiveSheet
      open={isOpen}
      onClose={onClose}
      size="xl"
      fullHeightOnMobile
      bodyClassName="p-0"
      icon={
        <div className="flex items-center justify-center w-11 h-11 bg-gradient-to-br from-[#6b2fa5] to-purple-600 rounded-xl shadow-md">
          <MapPin className="h-5 w-5 text-white" />
        </div>
      }
      title="Pin Event Location"
      description="Select where your event will take place"
      footer={
        isReady ? (
          <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
      <button
        onClick={onClose}
        className="px-6 py-3 border-2 border-slate-300 hover:border-slate-400 rounded-lg font-semibold text-slate-700 hover:bg-slate-100 transition-all duration-200"
      >
        Cancel
      </button>
      {selectedLocation && selectedAddress && !hasSearched && (
        <button
          onClick={handleDone}
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-semibold rounded-lg transition-all duration-200 shadow-sm hover:shadow-md"
        >
          <CheckCircle className="w-5 h-5" />
          Confirm Location
        </button>
      )}
          </div>
        ) : undefined
      }
    >
      {session.status === "loading" && (
        <div className="flex h-full min-h-[16rem] items-center justify-center gap-3 p-8">
          <Loader2 className="w-6 h-6 text-[#6b2fa5] animate-spin" />
          <p className="text-lg font-semibold text-slate-900">Loading map...</p>
        </div>
      )}

      {session.status === "error" && (
        <div className="p-8 max-w-md mx-auto">
          <div className="flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4 mx-auto">
            <X className="w-8 h-8 text-red-600" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2 text-center">Map Error</h3>
          <p className="text-red-600 text-center mb-6">Could not load the map. Please try again.</p>
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-slate-200 hover:bg-slate-300 rounded-lg font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      )}

      {session.status === "unavailable" && (
        <div className="p-8 max-w-md mx-auto">
          <div className="flex items-center justify-center w-16 h-16 bg-amber-100 rounded-full mb-4 mx-auto">
            <MapPin className="w-8 h-8 text-amber-600" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2 text-center">Maps Unavailable</h3>
          <p className="text-slate-600 text-center mb-6">{session.message}</p>
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-slate-200 hover:bg-slate-300 rounded-lg font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      )}

      {isReady && (
        <div className="flex h-full min-h-[24rem] flex-col">
      {/* Helper line */}
      <div className="flex-shrink-0 px-6 pt-4 pb-1 flex items-center gap-2 text-xs text-slate-600 bg-white">
        <Navigation className="w-3.5 h-3.5 text-[#6b2fa5]" />
        <span>Click on the map or drag the marker to select your event location</span>
      </div>

      {/* Map fills the rest of the modal — search bar floats on top of it */}
      <div className="relative flex-1 min-h-0 bg-slate-100">
        {renderCanvas()}

        {!mapReady && (
          <div className="absolute inset-0 z-[900] flex items-center justify-center bg-slate-100/80">
            <div className="flex items-center gap-3 bg-white rounded-xl px-5 py-4 shadow-lg">
              <Loader2 className="w-5 h-5 text-[#6b2fa5] animate-spin" />
              <p className="text-sm font-semibold text-slate-900">Loading map...</p>
            </div>
          </div>
        )}

        {/* Floating search bar, overlaid on the map */}
        <div className="absolute top-4 left-4 right-4 sm:right-auto sm:w-[420px] z-[1000]">
          <div className="relative">
            <div className="flex gap-2">
              <div className="flex-1 relative shadow-lg rounded-lg">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setShowSuggestions(true)
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearchSubmit()}
                  placeholder="Search for a location (e.g., Victoria Island, Lagos)"
                  className="w-full pl-12 pr-4 py-3.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200 text-slate-900 placeholder:text-slate-400 bg-white"
                />
              </div>
              <button
                onClick={handleSearchSubmit}
                disabled={isSearching || !query.trim()}
                className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-[#6b2fa5] hover:bg-[#5a2589] text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg"
              >
                {isSearching || isResolvingSuggestion ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Navigation className="w-5 h-5" />
                )}
              </button>
            </div>

            {/* Autocomplete suggestions */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full mt-2 left-0 right-0 bg-white rounded-lg border border-slate-200 shadow-xl overflow-hidden max-h-64 overflow-y-auto">
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => selectSuggestion(s)}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-b-0 flex items-start gap-2 transition-colors"
                  >
                    <MapPin className="w-4 h-4 text-[#6b2fa5] mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-slate-900">{s.label}</span>
                  </button>
                ))}
              </div>
            )}

            {searchError && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {searchError}
              </div>
            )}

            {selectedAddress && (
              <div className="mt-3 p-4 bg-white rounded-lg border-2 border-[#6b2fa5]/20 shadow-lg">
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-8 h-8 bg-[#6b2fa5]/10 rounded-lg flex-shrink-0 mt-0.5">
                    <MapPin className="w-4 h-4 text-[#6b2fa5]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-600 mb-1">
                      {isReverseGeocoding ? "Looking up address..." : "Selected Location"}
                    </p>
                    <p className="text-sm text-slate-900 leading-relaxed">{selectedAddress}</p>
                  </div>
                  <button
                    onClick={handleClearLocation}
                    aria-label="Remove selected location"
                    className="flex-shrink-0 p-1.5 -mt-1 -mr-1 hover:bg-slate-100 rounded-md transition-colors duration-200 group"
                  >
                    <X className="w-4 h-4 text-slate-400 group-hover:text-slate-700 transition-colors" />
                  </button>
                </div>
              </div>
            )}

            {hasSearched && selectedLocation && (
              <button
                onClick={handleDone}
                className="mt-3 w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-semibold rounded-lg transition-all duration-200 shadow-lg"
              >
                <CheckCircle className="w-5 h-5" />
                Confirm Location
              </button>
            )}
          </div>
        </div>
      </div>
        </div>
      )}
    </ResponsiveSheet>
  )
}
