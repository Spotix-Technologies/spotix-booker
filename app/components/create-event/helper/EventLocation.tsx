import React, { useState, useEffect } from "react"
import { MapPin, MapPinned, CheckCircle, Navigation, ChevronDown, ChevronUp } from "lucide-react"

interface EventLocationProps {
  eventVenue: string
  setEventVenue: (value: string) => void
  venueCoordinates: { lat: number; lng: number } | null
  setVenueCoordinates: (coords: { lat: number; lng: number } | null) => void
  onOpenMapPicker: () => void
}

function isValidLat(val: string) {
  const n = parseFloat(val)
  return !isNaN(n) && n >= -90 && n <= 90
}

function isValidLng(val: string) {
  const n = parseFloat(val)
  return !isNaN(n) && n >= -180 && n <= 180
}

export function EventLocation({
  eventVenue,
  setEventVenue,
  venueCoordinates,
  setVenueCoordinates,
  onOpenMapPicker,
}: EventLocationProps) {
  const [showManualCoords, setShowManualCoords] = useState(false)
  const [latInput, setLatInput] = useState(venueCoordinates?.lat?.toString() ?? "")
  const [lngInput, setLngInput] = useState(venueCoordinates?.lng?.toString() ?? "")
  const [coordError, setCoordError] = useState("")

  // If coordinates are set externally (e.g. from map picker), sync inputs
  useEffect(() => {
    if (venueCoordinates) {
      setLatInput(venueCoordinates.lat.toString())
      setLngInput(venueCoordinates.lng.toString())
    }
  }, [venueCoordinates])

  // When address is typed manually, clear coordinates until user provides them
  const handleVenueChange = (value: string) => {
    setEventVenue(value)
    // If they clear the address, also clear coords
    if (!value.trim()) {
      setVenueCoordinates(null)
      setLatInput("")
      setLngInput("")
      setCoordError("")
    }
  }

  const handleApplyCoords = () => {
    setCoordError("")
    if (!latInput.trim() || !lngInput.trim()) {
      setCoordError("Both latitude and longitude are required.")
      return
    }
    if (!isValidLat(latInput)) {
      setCoordError("Latitude must be between -90 and 90.")
      return
    }
    if (!isValidLng(lngInput)) {
      setCoordError("Longitude must be between -180 and 180.")
      return
    }
    setVenueCoordinates({ lat: parseFloat(latInput), lng: parseFloat(lngInput) })
    setCoordError("")
  }

  const handleClearCoords = () => {
    setVenueCoordinates(null)
    setLatInput("")
    setLngInput("")
    setCoordError("")
  }

  // Typing in lat/lng fields clears saved coords until Apply is pressed
  const handleLatChange = (val: string) => {
    setLatInput(val)
    setVenueCoordinates(null)
    setCoordError("")
  }

  const handleLngChange = (val: string) => {
    setLngInput(val)
    setVenueCoordinates(null)
    setCoordError("")
  }

  // Address is typed manually (not from map) if venue is set but no coords yet
  const hasManualAddress = eventVenue.trim().length > 0 && !venueCoordinates
  const coordsRequired = hasManualAddress

  return (
    <div className="space-y-6 rounded-xl border-2 border-slate-200 bg-white p-8 shadow-sm">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center justify-center w-10 h-10 bg-[#6b2fa5]/10 rounded-lg">
          <MapPin className="w-5 h-5 text-[#6b2fa5]" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Location</h2>
      </div>

      {/* ── Venue input + map picker ── */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">
          Event Venue <span className="text-red-500">*</span>
        </label>
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Enter event venue or address"
              value={eventVenue}
              onChange={(e) => handleVenueChange(e.target.value)}
              required
              className="w-full pl-11 pr-4 py-3 border-2 border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200 text-slate-900"
            />
          </div>
          <button
            type="button"
            onClick={onOpenMapPicker}
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#6b2fa5] hover:bg-[#5a2589] text-white font-semibold rounded-lg transition-all duration-200 shadow-sm hover:shadow-md whitespace-nowrap"
          >
            <MapPinned className="w-5 h-5" />
            Pick on Map
          </button>
        </div>

        {/* Coords saved confirmation */}
        {venueCoordinates && (
          <div className="mt-3 flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
            <p className="text-xs text-emerald-700 flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
              Coordinates saved —{" "}
              <span className="font-mono">
                {venueCoordinates.lat.toFixed(6)}, {venueCoordinates.lng.toFixed(6)}
              </span>
            </p>
            <button
              type="button"
              onClick={handleClearCoords}
              className="text-xs text-slate-400 hover:text-red-500 transition-colors ml-3 flex-shrink-0"
            >
              Clear
            </button>
          </div>
        )}

        {/* Warning: manual address typed but no coords yet */}
        {coordsRequired && !showManualCoords && (
          <p className="mt-2 text-xs text-amber-600 flex items-center gap-1.5">
            <Navigation className="w-3.5 h-3.5 flex-shrink-0" />
            Coordinates are required when entering an address manually. Use the map or enter them below.
          </p>
        )}
      </div>

      {/* ── Manual coordinate entry ── */}
      <div className="border-t border-slate-100 pt-5">
        <button
          type="button"
          onClick={() => setShowManualCoords((v) => !v)}
          className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-[#6b2fa5] transition-colors group"
        >
          <Navigation className="w-4 h-4 group-hover:text-[#6b2fa5] transition-colors" />
          Enter coordinates manually
          {showManualCoords ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
          {coordsRequired && !venueCoordinates && (
            <span className="ml-1 text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">
              REQUIRED
            </span>
          )}
        </button>

        {showManualCoords && (
          <div className="mt-4 space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
            <p className="text-xs text-slate-500">
              Enter decimal coordinates (e.g. Lagos: <span className="font-mono">6.524379, 3.379206</span>).
              You can get these from Google Maps by right-clicking any location.
            </p>

            <div className="flex gap-3">
              {/* Latitude */}
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Latitude <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 6.524379"
                  value={latInput}
                  onChange={(e) => handleLatChange(e.target.value)}
                  className={`w-full px-3 py-2.5 border-2 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200 text-slate-900 font-mono text-sm ${
                    coordError && coordError.toLowerCase().includes("latit")
                      ? "border-red-300"
                      : "border-slate-200"
                  }`}
                />
              </div>

              {/* Longitude */}
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Longitude <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 3.379206"
                  value={lngInput}
                  onChange={(e) => handleLngChange(e.target.value)}
                  className={`w-full px-3 py-2.5 border-2 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200 text-slate-900 font-mono text-sm ${
                    coordError && coordError.toLowerCase().includes("longit")
                      ? "border-red-300"
                      : "border-slate-200"
                  }`}
                />
              </div>

              {/* Apply button */}
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleApplyCoords}
                  className="px-4 py-2.5 bg-[#6b2fa5] hover:bg-[#5a2589] text-white font-semibold rounded-lg transition-all duration-200 text-sm whitespace-nowrap"
                >
                  Apply
                </button>
              </div>
            </div>

            {/* Coord error */}
            {coordError && (
              <p className="text-xs text-red-600 flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 flex-shrink-0">⚠</span>
                {coordError}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}