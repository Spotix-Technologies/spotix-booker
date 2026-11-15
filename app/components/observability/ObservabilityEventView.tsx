"use client"

// app/components/observability/ObservabilityEventView.tsx
//
// The reusable "one event's funnel" view — used both by the per-event
// Observability tab (app/components/event-info/observability-tab.tsx)
// and by the global Observability page when a specific event is
// selected (app/observability/page.tsx). Pure presentation: it's handed
// already-fetched stats and just renders them, so the two call sites
// can differ in how/where they fetch without duplicating this layout.

import FunnelStatCard from "./FunnelStatCard"
import FunnelTrendChart from "./FunnelTrendChart"
import ConversionFunnelBars from "./ConversionFunnelBars"
import LocationDeviceBreakdown from "./LocationDeviceBreakdown"
import { mergeCountMaps, sumUniqueVisitors } from "@/lib/observability-aggregate"

export interface ObservabilityStatsShape {
  totals: {
    pageViews: number
    checkoutStarts: number
    paymentCreated: number
    paymentSuccess: number
    paymentFailed: number
  }
  conversion: {
    pageToPurchase: number | null
  }
  daily: {
    date: string
    pageViews: number
    checkoutStarts: number
    paymentCreated: number
    paymentSuccess: number
    paymentFailed: number
    /** First-time-that-day distinct devices — see the Page Views vs
     * Unique Visitors note rendered below the stat cards. Optional only
     * because older cached responses might not carry it. */
    uniqueVisitors?: number
    /** Bucket → count maps, aggregated client-side across the selected
     * range by mergeCountMaps() below. */
    locations?: Record<string, number>
    devices?: Record<string, number>
  }[]
  /** All-time totals, independent of the selected date range. Optional
   * so the view still renders against a response that predates it. */
  lifetime?: {
    /** Each device counted once, the first time it ever viewed the event. */
    uniqueVisitors: number
  }
}

interface ObservabilityEventViewProps {
  stats: ObservabilityStatsShape
  /** Only present (and only meaningful) at the per-event granularity —
   * the all-events aggregate uses a fixed 5-day window, so this prop is
   * only shown there when it differs from the default. */
  maxDaysFetch?: number
  /** True for the "All Events" aggregate. Only changes the wording of the
   * all-time card: visitor ids are per event, so across events it's a
   * sum of per-event uniques rather than distinct people. */
  allEvents?: boolean
}

export default function ObservabilityEventView({ stats, maxDaysFetch, allEvents = false }: ObservabilityEventViewProps) {
  const sparkline = (key: keyof ObservabilityStatsShape["daily"][number]) =>
    stats.daily.map((d) => Number(d[key]) || 0)

  // uniqueVisitors, locations and devices all ride on the per-day
  // stats Numerox already returns — summed/merged here across whatever
  // range the page fetched, rather than re-fetching anything.
  const uniqueVisitors = sumUniqueVisitors(stats.daily)
  const hasLifetime = stats.lifetime !== undefined
  const lifetimeUniqueVisitors = stats.lifetime?.uniqueVisitors ?? 0
  const locations = mergeCountMaps(...stats.daily.map((d) => d.locations))
  const devices = mergeCountMaps(...stats.daily.map((d) => d.devices))

  return (
    <div className="space-y-5">
      {maxDaysFetch !== undefined && maxDaysFetch > 5 && (
        <p className="text-xs text-slate-400">
          This event's Observability retention has been extended to {maxDaysFetch} days by a Spotix admin.
        </p>
      )}

      {/* Reach: how many people saw the event. */}
      <div className={hasLifetime ? "grid grid-cols-2 md:grid-cols-3 gap-4" : "grid grid-cols-2 gap-4"}>
        <FunnelStatCard
          label="Page Views"
          value={stats.totals.pageViews}
          sparkline={sparkline("pageViews")}
          color="#94a3b8"
          // caption="Every time the page loaded"
        />
        <FunnelStatCard
          label="Unique Visitors"
          value={uniqueVisitors}
          sparkline={sparkline("uniqueVisitors")}
          color="#38bdf8"
          // caption="Distinct devices, first visit"
        />
        {hasLifetime && (
          // No sparkline: this is one running total, not a per-day series.
          <FunnelStatCard
            label="All-time Unique Visitors"
            value={lifetimeUniqueVisitors}
            caption={allEvents ? "Each device counted once per event" : "Each device counted once, ever"}
            className="col-span-2 md:col-span-1"
          />
        )}
      </div>

      <p className="text-xs text-slate-400 -mt-2">
        <span className="font-medium text-slate-500">Page Views</span> counts every time the event page loaded, including repeat
        visits from the same person. <span className="font-medium text-slate-500">Unique Visitors</span> counts how many distinct
        devices viewed it for the first time that day — a truer read on reach.
        {hasLifetime && (
          <>
            {" "}
            <span className="font-medium text-slate-500">All-time Unique Visitors</span> counts a device only the first time it
            ever viewed the event, however many days it comes back.
          </>
        )}
      </p>

      {/* Funnel: what those people did next. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <FunnelStatCard label="Checkout Starts" value={stats.totals.checkoutStarts} sparkline={sparkline("checkoutStarts")} color="#c084fc" />
        <FunnelStatCard label="Payments Created" value={stats.totals.paymentCreated} sparkline={sparkline("paymentCreated")} color="#a855f7" />
        <FunnelStatCard
          label="Successful Payments"
          value={stats.totals.paymentSuccess}
          sparkline={sparkline("paymentSuccess")}
          color="#6b2fa5"
          caption={stats.conversion.pageToPurchase !== null ? `${(stats.conversion.pageToPurchase * 100).toFixed(1)}% of views` : undefined}
        />
        <FunnelStatCard label="Failed Payments" value={stats.totals.paymentFailed} sparkline={sparkline("paymentFailed")} color="#ef4444" />
      </div>

      <FunnelTrendChart daily={stats.daily} />

      <ConversionFunnelBars
        stages={[
          { label: "Page Views", value: stats.totals.pageViews },
          { label: "Checkout Starts", value: stats.totals.checkoutStarts },
          { label: "Payments Created", value: stats.totals.paymentCreated },
          { label: "Successful", value: stats.totals.paymentSuccess },
        ]}
      />

      <LocationDeviceBreakdown locations={locations} devices={devices} />
    </div>
  )
}
