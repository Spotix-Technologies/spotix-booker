"use client"

// app/observability/page.tsx
//
// The global Observability nav item — Vercel-Observability-style: an
// event switcher up top ("All Events" or a specific event), a date
// range selector, funnel stat cards, a trend chart, and a conversion
// funnel. Selecting "All Events" also shows a per-event breakdown table
// underneath so an organizer can see at a glance which event needs
// attention, then drill in.
//
// Two data sources, matching the two API routes:
//   - All Events:    GET /api/observability?days=N        (fixed 5-day cap)
//   - Single event:  GET /api/event/list/[eventId]/observability?days=N
//                     (that event's own maxDaysFetch — 5 by default, or
//                     an admin-configured override)

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle } from "lucide-react"
import { authFetch, getAccessToken, tryRefreshTokens } from "@/lib/auth-client"
import { waitForAuthInit } from "@/hooks/useAuth"
import EventSwitcher from "@/components/observability/EventSwitcher"
import DateRangeSelect from "@/components/observability/DateRangeSelect"
import EventBreakdownTable from "@/components/observability/EventBreakdownTable"
import ObservabilityEventView, { type ObservabilityStatsShape } from "@/components/observability/ObservabilityEventView"

const ALL_EVENTS_MAX_DAYS = 5

interface EventBreakdownRow {
  eventId: string
  eventName: string
  totals: { pageViews: number; checkoutStarts: number; paymentCreated: number; paymentSuccess: number; paymentFailed: number }
  conversion: { pageToPurchase: number | null }
  uniqueVisitors: number
  lifetimeUniqueVisitors: number
}

interface OverviewResponse {
  totals: ObservabilityStatsShape["totals"]
  conversion: ObservabilityStatsShape["conversion"]
  daily: ObservabilityStatsShape["daily"]
  lifetime: ObservabilityStatsShape["lifetime"]
  events: EventBreakdownRow[]
  maxDaysFetch: number
}

export default function ObservabilityPage() {
  const router = useRouter()

  // Page-level auth gate — same pattern as /reports.
  const [authChecked, setAuthChecked] = useState(false)

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null) // null = All Events
  const [allDays, setAllDays] = useState(ALL_EVENTS_MAX_DAYS)
  const [eventDays, setEventDays] = useState(ALL_EVENTS_MAX_DAYS)
  const [eventMaxDaysFetch, setEventMaxDaysFetch] = useState(ALL_EVENTS_MAX_DAYS)

  const [overview, setOverview] = useState<OverviewResponse | null>(null)
  const [eventStats, setEventStats] = useState<ObservabilityStatsShape | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  //  Auth gate 
  useEffect(() => {
    const init = async () => {
      try {
        await waitForAuthInit()
        let token = getAccessToken()
        if (!token) {
          const refreshed = await tryRefreshTokens()
          if (!refreshed) { router.push("/login"); return }
          token = getAccessToken()
        }
        if (!token) { router.push("/login"); return }
        const res = await authFetch("/api/user/me")
        if (!res.ok) { router.push("/login"); return }
        setAuthChecked(true)
      } catch (err) {
        console.error("Observability auth error:", err)
        router.push("/login")
      }
    }
    init()
  }, [router])

  //  Fetch: All Events 
  const fetchOverview = useCallback(async (requestDays: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/observability?days=${requestDays}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to fetch Observability overview")
      setOverview(data)
    } catch (e: unknown) {
      console.error("Error fetching Observability overview:", e)
      setError(e instanceof Error ? e.message : "Failed to load Observability data")
    } finally {
      setLoading(false)
    }
  }, [])

  //  Fetch: single event 
  const fetchEventStats = useCallback(async (eventId: string, requestDays: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/event/list/${eventId}/observability?days=${requestDays}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to fetch Observability data")
      setEventStats(data.stats)
      setEventMaxDaysFetch(data.maxDaysFetch)
      if (requestDays > data.maxDaysFetch) setEventDays(data.maxDaysFetch)
    } catch (e: unknown) {
      console.error("Error fetching event Observability stats:", e)
      setError(e instanceof Error ? e.message : "Failed to load Observability data")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!authChecked) return
    if (selectedEventId === null) {
      fetchOverview(allDays)
    } else {
      fetchEventStats(selectedEventId, eventDays)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, selectedEventId, allDays, eventDays])

  const handleSelectEvent = (eventId: string | null) => {
    setError(null)
    setSelectedEventId(eventId)
    if (eventId !== null) setEventDays(ALL_EVENTS_MAX_DAYS) // reset to a sane default per event
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#6b2fa5]/30 border-t-[#6b2fa5] rounded-full animate-spin" />
      </div>
    )
  }

  const events = overview?.events ?? []
  const selectedEventName = events.find((e) => e.eventId === selectedEventId)?.eventName

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Observability</h1>
            <p className="text-sm text-slate-500">
              {selectedEventId === null
                ? "Funnel activity across all of your events."
                : `Funnel activity for ${selectedEventName ?? "this event"}.`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <EventSwitcher selectedEventId={selectedEventId} events={events} onChange={handleSelectEvent} />
            {selectedEventId === null ? (
              <DateRangeSelect days={allDays} maxDaysFetch={ALL_EVENTS_MAX_DAYS} onChange={setAllDays} />
            ) : (
              <DateRangeSelect days={eventDays} maxDaysFetch={eventMaxDaysFetch} onChange={setEventDays} />
            )}
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg px-4 py-3">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {loading && !overview && !eventStats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 h-24 animate-pulse" />
            ))}
          </div>
        )}

        {selectedEventId === null && overview && (
          <>
            <ObservabilityEventView
              stats={{ totals: overview.totals, conversion: overview.conversion, daily: overview.daily, lifetime: overview.lifetime }}
              allEvents
            />
            <div>
              <h3 className="text-sm font-semibold text-slate-800 mb-3">By event</h3>
              <EventBreakdownTable events={overview.events} onSelect={handleSelectEvent} />
            </div>
          </>
        )}

        {selectedEventId !== null && eventStats && (
          <ObservabilityEventView stats={eventStats} maxDaysFetch={eventMaxDaysFetch} />
        )}
      </div>
    </div>
  )
}
