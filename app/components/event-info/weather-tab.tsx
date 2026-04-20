// components/event-info/weather-tab.tsx

"use client"

import { useEffect, useState } from "react"
import { Cloud, CloudRain, CloudSnow, CloudLightning, Sun, CloudDrizzle, Wind, Thermometer, Droplets, MapPin } from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────────────────
interface ForecastWeather {
  weathercode?: number
  tempMax?: number
  tempMin?: number
  precipitationMm?: number
  units?: Record<string, string>
  resolvedCoordinates?: { lat: number; lng: number }
}

export interface ForecastData {
  status: "pending" | "fulfilled" | "failed" | "skipped" | string
  forecast?: ForecastWeather | null
  processedAt?: string | null
  skipReason?: string | null
  error?: string | null
  eventLocation?: { lat: number | null; lng: number | null; city: string } | null
  eventDate?: string | null
}

// ── WMO helpers ────────────────────────────────────────────────────────────────
export function getWeatherLabel(code?: number): string {
  if (code === undefined || code === null) return "Unknown"
  if (code === 0)  return "Clear Sky"
  if (code <= 3)   return "Partly Cloudy"
  if (code <= 48)  return "Foggy"
  if (code <= 55)  return "Drizzle"
  if (code <= 65)  return "Rain"
  if (code <= 77)  return "Snow"
  if (code <= 82)  return "Rain Showers"
  if (code <= 99)  return "Thunderstorm"
  return "Unknown"
}

export function getWeatherEmoji(code?: number): string {
  if (code === undefined || code === null) return "🌡️"
  if (code === 0)  return "☀️"
  if (code <= 3)   return "⛅"
  if (code <= 48)  return "🌫️"
  if (code <= 55)  return "🌦️"
  if (code <= 65)  return "🌧️"
  if (code <= 77)  return "❄️"
  if (code <= 82)  return "🌦️"
  if (code <= 99)  return "⛈️"
  return "🌡️"
}

function WeatherIcon({ code, size = 48 }: { code?: number; size?: number }) {
  const cls = `text-blue-500`
  const props = { size, strokeWidth: 1.5 }
  if (code === undefined || code === null) return <Thermometer {...props} className={cls} />
  if (code === 0)  return <Sun {...props} className="text-amber-400" />
  if (code <= 3)   return <Cloud {...props} className="text-slate-400" />
  if (code <= 48)  return <Wind {...props} className="text-slate-400" />
  if (code <= 55)  return <CloudDrizzle {...props} className={cls} />
  if (code <= 65)  return <CloudRain {...props} className={cls} />
  if (code <= 77)  return <CloudSnow {...props} className="text-sky-300" />
  if (code <= 82)  return <CloudRain {...props} className={cls} />
  if (code <= 99)  return <CloudLightning {...props} className="text-yellow-500" />
  return <Thermometer {...props} className={cls} />
}

// ── Forecast badge (used in page header) ──────────────────────────────────────
export function ForecastBadge({ forecast }: { forecast: ForecastData | null }) {
  if (!forecast) return null

  if (forecast.status === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block" />
        Weather forecast pending — available 5 days before the event
      </span>
    )
  }

  if (forecast.status === "fulfilled" && forecast.forecast) {
    const w = forecast.forecast
    return (
      <span className="inline-flex items-center gap-2 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-3 py-1.5">
        <span>{getWeatherEmoji(w.weathercode)}</span>
        <span>{getWeatherLabel(w.weathercode)}</span>
        {w.tempMax !== undefined && w.tempMin !== undefined && (
          <span>{w.tempMin}°C – {w.tempMax}°C</span>
        )}
        {w.precipitationMm !== undefined && w.precipitationMm > 0 && (
          <span>· {w.precipitationMm}mm rain</span>
        )}
        <span className="text-blue-400">· event day forecast</span>
      </span>
    )
  }

  if (forecast.status === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-full px-3 py-1">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
        Weather forecast unavailable
      </span>
    )
  }

  return null
}

