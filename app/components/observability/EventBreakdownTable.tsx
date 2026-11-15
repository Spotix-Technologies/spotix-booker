"use client"

// app/components/observability/EventBreakdownTable.tsx
//
// The "All Events" view's per-event table — busiest first. Clicking a
// row hands the eventId back to the parent page, which is how the
// EventSwitcher and this table stay in sync (selecting a row here is
// equivalent to picking that event in the switcher).

interface EventBreakdownRow {
  eventId: string
  eventName: string
  totals: {
    pageViews: number
    checkoutStarts: number
    paymentSuccess: number
  }
  conversion: {
    pageToPurchase: number | null
  }
  /** Distinct devices, first visit — see the Page Views vs Unique
   * Visitors note on the single-event view for why this differs from
   * Page Views. */
  uniqueVisitors: number
  /** Each device counted once, the first time it ever viewed this event —
   * unlike `uniqueVisitors`, not tied to the selected date range. */
  lifetimeUniqueVisitors?: number
}

interface EventBreakdownTableProps {
  events: EventBreakdownRow[]
  onSelect: (eventId: string) => void
}

export default function EventBreakdownTable({ events, onSelect }: EventBreakdownTableProps) {
  if (events.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-400">
        No events with Observability data yet.
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3 font-semibold">Event</th>
              <th className="px-4 py-3 font-semibold text-right">Page Views</th>
              <th className="px-4 py-3 font-semibold text-right">Unique Visitors</th>
              <th className="px-4 py-3 font-semibold text-right">All-time Unique</th>
              <th className="px-4 py-3 font-semibold text-right">Checkout Starts</th>
              <th className="px-4 py-3 font-semibold text-right">Successful Payments</th>
              <th className="px-4 py-3 font-semibold text-right">Conversion</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr
                key={e.eventId}
                onClick={() => onSelect(e.eventId)}
                className="border-b border-slate-50 last:border-0 hover:bg-slate-50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3 font-medium text-slate-800 truncate max-w-[240px]">{e.eventName}</td>
                <td className="px-4 py-3 text-right text-slate-600">{e.totals.pageViews.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-slate-600">{e.uniqueVisitors.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-slate-600">
                  {e.lifetimeUniqueVisitors !== undefined ? e.lifetimeUniqueVisitors.toLocaleString() : "—"}
                </td>
                <td className="px-4 py-3 text-right text-slate-600">{e.totals.checkoutStarts.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-slate-600">{e.totals.paymentSuccess.toLocaleString()}</td>
                <td className="px-4 py-3 text-right font-medium text-[#6b2fa5]">
                  {e.conversion.pageToPurchase !== null ? `${(e.conversion.pageToPurchase * 100).toFixed(1)}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
