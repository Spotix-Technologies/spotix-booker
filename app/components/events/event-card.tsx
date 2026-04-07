// Mobile event card — shared by EventsList and CollaboratedEventsList
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { BarChart3, MapPin, Calendar, Eye, PauseCircle, PlayCircle } from "lucide-react"
import { StatusBadge } from "./event-ui"
import type { EventData } from "@/types/event"

interface EventCardProps {
  event: EventData
  isCollaborated?: boolean
  role?: string
  onEventsChange?: (updater: (prev: EventData[]) => EventData[]) => void
}

// ─── Animated action button (same pattern as desktop) ─────────────────────────
function ActionButton({
  icon,
  label,
  onClick,
  colorClass,
  disabled,
}: {
  icon: React.ReactNode
  label: string
  onClick: (e: React.MouseEvent) => void
  colorClass: string
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
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

export function EventCard({ event, isCollaborated, role, onEventsChange }: EventCardProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const ticketPct =
    event.hasMaxSize && event.totalCapacity
      ? (event.ticketsSold / event.totalCapacity) * 100
      : 0

  const isFuture  = new Date(event.eventDate) > new Date()
  const canPause  = event.status === "active"   && isFuture
  const canResume = event.status === "inactive" && isFuture

  async function handlePauseResume(e: React.MouseEvent, action: "pause" | "resume") {
    e.stopPropagation()
    if (isLoading) return
    setIsLoading(true)

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
        console.error(`[card pause/resume] ${error}`)
      }
    } catch (err) {
      console.error("[card pause/resume] network error", err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="group relative bg-white border border-slate-200 rounded-xl p-6 hover:border-[#6b2fa5] hover:shadow-xl hover:shadow-[#6b2fa5]/10 transition-all duration-300 cursor-pointer">
      {/* Hover accent */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#6b2fa5] via-purple-400 to-[#6b2fa5] rounded-t-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-slate-900 text-lg mb-2 line-clamp-2 group-hover:text-[#6b2fa5] transition-colors duration-200">
            {event.eventName}
          </h3>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <MapPin className="w-4 h-4 flex-shrink-0 text-[#6b2fa5]" />
            <span className="truncate">{event.eventVenue}</span>
          </div>
        </div>
        <StatusBadge status={event.status} />
      </div>

      {/* Date */}
      <div className="flex items-center gap-2 text-sm text-slate-600 mb-6 bg-slate-50 rounded-lg px-3 py-2.5">
        <Calendar className="w-4 h-4 text-[#6b2fa5]" />
        <span className="font-medium">
          {new Date(event.eventDate).toLocaleDateString("en-US", {
            weekday: "short", year: "numeric", month: "short", day: "numeric",
          })}
        </span>
      </div>

      {/* Tickets */}
      <div className="space-y-3 mb-6">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">Ticket Sales</span>
          <div className="text-right">
            <span className="font-bold text-slate-900 text-lg">{event.ticketsSold.toLocaleString()}</span>
            {event.hasMaxSize && event.totalCapacity !== null && (
              <span className="text-sm text-slate-500 ml-1">/ {event.totalCapacity.toLocaleString()}</span>
            )}
          </div>
        </div>

        {event.hasMaxSize && event.totalCapacity !== null && (
          <div className="space-y-1.5">
            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-[#6b2fa5] to-purple-400 h-2.5 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${Math.min(ticketPct, 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">{ticketPct.toFixed(0)}% sold</span>
              {ticketPct >= 90 && <span className="text-[#6b2fa5] font-semibold">Almost full!</span>}
            </div>
          </div>
        )}
      </div>

      {/* Revenue */}
      <div className="flex items-center justify-between p-4 bg-gradient-to-br from-[#6b2fa5]/5 to-purple-50 rounded-lg border border-[#6b2fa5]/10 mb-6">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-[#6b2fa5] rounded-lg">
            <BarChart3 className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-medium text-slate-700">Total Revenue</span>
        </div>
        <span className="font-bold text-[#6b2fa5] text-xl">
          ₦{event.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-4 pt-4 border-t border-slate-100">
        {isCollaborated && role ? (
          <span className="inline-flex items-center text-xs font-bold text-[#6b2fa5] bg-[#6b2fa5]/10 px-3 py-1.5 rounded-full ring-1 ring-[#6b2fa5]/20">
            {role.toUpperCase()}
          </span>
        ) : (
          <div />
        )}

        {/* Action buttons */}
        <div className="ml-auto flex items-center gap-1" onClick={(e) => e.stopPropagation()}>

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
              onClick={(e) => handlePauseResume(e, "pause")}
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
              onClick={(e) => handlePauseResume(e, "resume")}
            />
          )}

        </div>
      </div>
    </div>
  )
}