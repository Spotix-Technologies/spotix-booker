"use client"

import { useState, useCallback } from "react"
import { X, MapPin, Search, Navigation, CheckCircle, Loader2 } from "lucide-react"
import { GoogleMap, useLoadScript, Marker } from "@react-google-maps/api"

const libraries: ("places" | "geometry" | "drawing" | "visualization")[] = ["places"]

interface MapPickerModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectLocation: (address: string, coordinates: { lat: number; lng: number }) => void
  currentAddress?: string
}

const mapContainerStyle = {
  width: "100%",
  height: "600px", 
}

const defaultCenter = {
  lat: 6.5244, // Lagos, Nigeria
  lng: 3.3792,
}

export function MapPickerModal({ isOpen, onClose, onSelectLocation, currentAddress }: MapPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState(currentAddress || "")
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [selectedAddress, setSelectedAddress] = useState("")
  const [map, setMap] = useState<google.maps.Map | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [isSearching, setIsSearching] = useState(false)

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    libraries,
  })

  const onMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (e.latLng) {
      const lat = e.latLng.lat()
      const lng = e.latLng.lng()
      setSelectedLocation({ lat, lng })

      // Reverse geocode to get address
      const geocoder = new google.maps.Geocoder()
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        if (status === "OK" && results && results[0]) {
          setSelectedAddress(results[0].formatted_address)
          setSearchQuery(results[0].formatted_address)
        }
      })
    }
  }, [])

  const onMarkerDragEnd = useCallback((e: google.maps.MapMouseEvent) => {
    if (e.latLng) {
      const lat = e.latLng.lat()
      const lng = e.latLng.lng()
      setSelectedLocation({ lat, lng })

      // Reverse geocode to get address
      const geocoder = new google.maps.Geocoder()
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        if (status === "OK" && results && results[0]) {
          setSelectedAddress(results[0].formatted_address)
          setSearchQuery(results[0].formatted_address)
        }
      })
    }
  }, [])

  const handleSearch = () => {
    if (!searchQuery.trim() || !map) return

    setIsSearching(true)
    const geocoder = new google.maps.Geocoder()
    geocoder.geocode({ address: searchQuery }, (results, status) => {
      setIsSearching(false)
      if (status === "OK" && results && results[0]) {
        const location = results[0].geometry.location
        const lat = location.lat()
        const lng = location.lng()

        setSelectedLocation({ lat, lng })
        setSelectedAddress(results[0].formatted_address)
        setHasSearched(true)
        map.panTo({ lat, lng })
        map.setZoom(15)
      } else {
        alert("Location not found. Please try a different search term.")
      }
    })
  }

  const handleDone = () => {
    if (selectedLocation && selectedAddress) {
      onSelectLocation(selectedAddress, selectedLocation)
      onClose()
    }
  }

  const onMapLoad = useCallback((map: google.maps.Map) => {
    setMap(map)
  }, [])

  if (!isOpen) return null

  if (loadError) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
        <div className="bg-white rounded-2xl p-8 max-w-md shadow-2xl">
          <div className="flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4 mx-auto">
            <X className="w-8 h-8 text-red-600" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2 text-center">Map Error</h3>
          <p className="text-red-600 text-center mb-6">Error loading Google Maps. Please check your API key.</p>
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
            <p className="text-lg font-semibold text-slate-900">Loading map...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
      <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b-2 border-slate-200 bg-gradient-to-r from-slate-50 to-white">
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

        {/* Search Bar */}
        <div className="p-6 border-b-2 border-slate-200 bg-slate-50">
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
            <div className="flex gap-2">
              <button
                onClick={handleSearch}
                disabled={isSearching || !searchQuery.trim()}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-[#6b2fa5] hover:bg-[#5a2589] text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:shadow-md"
              >
                {isSearching ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Navigation className="w-5 h-5" />
                    Search
                  </>
                )}
              </button>
              {hasSearched && selectedLocation && (
                <button
                  onClick={handleDone}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-semibold rounded-lg transition-all duration-200 shadow-sm hover:shadow-md"
                >
                  <CheckCircle className="w-5 h-5" />
                  Confirm Location
                </button>
              )}
            </div>
          </div>
          
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
          
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-600">
            <Navigation className="w-3.5 h-3.5 text-[#6b2fa5]" />
            <span>Click on the map or drag the marker to select your event location</span>
          </div>
        </div>

        {/* Map Container - Increased height */}
        <div className="flex-1 p-6 bg-slate-100">
          <div className="h-full rounded-xl overflow-hidden shadow-lg border-2 border-slate-200">
            <GoogleMap
              mapContainerStyle={mapContainerStyle}
              zoom={12}
              center={selectedLocation || defaultCenter}
              onClick={onMapClick}
              onLoad={onMapLoad}
              options={{
                streetViewControl: false,
                mapTypeControl: true,
                fullscreenControl: true,
                zoomControl: true,
              }}
            >
              {selectedLocation && (
                <Marker 
                  position={selectedLocation} 
                  draggable={true} 
                  onDragEnd={onMarkerDragEnd}
                  animation={google.maps.Animation.DROP}
                />
              )}
            </GoogleMap>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t-2 border-slate-200 bg-slate-50 flex gap-3 justify-end">
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