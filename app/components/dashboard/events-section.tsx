"use client"

import { Eye, Calendar, Ticket, TrendingUp, Wallet, ArrowRight } from "lucide-react"
import Link from "next/link"
import { MaskedAmount } from "@/components/ui/masked-amount"
import { getTimeStatus, TIME_STATUS_LABEL, TIME_STATUS_STYLE } from "@/lib/event-time-status"

interface Event {
  id: string
  eventName: string
  eventDate: string
  ticketsSold: number
  revenue: number
  availableBalance: number
  status: string
  flagged?: boolean
  suspended?: boolean
}

function fmtCurrency(n: number) {
  return `₦${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

// Date-based badge — Past / Today / Upcoming — computed straight off
// eventDate vs. right now. See lib/event-time-status.ts.
const TimeStatusBadge = ({ eventDate }: { eventDate: string }) => {
  const status = getTimeStatus(eventDate)
  if (!status) return null
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${TIME_STATUS_STYLE[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${status === "today" ? "bg-emerald-500 animate-pulse" : "bg-current opacity-50"}`} />
      {TIME_STATUS_LABEL[status]}
    </span>
  )
}

// Moderation/lifecycle tag — active/inactive/flagged/suspended/cancelled —
// still applies alongside the date-based badge above, it's just no longer
// the only signal shown.
const StatusBadge = ({ status }: { status: string }) => {
  const cfg: Record<string, string> = {
    active:    "bg-emerald-50 text-emerald-700 border-emerald-200",
    inactive:  "bg-slate-100 text-slate-500 border-slate-200",
    cancelled: "bg-red-50 text-red-600 border-red-200",
    completed: "bg-blue-50 text-blue-600 border-blue-200",
    flagged:   "bg-red-50 text-red-600 border-red-200",
    suspended: "bg-red-50 text-red-600 border-red-200",
  }
  const cls = cfg[status] ?? "bg-slate-100 text-slate-500 border-slate-200"
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${status === "active" ? "bg-emerald-500 animate-pulse" : "bg-current opacity-50"}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

export function EventsSection({ events, userId }: { events: Event[]; userId: string | null }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">Recent Events</p>
          <h2 className="text-lg font-bold text-slate-900">Your Events</h2>
        </div>
        <Link
          href="/events"
          className="group inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 bg-white hover:border-[#6b2fa5] hover:text-[#6b2fa5] text-slate-600 text-sm font-semibold transition-all duration-200 shadow-sm"
        >
          View All
          <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
              <Calendar size={24} className="text-slate-300" />
            </div>
            <p className="font-semibold text-slate-600 mb-1">No events yet</p>
            <p className="text-sm text-slate-400 mb-5">Create your first event to start selling tickets</p>
            <Link
              href="/create-event"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#6b2fa5] hover:bg-[#5a2589] text-white rounded-xl font-semibold text-sm transition-colors shadow-sm"
            >
              Create Event
            </Link>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    {["Event", "Date", "Tickets", "Revenue", "Balance", "Status", ""].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {events.map((event) => (
                    <tr key={event.id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-900 group-hover:text-[#6b2fa5] transition-colors text-sm truncate max-w-[180px]">
                          {event.eventName}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-slate-500 text-sm whitespace-nowrap">
                        {new Date(event.eventDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5">
                          <Ticket size={13} className="text-[#6b2fa5]" />
                          <span className="text-sm font-medium text-slate-700">{event.ticketsSold.toLocaleString()}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <MaskedAmount value={fmtCurrency(event.revenue)} size="sm" className="text-slate-700" />
                      </td>
                      <td className="px-5 py-4">
                        <MaskedAmount value={fmtCurrency(event.availableBalance)} size="sm" className="text-[#6b2fa5] font-bold" />
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <TimeStatusBadge eventDate={event.eventDate} />
                          <StatusBadge status={event.status} />
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <Link
                          href={userId ? `/event-info/${event.id}` : `/event/${event.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#6b2fa5] hover:bg-[#5a2589] text-white text-xs font-semibold transition-colors"
                        >
                          <Eye size={12} /> View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {events.map((event) => (
                <div key={event.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold text-slate-900 text-sm leading-tight">{event.eventName}</p>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      <TimeStatusBadge eventDate={event.eventDate} />
                      <StatusBadge status={event.status} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-slate-50 rounded-lg p-2.5">
                      <p className="text-slate-400 mb-0.5">Date</p>
                      <p className="font-semibold text-slate-700">
                        {new Date(event.eventDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-2.5">
                      <p className="text-slate-400 mb-0.5">Tickets</p>
                      <p className="font-semibold text-slate-700">{event.ticketsSold.toLocaleString()}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-2.5">
                      <p className="text-slate-400 mb-0.5">Revenue</p>
                      <MaskedAmount value={fmtCurrency(event.revenue)} size="sm" className="text-slate-700" />
                    </div>
                    <div className="bg-[#6b2fa5]/5 border border-[#6b2fa5]/15 rounded-lg p-2.5">
                      <p className="text-slate-400 mb-0.5">Balance</p>
                      <MaskedAmount value={fmtCurrency(event.availableBalance)} size="sm" className="text-[#6b2fa5] font-bold" />
                    </div>
                  </div>

                  <Link
                    href={userId ? `/event-info/${event.id}` : `/event/${event.id}`}
                    className="flex items-center justify-center gap-2 w-full py-2.5 bg-[#6b2fa5] hover:bg-[#5a2589] text-white rounded-xl font-semibold text-sm transition-colors"
                  >
                    <Eye size={14} /> View Details
                  </Link>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
