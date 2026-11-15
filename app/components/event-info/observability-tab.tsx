"use client"

// app/components/event-info/observability-tab.tsx
//
// The per-event Observability tab — funnel data for THIS event only.
// Fetches from /api/event/list/[eventId]/observability, which enforces
// access via the "observability" tab permission (see
// app/lib/team-tabs.ts and app/lib/event-access.ts) and reports back
// this event's effective maxDaysFetch (5 by default, or an admin's
// per-event override — see app/lib/numerox-max-days.ts).

import { useState, useEffect, useCallback } from "react"
import { AlertCircle } from "lucide-react"
import DateRangeSelect from "@/components/observability/DateRangeSelect"
import ObservabilityEventView, { type ObservabilityStatsShape } from "@/components/observability/ObservabilityEventView"

interface ObservabilityTabProps {
  eventId: string
}

const DEFAULT_DAYS = 5

export default function ObservabilityTab({ eventId }: ObservabilityTabProps) {
  const [days, setDays] = useState(DEFAULT_DAYS)
  const [maxDaysFetch, setMaxDaysFetch] = useState(DEFAULT_DAYS)
  const [stats, setStats] = useState<ObservabilityStatsShape | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = useCallback(async (requestDays: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/event/list/${eventId}/observability?days=${requestDays}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to fetch Observability data")
      setStats(data.stats)
      setMaxDaysFetch(data.maxDaysFetch)
      // If the server reports a smaller ceiling than we requested (a
      // stale selection), clamp the UI's own days state to match.
      if (requestDays > data.maxDaysFetch) setDays(data.maxDaysFetch)
    } catch (e: unknown) {
      console.error("Error fetching Observability stats:", e)
      setError(e instanceof Error ? e.message : "Failed to load Observability data")
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    fetchStats(days)
    // Only re-fetch when the event or the selected range changes — not
    // on every render of fetchStats' identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, days])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Observability</h2>
          <p className="text-sm text-slate-500">How visitors move through this event's funnel — page views, checkout, and payment.</p>
        </div>
        <DateRangeSelect days={days} maxDaysFetch={maxDaysFetch} onChange={setDays} />
      </div>

      {loading && !stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 h-24 animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg px-4 py-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {stats && <ObservabilityEventView stats={stats} maxDaysFetch={maxDaysFetch} />}
    </div>
  )
}
