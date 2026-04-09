"use client"

import { Eye, Calendar, Ticket, TrendingUp, Wallet } from "lucide-react"
import Link from "next/link"

interface Event {
  id: string
  eventName: string
  eventDate: string
  ticketsSold: number
  revenue: number
  availableBalance: number
  status: string
}

interface EventsSectionProps {
  events: Event[]
  userId: string | null // Added userId prop to construct proper navigation links
}

function formatNumber(num: number): string {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

function formatCurrency(amount: number): string {
  return `₦${formatNumber(Number.parseFloat(amount.toFixed(2)))}`
}

const StatusBadge = ({ status }: { status: string }) => (
  <span
    className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold shadow-sm ${
      status === "active"
        ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white"
        : "bg-gradient-to-r from-gray-400 to-gray-500 text-white"
    }`}
  >
    <span
      className={`w-1.5 h-1.5 rounded-full mr-2 ${status === "active" ? "bg-white animate-pulse" : "bg-gray-200"}`}
    ></span>
    {status.charAt(0).toUpperCase() + status.slice(1)}
  </span>
)

export function EventsSection({ events, userId }: EventsSectionProps) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-bold bg-gradient-to-r from-[#6b2fa5] to-[#8b4fc5] bg-clip-text text-transparent">
          Recent Events
        </h2>
        <Link
          href="/events"
          className="group flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#6b2fa5] to-[#8b4fc5] text-white rounded-lg hover:shadow-lg hover:shadow-[#6b2fa5]/30 hover:scale-105 font-semibold transition-all duration-300"
        >
          View All
          <span className="group-hover:translate-x-1 transition-transform duration-300">→</span>
        </Link>
      </div>

      <div className="bg-white rounded-2xl overflow-hidden shadow-xl border border-gray-100">
        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gradient-to-r from-[#6b2fa5] to-[#8b4fc5] text-white">
                <th className="px-6 py-4 text-left text-sm font-bold">Event Name</th>
                <th className="px-6 py-4 text-left text-sm font-bold">Date</th>
                <th className="px-6 py-4 text-left text-sm font-bold">Tickets</th>
                <th className="px-6 py-4 text-left text-sm font-bold">Revenue</th>
                <th className="px-6 py-4 text-left text-sm font-bold">Balance</th>
                <th className="px-6 py-4 text-left text-sm font-bold">Status</th>
                <th className="px-6 py-4 text-left text-sm font-bold">Action</th>
              </tr>
            </thead>
            <tbody>
              {events.length > 0 ? (
                events.map((event, index) => (
                  <tr
                    key={event.id}
                    className={`border-b border-gray-100 hover:bg-gradient-to-r hover:from-[#6b2fa5]/5 hover:to-[#8b4fc5]/5 transition-all duration-300 group ${
                      index % 2 === 0 ? "bg-white" : "bg-gray-50/50"
                    }`}
                  >
                    <td className="px-6 py-4 font-semibold text-gray-900 group-hover:text-[#6b2fa5] transition-colors">
                      {event.eventName}
                    </td>
                    <td className="px-6 py-4 text-gray-700">
                      <div className="flex items-center gap-2">
                        <Calendar size={16} className="text-[#6b2fa5]" />
                        {new Date(event.eventDate).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Ticket size={16} className="text-[#6b2fa5]" />
                        <span className="font-medium text-gray-900">{formatNumber(event.ticketsSold)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <TrendingUp size={16} className="text-green-600" />
                        <span className="font-semibold text-gray-900">{formatCurrency(event.revenue)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Wallet size={16} className="text-emerald-600" />
                        <span className="font-bold text-emerald-600">{formatCurrency(event.availableBalance)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={event.status} />
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        href={userId ? `/event-info/${event.id}` : `/event/${event.id}`}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-[#6b2fa5] to-[#8b4fc5] text-white hover:shadow-lg hover:shadow-[#6b2fa5]/30 hover:scale-105 transition-all duration-300 text-sm font-semibold"
                      >
                        <Eye size={16} />
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#6b2fa5]/10 to-[#8b4fc5]/10 flex items-center justify-center">
                        <Calendar size={32} className="text-[#6b2fa5]" />
                      </div>
                      <p className="text-gray-500 font-medium">No events found. Create your first event!</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden">
          {events.length > 0 ? (
            events.map((event, index) => (
              <div
                key={event.id}
                className={`p-5 border-b border-gray-100 last:border-b-0 hover:bg-gradient-to-r hover:from-[#6b2fa5]/5 hover:to-[#8b4fc5]/5 transition-all duration-300 ${
                  index % 2 === 0 ? "bg-white" : "bg-gray-50/50"
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <h3 className="font-bold text-lg text-gray-900">{event.eventName}</h3>
                  <StatusBadge status={event.status} />
                </div>
                <div className="space-y-3 mb-4">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-[#6b2fa5]/5 to-[#8b4fc5]/5">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Calendar size={18} className="text-[#6b2fa5]" />
                      <span className="text-sm font-medium">Date</span>
                    </div>
                    <span className="font-semibold text-gray-900">
                      {new Date(event.eventDate).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-[#6b2fa5]/5 to-[#8b4fc5]/5">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Ticket size={18} className="text-[#6b2fa5]" />
                      <span className="text-sm font-medium">Tickets</span>
                    </div>
                    <span className="font-semibold text-gray-900">{formatNumber(event.ticketsSold)}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-[#6b2fa5]/5 to-[#8b4fc5]/5">
                    <div className="flex items-center gap-2 text-gray-600">
                      <TrendingUp size={18} className="text-green-600" />
                      <span className="text-sm font-medium">Revenue</span>
                    </div>
                    <span className="font-semibold text-gray-900">{formatCurrency(event.revenue)}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-emerald-500/10 to-green-600/10 border border-emerald-200">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Wallet size={18} className="text-emerald-600" />
                      <span className="text-sm font-medium">Balance</span>
                    </div>
                    <span className="font-bold text-emerald-600">{formatCurrency(event.availableBalance)}</span>
                  </div>
                </div>
                <Link
                  href={userId ? `/event-info/${event.id}` : `/event/${event.id}`}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-gradient-to-r from-[#6b2fa5] to-[#8b4fc5] text-white hover:shadow-lg hover:shadow-[#6b2fa5]/30 hover:scale-[1.02] transition-all duration-300 text-sm font-semibold"
                >
                  <Eye size={16} />
                  View Details
                </Link>
              </div>
            ))
          ) : (
            <div className="p-8 text-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#6b2fa5]/10 to-[#8b4fc5]/10 flex items-center justify-center">
                  <Calendar size={32} className="text-[#6b2fa5]" />
                </div>
                <p className="text-gray-500 font-medium">No events found. Create your first event!</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
