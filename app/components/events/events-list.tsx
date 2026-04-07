"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { EventCard } from "./event-card"
import { StatusBadge, TicketCell } from "./event-ui"
import { Eye, Calendar, PauseCircle, PlayCircle } from "lucide-react"
import type { EventData } from "@/types/event"

interface EventsListProps {
  events: EventData[]
  searchQuery: string
  statusFilter: string
  onEventsChange?: (updater: (prev: EventData[]) => EventData[]) => void
}

// ─── Animated action button ───────────────────────────────────────────────────
// Shows icon only; smoothly expands to reveal label on hover.
function ActionButton({
  icon,
  label,
  onClick,
  colorClass,
  disabled,
  title,
}: {
  icon: React.ReactNode
  label: string
  onClick: (e: React.MouseEvent) => void
  colorClass: string
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`
        group/action inline-flex items-center gap-0 overflow-hidden
        rounded-full px-2 py-1.5
        transition-all duration-300 ease-in-out
        hover:gap-1.5 hover:px-3
        disabled:opacity-40 disabled:cursor-not-allowed
        ${colorClass}
      `}
    >
      <span className="flex-shrink-0">{icon}</span>
      <span
        className="
          text-xs font-semibold whitespace-nowrap
          max-w-0 overflow-hidden opacity-0
          transition-all duration-300 ease-in-out
          group-hover/action:max-w-[80px] group-hover/action:opacity-100
        "
      >
        {label}
      </span>
    </button>
  )
}

export function EventsList({ events, searchQuery, statusFilter, onEventsChange }: EventsListProps) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const matchesSearch =
        event.eventName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.eventVenue.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesStatus = statusFilter === "all" || event.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [events, searchQuery, statusFilter])

  async function handlePauseResume(
    e: React.MouseEvent,
    event: EventData,
    action: "pause" | "resume"
  ) {
    e.stopPropagation()
    if (pendingId) return
    setPendingId(event.id)

    try {
      const res = await fetch("/api/event/list", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: event.id, action }),
      })

      if (res.ok) {
        onEventsChange?.((prev) =>
          prev.map((ev) =>
            ev.id === event.id
              ? { ...ev, status: action === "pause" ? "inactive" : "active" }
              : ev
          )
        )
      } else {
        const { error } = await res.json()
        console.error(`[pause/resume] ${error}`)
      }
    } catch (err) {
      console.error("[pause/resume] network error", err)
    } finally {
      setPendingId(null)
    }
  }

  if (filteredEvents.length === 0) {
    return (
      <div className="bg-gradient-to-br from-slate-50 to-purple-50/30 border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center mb-8">
        <div className="max-w-md mx-auto">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-[#6b2fa5]/10 rounded-full mb-6">
            <Eye className="text-[#6b2fa5]" size={40} />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-3">No events found</h3>
          <p className="text-slate-600 mb-6">
            {searchQuery || statusFilter !== "all"
              ? "Try adjusting your search or filters"
              : "Create your first event to get started"}
          </p>
          {!searchQuery && statusFilter === "all" && (
            <button
              onClick={() => router.push("/create-event")}
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#6b2fa5] hover:bg-[#5a2589] text-white font-semibold rounded-lg transition-colors duration-200"
            >
              <Calendar className="w-5 h-5" />
              <span>Create Event</span>
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="mb-12">
      {/* Desktop Table */}
      <div className="hidden md:block">
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-[#6b2fa5] to-purple-600">
                <tr>
                  {["Event Name", "Date", "Venue", "Type", "Tickets", "Revenue", "Status", "Actions"].map((h) => (
                    <th key={h} className="px-6 py-4 text-left text-sm font-bold text-white">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEvents.map((event) => {
                  const isFuture = new Date(event.eventDate) > new Date()
                  const canPause  = event.status === "active"   && isFuture
                  const canResume = event.status === "inactive" && isFuture
                  const isLoading = pendingId === event.id

                  return (
                    <tr
                      key={event.id}
                      className="group hover:bg-[#6b2fa5]/5 transition-colors duration-150 cursor-pointer"
                      onClick={() => router.push(`/event-info/${event.id}`)}
                    >
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900 group-hover:text-[#6b2fa5] transition-colors">
                          {event.eventName}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {new Date(event.eventDate).toLocaleDateString("en-US", {
                          month: "short", day: "numeric", year: "numeric",
                        })}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-slate-600 max-w-[200px] truncate">{event.eventVenue}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded-md">
                          {event.eventType}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <TicketCell event={event} />
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-bold text-[#6b2fa5]">
                          ₦{event.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={event.status} />
                      </td>

                      {/* ── Actions ── */}
                      <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">

                          {/* View */}
                          <ActionButton
                            icon={<Eye className="w-4 h-4" />}
                            label="View"
                            colorClass="text-[#6b2fa5] hover:bg-[#6b2fa5]/10"
                            onClick={(e) => {
                              e.stopPropagation()
                              router.push(`/event-info/${event.id}`)
                            }}
                          />

                          {/* Pause */}
                          {canPause && (
                            <ActionButton
                              icon={
                                isLoading
                                  ? <span className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin inline-block" />
                                  : <PauseCircle className="w-4 h-4" />
                              }
                              label="Pause"
                              colorClass="text-amber-600 hover:bg-amber-50"
                              disabled={isLoading}
                              title="Pause this event"
                              onClick={(e) => handlePauseResume(e, event, "pause")}
                            />
                          )}

                          {/* Resume */}
                          {canResume && (
                            <ActionButton
                              icon={
                                isLoading
                                  ? <span className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin inline-block" />
                                  : <PlayCircle className="w-4 h-4" />
                              }
                              label="Resume"
                              colorClass="text-emerald-600 hover:bg-emerald-50"
                              disabled={isLoading}
                              title="Resume this event"
                              onClick={(e) => handlePauseResume(e, event, "resume")}
                            />
                          )}

                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-4 text-sm text-slate-500 text-center">
          Showing {filteredEvents.length} of {events.length} events
        </p>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-4">
        {filteredEvents.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            onEventsChange={onEventsChange}
          />
        ))}
        <p className="mt-2 text-sm text-slate-500 text-center">
          Showing {filteredEvents.length} of {events.length} events
        </p>
      </div>
    </div>
  )
}