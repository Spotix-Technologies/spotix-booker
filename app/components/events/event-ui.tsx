// components/events/event-ui.tsx
// Shared primitive components used by events-list, collaborated-events-list, and event-card.
// Nothing here imports from page.tsx or sibling list components.

import type { EventData } from "@/types/event"

export const STATUS_STYLES: Record<string, string> = {
  active:    "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20",
  past:      "bg-slate-50 text-slate-600 ring-1 ring-slate-500/20",
  inactive:  "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20",
  cancelled: "bg-rose-50 text-rose-700 ring-1 ring-rose-600/20",
  completed: "bg-blue-50 text-blue-700 ring-1 ring-blue-600/20",
}

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.past
  return (
    <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${style}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

export function TicketCell({ event }: { event: Pick<EventData, "ticketsSold" | "totalCapacity" | "hasMaxSize"> }) {
  if (!event.hasMaxSize || event.totalCapacity === null) {
    return (
      <span className="text-sm font-semibold text-slate-900">
        {event.ticketsSold.toLocaleString()}
      </span>
    )
  }

  const pct = Math.min((event.ticketsSold / event.totalCapacity) * 100, 100)

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-slate-900">
        {event.ticketsSold.toLocaleString()} / {event.totalCapacity.toLocaleString()}
      </span>
      <div className="w-20 bg-slate-200 rounded-full h-1.5 overflow-hidden">
        <div
          className="bg-[#6b2fa5] h-1.5 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}