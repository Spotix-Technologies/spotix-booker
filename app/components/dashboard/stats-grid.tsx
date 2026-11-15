"use client"

import { CalendarClock, CalendarCheck2 } from "lucide-react"
import { MaskedAmount, BalanceToggleButton } from "@/components/ui/masked-amount"
import { useBalanceVisibilityRoot, BalanceVisibilityCtx } from "@/hooks/use-balance-visibility"
import { TrendBadge } from "./trend-badge"

interface DashboardStats {
  totalEvents: number
  activeEvents: number
  inactiveEvents: number
  totalRevenue: number
  availableBalance: number
  totalPaidOut: number
  totalTicketsSold: number
  // Date-based grouping (today counts as "upcoming" — see lib/event-time-status.ts)
  upcomingEvents?: number
  pastEvents?: number
}

function fmt(n: number) {
  return n.toLocaleString()
}
function fmtCurrency(n: number) {
  return `₦${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

export function StatsGrid({ stats, eventsTrendPct, eventsTrendTone }: { stats: DashboardStats; eventsTrendPct?: number | null; eventsTrendTone?: "up" | "down" | "flat" }) {
  const balanceCtx = useBalanceVisibilityRoot()

  return (
    <BalanceVisibilityCtx.Provider value={balanceCtx}>
      <div className="space-y-3">

        {/* Section label + global toggle */}
        <div className="flex items-center justify-between px-0.5">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Overview</p>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span>Balances</span>
            <BalanceToggleButton />
          </div>
        </div>

        {/* Row 1: upcoming vs past — grouped by date rather than active/inactive/tickets */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Upcoming Events"
            value={fmt(stats.upcomingEvents ?? 0)}
            icon={<CalendarClock size={15} className="text-[#6b2fa5]" />}
            iconBg="bg-[#6b2fa5]/10"
            valueColor="text-slate-900"
            delay="delay-[0ms]"
            trendPct={eventsTrendPct}
            trendTone={eventsTrendTone}
          />
          <StatCard
            label="Past Events"
            value={fmt(stats.pastEvents ?? 0)}
            icon={<CalendarCheck2 size={15} className="text-[#6b2fa5]" />}
            iconBg="bg-[#6b2fa5]/10"
            valueColor="text-slate-900"
            delay="delay-[50ms]"
          />
        </div>

        {/* Row 2: financials — each has its own blockKey for independent toggle */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FinancialCard
            label="Total Revenue"
            amount={fmtCurrency(stats.totalRevenue)}
            sub="All ticket sales"
            accent="text-slate-900"
            blockKey="revenue"
            delay="delay-[200ms]"
          />
          <FinancialCard
            label="Available Balance"
            amount={fmtCurrency(stats.availableBalance)}
            sub="Ready to withdraw"
            accent="text-[#6b2fa5]"
            blockKey="balance"
            highlight
            delay="delay-[250ms]"
          />
          <FinancialCard
            label="Total Paid Out"
            amount={fmtCurrency(stats.totalPaidOut)}
            sub="Withdrawn to date"
            accent="text-emerald-700"
            blockKey="paidOut"
            delay="delay-[300ms]"
          />
        </div>
      </div>
    </BalanceVisibilityCtx.Provider>
  )
}

function StatCard({
  label, value, icon, iconBg, valueColor, delay, trendPct, trendTone,
}: {
  label: string; value: string; icon: React.ReactNode
  iconBg: string; valueColor: string; delay: string; trendPct?: number | null; trendTone?: "up" | "down" | "flat"
}) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm p-3 sm:p-4 flex items-center gap-2.5 sm:gap-3 min-w-0 overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 ${delay}`}>
      <div className={`w-8 h-8 ${iconBg} rounded-lg flex items-center justify-center flex-shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] sm:text-xs text-slate-400 font-medium leading-tight mb-1.5 break-words">{label}</p>
        {/* Trend badge sits beside the value (not the label) so it stays inside the card on narrow screens */}
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <p className={`text-lg font-bold leading-none ${valueColor}`}>{value}</p>
          {trendPct !== undefined && (
            <span className="flex-shrink-0 max-w-full">
              <TrendBadge pct={trendPct} tone={trendTone} />
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function FinancialCard({
  label, amount, sub, accent, highlight, blockKey, delay,
}: {
  label: string; amount: string; sub: string
  accent: string; highlight?: boolean
  blockKey: "revenue" | "balance" | "paidOut"
  delay: string
}) {
  return (
    <div
      className={`rounded-xl border shadow-sm p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 ${delay} ${
        highlight
          ? "bg-gradient-to-br from-[#6b2fa5] to-[#7c3aed] border-[#6b2fa5]/30 text-white"
          : "bg-white border-slate-200"
      }`}
    >
      <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${highlight ? "text-white/70" : "text-slate-400"}`}>
        {label}
      </p>
      <MaskedAmount
        value={amount}
        size="xl"
        blockKey={blockKey}
        className={highlight ? "text-white" : accent}
        iconClassName={highlight ? "text-white/50 hover:text-white" : ""}
      />
      <p className={`text-xs mt-1.5 ${highlight ? "text-white/60" : "text-slate-400"}`}>{sub}</p>
    </div>
  )
}
