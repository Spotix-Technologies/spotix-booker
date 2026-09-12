"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { X, MapPin, Search, Navigation, CheckCircle, Loader2 } from "lucide-react"
import dynamic from "next/dynamic"
import { useMapEvents } from "react-leaflet"
import "leaflet/dist/leaflet.css"

// react-leaflet's map components touch `window` on mount, so they can't
// be part of the initial server render — load them client-only, same as
// the old useLoadScript gate did for Google's script. useMapEvents itself
// is just a hook (imported normally above); it only ever runs once
// MapContainer has actually mounted on the client, so it's safe even
// though it isn't wrapped in dynamic().
const MapContainer = dynamic(() => import("react-leaflet").then((m) => m.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import("react-leaflet").then((m) => m.TileLayer), { ssr: false })
const Marker = dynamic(() => import("react-leaflet").then((m) => m.Marker), { ssr: false })

interface MapPickerModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectLocation: (address: string, coordinates: { lat: number; lng: number }) => void
  currentAddress?: string
}

const defaultCenter: [number, number] = [6.5244, 3.3792] // Lagos, Nigeria

// Leaflet's default marker icon references image files by URL, which
// breaks under Next.js's bundler unless pointed at a CDN copy explicitly.
// Done once, lazily, only on the client.
let markerIconFixed = false
async function fixDefaultMarkerIcon() {
  if (markerIconFixed) return
  const L = (await import("leaflet")).default
  delete (L.Icon.Default.prototype as any)._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  })
  markerIconFixed = true
}

export function MapPickerModal({ isOpen, onClose, onSelectLocation, currentAddress }: MapPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState(currentAddress || "")
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [selectedAddress, setSelectedAddress] = useState("")
  const [hasSearched, setHasSearched] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [searchError, setSearchError] = useState("")
  // Bumped every time the modal opens so <MapContainer key={mapInstanceKey}>
  // below is forced to mount a brand-new container <div> rather than one
  // that may still carry Leaflet's internal `_leaflet_id` from a previous
  // instance (this is what throws "Map container is being reused by
  // another instance" — most commonly seen in dev under React 18 Strict
  // Mode, which intentionally double-invokes mount effects).
  const [mapInstanceKey, setMapInstanceKey] = useState(0)
  const mapRef = useRef<any>(null)

  useEffect(() => {
    if (!isOpen) return
    setMapInstanceKey((k) => k + 1)
    fixDefaultMarkerIcon()
      .then(() => setIsReady(true))
      .catch((err) => {
        console.error("Failed to load map assets:", err)
        setLoadError(true)
      })
  }, [isOpen])

  // Explicitly dispose of the Leaflet map instance whenever the modal
  // closes or the component unmounts, so no stale instance is left
  // attached to a DOM node React might later reuse.
  useEffect(() => {
    if (isOpen) return
    mapRef.current?.remove()
    mapRef.current = null
  }, [isOpen])

  useEffect(() => {
    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    setIsReverseGeocoding(true)
    try {
      const res = await fetch(`/api/geocode/reverse?lat=${lat}&lng=${lng}`)
      const data = await res.json()
      if (res.ok && data.displayName) {
        setSelectedAddress(data.displayName)
        setSearchQuery(data.displayName)
      }
    } catch (err) {
      console.error("Reverse geocoding failed:", err)
    } finally {
      setIsReverseGeocoding(false)
    }
  }, [])

  const onMapClick = useCallback(
    (lat: number, lng: number) => {
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

  const handleSearch = async () => {
    if (!searchQuery.trim()) return

    setIsSearching(true)
    setSearchError("")
    try {
      const res = await fetch(`/api/geocode/search?q=${encodeURIComponent(searchQuery)}`)
      const data = await res.json()

      if (res.ok && data.results && data.results.length > 0) {
        const top = data.results[0]
        setSelectedLocation({ lat: top.lat, lng: top.lng })
        setSelectedAddress(top.displayName)
        setHasSearched(true)
        mapRef.current?.flyTo([top.lat, top.lng], 15)
      } else {
        setSearchError("Location not found. Please try a different search term.")
      }
    } catch (err) {
      console.error("Location search failed:", err)
      setSearchError("Location search failed. Please try again.")
    } finally {
      setIsSearching(false)
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
    setSearchQuery("")
    setHasSearched(false)
    setSearchError("")
  }

  if (!isOpen) return null

  if (loadError) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
        <div className="bg-white rounded-2xl p-8 max-w-md shadow-2xl">
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
      </div>
    )
  }

  if (!isReady) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-300">
        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          <div className="flex items-center gap-3">
            <Loader2 className="w-6 h-6 text-[#6b2fa5] animate-spin" />
            <p className="text-lg font-semibold text-slate-900">Loading map...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-0 sm:p-4 animate-in fade-in duration-300">
      <div className="bg-white rounded-none sm:rounded-2xl w-full h-full sm:h-[85vh] sm:max-w-5xl sm:max-h-[760px] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between p-6 border-b-2 border-slate-200 bg-gradient-to-r from-slate-50 to-white">
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
          >
            <X className="h-5 w-5 text-slate-600 group-hover:text-slate-900 transition-colors" />
          </button>
        </div>

        {/* Helper line */}
        <div className="flex-shrink-0 px-6 pt-4 pb-1 flex items-center gap-2 text-xs text-slate-600 bg-white">
          <Navigation className="w-3.5 h-3.5 text-[#6b2fa5]" />
          <span>Click on the map or drag the marker to select your event location</span>
        </div>

        {/* Map fills the rest of the modal — search bar floats on top of it */}
        <div className="relative flex-1 min-h-0 bg-slate-100">
          <MapContainer
            key={mapInstanceKey}
            center={selectedLocation ? [selectedLocation.lat, selectedLocation.lng] : defaultCenter}
            zoom={12}
            style={{ width: "100%", height: "100%" }}
            ref={mapRef}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapClickHandler onClick={onMapClick} />
            {selectedLocation && (
              <Marker
                position={[selectedLocation.lat, selectedLocation.lng]}
                draggable
                eventHandlers={{
                  dragend: (e: any) => {
                    const { lat, lng } = e.target.getLatLng()
                    onMarkerDragEnd(lat, lng)
                  },
                }}
              />
            )}
          </MapContainer>

          {/* Floating search bar, overlaid on the map */}
          <div className="absolute top-4 left-4 right-4 sm:right-auto sm:w-[420px] z-[1000]">
            <div className="flex gap-2">
              <div className="flex-1 relative shadow-lg rounded-lg">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="Search for a location (e.g., Victoria Island, Lagos)"
                  className="w-full pl-12 pr-4 py-3.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200 text-slate-900 placeholder:text-slate-400 bg-white"
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={isSearching || !searchQuery.trim()}
                className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-[#6b2fa5] hover:bg-[#5a2589] text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg"
              >
                {isSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Navigation className="w-5 h-5" />}
              </button>
            </div>

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

        {/* Footer */}
        <div className="flex-shrink-0 p-6 border-t-2 border-slate-200 bg-slate-50 flex gap-3 justify-end">
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
      </div>
    </div>
  )
}

// Small helper component: react-leaflet's click handling is a hook
// (useMapEvents) that has to run inside <MapContainer>, so it can't just
// be a callback passed as a prop the way GoogleMap's onClick was. It's
// never rendered server-side because its parent (MapContainer) renders
// nothing on the server, so no dynamic()/ssr:false wrapping needed here.
function MapClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}
