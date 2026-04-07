"use client"

import { Calendar, Clock, DollarSign, Tag, User } from "lucide-react"

interface DashboardStats {
  totalEvents: number
  activeEvents: number
  inactiveEvents: number   // renamed from pastEvents
  totalRevenue: number
  availableBalance: number
  totalPaidOut: number
  totalTicketsSold: number
}

interface StatsGridProps {
  stats: DashboardStats
}

function formatNumber(num: number): string {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

function formatCurrency(amount: number): string {
  return `₦${formatNumber(Number.parseFloat(amount.toFixed(2)))}`
}

const StatCard = ({ icon: Icon, label, value, highlight = false }: any) => (
  <div
    className={`rounded-xl p-6 transition-all duration-300 hover:scale-105 hover:shadow-2xl group cursor-pointer relative overflow-hidden ${
      highlight
        ? "bg-gradient-to-br from-green-500 to-emerald-600 text-white shadow-lg shadow-green-500/30 hover:shadow-green-500/50"
        : "bg-gradient-to-br from-white to-gray-50 border border-gray-200 hover:border-[#6b2fa5] hover:from-[#6b2fa5]/5 hover:to-[#8b4fc5]/5"
    }`}
  >
    {highlight && (
      <div className="absolute inset-0 animate-[spin_3s_linear_infinite]">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent blur-sm" />
      </div>
    )}
    <div className="flex items-start gap-4 relative z-10">
      <div
        className={`p-3 rounded-lg transition-all duration-300 group-hover:scale-110 group-hover:rotate-6 ${
          highlight
            ? "bg-white/20 animate-[pulse_2s_ease-in-out_infinite]"
            : "bg-gradient-to-br from-[#6b2fa5]/10 to-[#8b4fc5]/10 group-hover:from-[#6b2fa5]/20 group-hover:to-[#8b4fc5]/20"
        }`}
      >
        <Icon
          size={24}
          className={
            highlight
              ? "text-white animate-[bounce_1s_ease-in-out_infinite]"
              : "text-[#6b2fa5] group-hover:text-[#8b4fc5]"
          }
        />
      </div>
      <div className="flex-1">
        <p
          className={`text-sm font-medium transition-colors duration-300 ${
            highlight ? "text-white/90" : "text-gray-600 group-hover:text-[#6b2fa5]"
          }`}
        >
          {label}
        </p>
        <p
          className={`text-2xl font-bold mt-1 transition-all duration-300 ${
            highlight
              ? "text-white animate-[pulse_1.5s_ease-in-out_infinite]"
              : "text-gray-900 group-hover:text-[#6b2fa5]"
          }`}
        >
          {value}
        </p>
      </div>
    </div>
  </div>
)

export function StatsGrid({ stats }: StatsGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <StatCard icon={Calendar} label="Total Events"       value={formatNumber(stats.totalEvents)} />
      <StatCard icon={Clock}    label="Active Events"      value={formatNumber(stats.activeEvents)} />
      <StatCard icon={Calendar} label="Inactive Events"    value={formatNumber(stats.inactiveEvents)} />
      <StatCard icon={Tag}      label="Tickets Sold"       value={formatNumber(stats.totalTicketsSold)} />
      <StatCard icon={DollarSign} label="Total Revenue"    value={formatCurrency(stats.totalRevenue)} />
      <StatCard
        icon={DollarSign}
        label="Available Balance"
        value={formatCurrency(stats.availableBalance)}
        // highlight={true}
      />
      <StatCard icon={DollarSign} label="Total Paid Out"   value={formatCurrency(stats.totalPaidOut)} />
      <StatCard icon={User}     label="Account State"      value="Active" />
    </div>
  )
}