// ── Stat card ──────────────────────────────────────────────────────────────────
function StatCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  accent: string
}) {
  return (
    <div className={`rounded-xl border p-5 flex items-start gap-4 ${accent}`}>
      <div className="mt-0.5">{icon}</div>
      <div>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">{label}</p>
        <p className="text-2xl font-bold text-slate-800">{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────────────────────────
export default function WeatherTab({
  eventId,
}: {
  eventId: string
}) {
  const [forecast, setForecast] = useState<ForecastData | null>(null)
  const [loading, setLoading] = useState(true)

  // Fetch forecast unconditionally on mount.
  // This component is only mounted when the weather tab is selected,
  // so the API request fires exactly at tab-selection time.
  useEffect(() => {
    if (!eventId) { setLoading(false); return }
    setLoading(true)
    fetch(`/api/forecast?eventId=${eventId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch forecast")
        return res.json()
      })
      .then((data) => setForecast(data))
      .catch((err) => {
        console.error("[WeatherTab] forecast fetch failed:", err)
      })
      .finally(() => setLoading(false))
  }, [eventId])

  // -- Loading ----------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center">
          <span className="w-7 h-7 border-3 border-blue-200 border-t-blue-500 rounded-full animate-spin inline-block" style={{ borderWidth: "3px" }} />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-700 mb-1">Loading Forecast...</h3>
          <p className="text-sm text-slate-500">Fetching weather data for this event.</p>
        </div>
      </div>
    )
  }

  // -- Pending ----------------------------------------------------------------
  if (!forecast || forecast.status === "pending") {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center">
          <Cloud size={28} className="text-amber-400" strokeWidth={1.5} />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-700 mb-1">Forecast Not Yet Available</h3>
          <p className="text-sm text-slate-500 max-w-sm">
            Weather data is fetched automatically 5 days before the event date using Open-Meteo.
            Check back closer to the event.
          </p>
        </div>
        {forecast?.eventDate && (
          <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
            Event date: {forecast.eventDate}
          </span>
        )}
      </div>
    )
  }

  // -- Failed / skipped -------------------------------------------------------
  if (forecast.status === "failed" || forecast.status === "skipped") {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-red-50 border border-red-200 flex items-center justify-center">
          <CloudRain size={28} className="text-red-400" strokeWidth={1.5} />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-700 mb-1">
            {forecast.status === "skipped" ? "Forecast Skipped" : "Forecast Unavailable"}
          </h3>
          <p className="text-sm text-slate-500 max-w-sm">
            {forecast.status === "skipped"
              ? forecast.skipReason ?? "This event is missing location coordinates."
              : forecast.error ?? "The weather service returned an error for this event."}
          </p>
        </div>
      </div>
    )
  }

  // -- Fulfilled --------------------------------------------------------------
  if (forecast.status === "fulfilled" && forecast.forecast) {
    const w = forecast.forecast
    const label = getWeatherLabel(w.weathercode)
    const tempUnit = w.units?.temperature_2m_max ?? "°C"
    const precipUnit = w.units?.precipitation_sum ?? "mm"

    return (
      <div className="space-y-6">

        {/* Hero card */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-sky-400 p-6 text-white shadow-lg">
          <div className="absolute -right-6 -top-6 opacity-10">
            <WeatherIcon code={w.weathercode} size={140} />
          </div>
          <div className="relative flex items-center gap-6">
            <WeatherIcon code={w.weathercode} size={56} />
            <div>
              <p className="text-blue-100 text-sm font-medium mb-0.5">Event Day Forecast</p>
              <h2 className="text-3xl font-bold tracking-tight">{label}</h2>
              {forecast.eventDate && (
                <p className="text-blue-100 text-sm mt-1">{forecast.eventDate}</p>
              )}
            </div>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {w.tempMax !== undefined && (
            <StatCard
              icon={<Thermometer size={20} className="text-red-400" />}
              label="High Temperature"
              value={`${w.tempMax}${tempUnit}`}
              sub="Expected maximum"
              accent="bg-red-50 border-red-100"
            />
          )}
          {w.tempMin !== undefined && (
            <StatCard
              icon={<Thermometer size={20} className="text-blue-400" />}
              label="Low Temperature"
              value={`${w.tempMin}${tempUnit}`}
              sub="Expected minimum"
              accent="bg-blue-50 border-blue-100"
            />
          )}
          {w.precipitationMm !== undefined && (
            <StatCard
              icon={<Droplets size={20} className="text-sky-500" />}
              label="Precipitation"
              value={w.precipitationMm > 0 ? `${w.precipitationMm} ${precipUnit}` : "None expected"}
              sub={w.precipitationMm > 0 ? "Rain expected on event day" : "Dry conditions likely"}
              accent="bg-sky-50 border-sky-100"
            />
          )}
        </div>

        {/* Location + metadata */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-col sm:flex-row gap-4 justify-between text-sm text-slate-600">
          {forecast.eventLocation?.city && (
            <div className="flex items-center gap-2">
              <MapPin size={15} className="text-slate-400 shrink-0" />
              <span>{forecast.eventLocation.city}</span>
              {w.resolvedCoordinates && (
                <span className="text-slate-400">
                  ({w.resolvedCoordinates.lat.toFixed(3)}, {w.resolvedCoordinates.lng.toFixed(3)})
                </span>
              )}
            </div>
          )}
          {forecast.processedAt && (
            <span className="text-slate-400 text-xs">
              Fetched {new Date(forecast.processedAt).toLocaleString()}
            </span>
          )}
        </div>

        {/* Advisory */}
        {w.precipitationMm !== undefined && w.precipitationMm > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
            <span className="text-lg mt-0.5">⚠️</span>
            <p className="text-sm text-amber-800">
              <span className="font-semibold">Rain is expected on event day.</span>{" "}
              Consider arranging covered areas or notifying attendees to bring rain gear.
            </p>
          </div>
        )}

      </div>
    )
  }

  return null
}
