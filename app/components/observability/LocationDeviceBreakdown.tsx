"use client"

// app/components/observability/LocationDeviceBreakdown.tsx
//
// Two ranked-list panels fed by Numerox's `locations` and `devices`
// bucket → count maps (see app/lib/observability-aggregate.ts for how
// those maps get assembled from the fetched `daily` stats):
//
//   - General Location: every resolved "State, CC" / country bucket,
//     with a search box to filter the list by name.
//   - Device Type: every raw NumeroxDeviceType bucket, with quick
//     category chips (Mobile / Desktop / Tablet / Unknown) that filter
//     which buckets are shown, plus a share of total for each.
//
// Both filters are purely client-side over data already on the page —
// no refetch, no extra request, near-instant.

import { useMemo, useState } from "react"
import { MapPin, Smartphone, Monitor, Tablet as TabletIcon, HelpCircle, Search } from "lucide-react"
import { rankCountMap, type CountMap } from "@/lib/observability-aggregate"

interface LocationDeviceBreakdownProps {
  locations: CountMap
  devices: CountMap
}

// Groups Numerox's raw device buckets into the categories organizers
// actually think in. "unknown" only ever shows up under the "Unknown"
// filter — lumping it into "Desktop" would quietly overstate desktop
// traffic.
const DEVICE_CATEGORIES = [
  { id: "all", label: "All", match: null as ((bucket: string) => boolean) | null },
  { id: "mobile", label: "Mobile", match: (b: string) => b === "android" || b === "ios" },
  { id: "desktop", label: "Desktop", match: (b: string) => b === "windows" || b === "mac" || b === "linux" },
  { id: "tablet", label: "Tablet", match: (b: string) => b === "tablet" },
  { id: "unknown", label: "Unknown", match: (b: string) => b === "unknown" },
] as const

const DEVICE_LABELS: Record<string, string> = {
  android: "Android", ios: "iOS", windows: "Windows", mac: "Mac",
  linux: "Linux", tablet: "Tablet", unknown: "Unknown",
}

function deviceIcon(bucket: string) {
  if (bucket === "android" || bucket === "ios") return Smartphone
  if (bucket === "tablet") return TabletIcon
  if (bucket === "unknown") return HelpCircle
  return Monitor
}

export default function LocationDeviceBreakdown({ locations, devices }: LocationDeviceBreakdownProps) {
  const [locationSearch, setLocationSearch] = useState("")
  const [deviceCategory, setDeviceCategory] = useState<(typeof DEVICE_CATEGORIES)[number]["id"]>("all")

  const rankedLocations = useMemo(() => rankCountMap(locations), [locations])
  const filteredLocations = useMemo(() => {
    const query = locationSearch.trim().toLowerCase()
    if (!query) return rankedLocations
    return rankedLocations.filter((entry) => entry.key.toLowerCase().includes(query))
  }, [rankedLocations, locationSearch])

  const rankedDevices = useMemo(() => rankCountMap(devices), [devices])
  const activeCategory = DEVICE_CATEGORIES.find((c) => c.id === deviceCategory) ?? DEVICE_CATEGORIES[0]
  const filteredDevices = useMemo(() => {
    if (!activeCategory.match) return rankedDevices
    return rankedDevices.filter((entry) => activeCategory.match!(entry.key))
  }, [rankedDevices, activeCategory])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* General Location */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-slate-400" />
            General location
          </h3>
        </div>

        {rankedLocations.length > 3 && (
          <div className="relative mb-3">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={locationSearch}
              onChange={(e) => setLocationSearch(e.target.value)}
              placeholder="Filter locations…"
              className="w-full text-xs border border-slate-200 rounded-lg pl-7 pr-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#6b2fa5]/30"
            />
          </div>
        )}

        <BreakdownList entries={filteredLocations} emptyLabel={rankedLocations.length === 0 ? "No location data yet." : "No locations match your filter."} />
      </div>

      {/* Device Type */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
            <Smartphone className="w-4 h-4 text-slate-400" />
            Device type
          </h3>
        </div>

        {rankedDevices.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {DEVICE_CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setDeviceCategory(category.id)}
                className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
                  deviceCategory === category.id
                    ? "bg-[#6b2fa5] border-[#6b2fa5] text-white"
                    : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                }`}
              >
                {category.label}
              </button>
            ))}
          </div>
        )}

        <BreakdownList
          entries={filteredDevices}
          labelFor={(key) => DEVICE_LABELS[key] ?? key}
          iconFor={deviceIcon}
          emptyLabel={rankedDevices.length === 0 ? "No device data yet." : "No devices in this category."}
        />
      </div>
    </div>
  )
}

interface BreakdownListProps {
  entries: { key: string; value: number; share: number }[]
  labelFor?: (key: string) => string
  iconFor?: (key: string) => typeof MapPin
  emptyLabel: string
}

function BreakdownList({ entries, labelFor, iconFor, emptyLabel }: BreakdownListProps) {
  if (entries.length === 0) {
    return <p className="text-xs text-slate-400 py-6 text-center">{emptyLabel}</p>
  }

  return (
    <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
      {entries.map((entry) => {
        const Icon = iconFor?.(entry.key)
        return (
          <div key={entry.key} className="flex items-center gap-2.5">
            {Icon && <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-medium text-slate-700 truncate">{labelFor ? labelFor(entry.key) : entry.key}</span>
                <span className="text-xs text-slate-500 shrink-0">
                  {entry.value.toLocaleString()} · {(entry.share * 100).toFixed(0)}%
                </span>
              </div>
              <div className="h-1.5 bg-slate-50 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#6b2fa5]"
                  style={{ width: `${Math.max(2, entry.share * 100)}%`, opacity: 0.65 }}
                />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
