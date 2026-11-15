"use client"

import { Eye, Vote, Users, TrendingUp, ArrowRight } from "lucide-react"
import Link from "next/link"
import { MaskedAmount } from "@/components/ui/masked-amount"
import { TrendBadge } from "./trend-badge"

interface Poll {
  id: string
  pollName: string
  pollImage: string
  pollStartDate: string
  pollEndDate: string
  pollAmount: number
  pollCount: number
  totalPaidOut: number
  flagged?: boolean
  suspended?: boolean
}

function fmtCurrency(n: number) {
  return `₦${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function pollStatus(poll: Poll): "upcoming" | "active" | "ended" {
  const now = Date.now()
  const start = poll.pollStartDate ? new Date(poll.pollStartDate).getTime() : null
  const end = poll.pollEndDate ? new Date(poll.pollEndDate).getTime() : null
  if (start && now < start) return "upcoming"
  if (end && now > end) return "ended"
  return "active"
}

// Window-based badge (upcoming/active/ended) — kept as-is, since a poll
// runs across a start→end window rather than a single calendar day, so
// the simpler Past/Today/Upcoming split used for events doesn't fit here.
const StatusBadge = ({ status }: { status: "upcoming" | "active" | "ended" }) => {
  const cfg: Record<string, string> = {
    active:   "bg-emerald-50 text-emerald-700 border-emerald-200",
    upcoming: "bg-blue-50 text-blue-600 border-blue-200",
    ended:    "bg-slate-100 text-slate-500 border-slate-200",
  }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${status === "active" ? "bg-emerald-500 animate-pulse" : "bg-current opacity-50"}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

// Moderation tag — flagged/suspended still apply alongside the window
// badge above, same convention as events-section.tsx.
const ModerationBadge = ({ poll }: { poll: Poll }) => {
  if (!poll.suspended && !poll.flagged) return null
  const label = poll.suspended ? "Suspended" : "Flagged"
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-red-50 text-red-600 border-red-200">
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-50" />
      {label}
    </span>
  )
}

/**
 * Top-5-recent poll entries on the dashboard, mirroring EventsSection's
 * layout/pattern — see item 9 of the UI renovation.
 */
export function PollsSection({ polls, trendPct, trendTone }: { polls: Poll[]; trendPct?: number | null; trendTone?: "up" | "down" | "flat" }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">Recent Polls</p>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900">Your Polls</h2>
            {trendPct !== undefined && <TrendBadge pct={trendPct} tone={trendTone} />}
          </div>
        </div>
        <Link
          href="/polls"
          className="group inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 bg-white hover:border-[#6b2fa5] hover:text-[#6b2fa5] text-slate-600 text-sm font-semibold transition-all duration-200 shadow-sm"
        >
          View All
          <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {polls.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
              <Vote size={24} className="text-slate-300" />
            </div>
            <p className="font-semibold text-slate-600 mb-1">No polls yet</p>
            <p className="text-sm text-slate-400 mb-5">Create your first poll to start collecting votes</p>
            <Link
              href="/polls/create"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#6b2fa5] hover:bg-[#5a2589] text-white rounded-xl font-semibold text-sm transition-colors shadow-sm"
            >
              Create Poll
            </Link>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    {["Poll", "Ends", "Votes", "Revenue", "Status", ""].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {polls.map((poll) => {
                    const status = pollStatus(poll)
                    return (
                      <tr key={poll.id} className="hover:bg-slate-50/80 transition-colors group">
                        <td className="px-5 py-4">
                          <p className="font-semibold text-slate-900 group-hover:text-[#6b2fa5] transition-colors text-sm truncate max-w-[180px]">
                            {poll.pollName}
                          </p>
                        </td>
                        <td className="px-5 py-4 text-slate-500 text-sm whitespace-nowrap">
                          {poll.pollEndDate
                            ? new Date(poll.pollEndDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                            : "—"}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5">
                            <Users size={13} className="text-[#6b2fa5]" />
                            <span className="text-sm font-medium text-slate-700">{poll.pollCount.toLocaleString()}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <MaskedAmount value={fmtCurrency(poll.pollAmount)} size="sm" className="text-slate-700" />
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <StatusBadge status={status} />
                            <ModerationBadge poll={poll} />
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <Link
                            href={`/polls/${poll.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#6b2fa5] hover:bg-[#5a2589] text-white text-xs font-semibold transition-colors"
                          >
                            <Eye size={12} /> View
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {polls.map((poll) => {
                const status = pollStatus(poll)
                return (
                  <div key={poll.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold text-slate-900 text-sm leading-tight">{poll.pollName}</p>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        <StatusBadge status={status} />
                        <ModerationBadge poll={poll} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-slate-50 rounded-lg p-2.5">
                        <p className="text-slate-400 mb-0.5">Ends</p>
                        <p className="font-semibold text-slate-700">
                          {poll.pollEndDate
                            ? new Date(poll.pollEndDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                            : "—"}
                        </p>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-2.5">
                        <p className="text-slate-400 mb-0.5">Votes</p>
                        <p className="font-semibold text-slate-700">{poll.pollCount.toLocaleString()}</p>
                      </div>
                      <div className="bg-[#6b2fa5]/5 border border-[#6b2fa5]/15 rounded-lg p-2.5 col-span-2">
                        <p className="text-slate-400 mb-0.5">Revenue</p>
                        <MaskedAmount value={fmtCurrency(poll.pollAmount)} size="sm" className="text-[#6b2fa5] font-bold" />
                      </div>
                    </div>

                    <Link
                      href={`/polls/${poll.id}`}
                      className="flex items-center justify-center gap-2 w-full py-2.5 bg-[#6b2fa5] hover:bg-[#5a2589] text-white rounded-xl font-semibold text-sm transition-colors"
                    >
                      <Eye size={14} /> View Details
                    </Link>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
