"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import { EventCard } from "./event-card"
import { StatusBadge, TicketCell } from "./event-ui"
import { Users, ArrowRight, Shield, UserCheck, Calculator } from "lucide-react"
import type { CollaboratedEventData } from "@/types/event"

interface CollaboratedEventsListProps {
  events: CollaboratedEventData[]
  searchQuery: string
  statusFilter: string
}

const ROLE_BADGE: Record<string, string> = {
  admin:      "bg-rose-50 text-rose-700 ring-1 ring-rose-600/20",
  checkin:    "bg-blue-50 text-blue-700 ring-1 ring-blue-600/20",
  accountant: "bg-[#6b2fa5]/10 text-[#6b2fa5] ring-1 ring-[#6b2fa5]/20",
}

function RoleIcon({ role }: { role: string }) {
  if (role === "admin")      return <Shield className="w-3.5 h-3.5" />
  if (role === "checkin")    return <UserCheck className="w-3.5 h-3.5" />
  if (role === "accountant") return <Calculator className="w-3.5 h-3.5" />
  return null
}

export function CollaboratedEventsList({ events, searchQuery, statusFilter }: CollaboratedEventsListProps) {
  const router = useRouter()

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const matchesSearch =
        event.eventName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.eventVenue.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesStatus = statusFilter === "all" || event.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [events, searchQuery, statusFilter])

  if (filteredEvents.length === 0) return null

  return (
    <div className="mb-12">
      {/* Section Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-br from-[#6b2fa5] to-purple-600 rounded-lg shadow-md">
          <Users className="text-white" size={20} />
        </div>
        <div>
          <h2 className="text-3xl font-bold text-slate-900">Collaborated Events</h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Events where you're a team member •{" "}
            {filteredEvents.length} {filteredEvents.length === 1 ? "event" : "events"}
          </p>
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block">
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-purple-600 to-[#6b2fa5]">
                <tr>
                  {["Event Name", "Date", "Venue", "Your Role", "Tickets", "Status", "Action"].map((h) => (
                    <th key={h} className="px-6 py-4 text-left text-sm font-bold text-white">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEvents.map((event) => (
                  <tr
                    key={`${event.ownerId}-${event.id}`}
                    className="group hover:bg-purple-50/50 transition-colors duration-150 cursor-pointer"
                    onClick={() => router.push(`/event-info/${event.id}`)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 group-hover:text-[#6b2fa5] transition-colors">
                          {event.eventName}
                        </span>
                        <span className="inline-flex items-center px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-bold uppercase rounded tracking-wide">
                          Team
                        </span>
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
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${ROLE_BADGE[event.role] ?? "bg-slate-50 text-slate-700 ring-1 ring-slate-500/20"}`}>
                        <RoleIcon role={event.role} />
                        <span>{event.role.charAt(0).toUpperCase() + event.role.slice(1)}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <TicketCell event={event} />
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={event.status} />
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push(`/event-info/${event.id}`) }}
                        className="inline-flex items-center gap-1.5 text-[#6b2fa5] hover:text-[#5a2589] font-semibold text-sm transition-colors group/btn"
                      >
                        <span>View</span>
                        <ArrowRight className="w-4 h-4 transition-transform group-hover/btn:translate-x-1" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-purple-50 to-[#6b2fa5]/5 border border-purple-200/50 rounded-lg">
          <div className="flex items-center justify-center w-8 h-8 bg-white rounded-full shadow-sm flex-shrink-0">
            <Users className="w-4 h-4 text-[#6b2fa5]" />
          </div>
          <p className="text-sm text-slate-700">
            <span className="font-semibold">Collaboration Mode:</span> Your permissions are based on your assigned role for each event.
          </p>
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-4">
        {filteredEvents.map((event) => (
          <EventCard
            key={`${event.ownerId}-${event.id}`}
            event={event}
            isCollaborated
            role={event.role}
          />
        ))}

        <div className="mt-6 flex items-start gap-3 p-4 bg-gradient-to-br from-purple-50 to-[#6b2fa5]/5 border border-purple-200/50 rounded-lg">
          <div className="flex items-center justify-center w-8 h-8 bg-white rounded-full shadow-sm flex-shrink-0 mt-0.5">
            <Users className="w-4 h-4 text-[#6b2fa5]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900 mb-1">Team Member Access</p>
            <p className="text-xs text-slate-600">Your permissions are based on your assigned role for each event.</p>
          </div>
        </div>
      </div>
    </div>
  )
}