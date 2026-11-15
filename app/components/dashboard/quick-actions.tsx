"use client"

import { Vote, Landmark, Plus, BarChart3, ChevronRight } from "lucide-react"
import Link from "next/link"

const actions = [
  {
    icon: Plus,
    label: "Create Event",
    description: "Launch a new event",
    href: "/create-event",
    accent: "bg-[#6b2fa5] text-white",
    iconBg: "bg-white/20",
    primary: true,
  },
  {
    icon: BarChart3,
    label: "All Events",
    description: "View and manage events",
    href: "/events",
    accent: "bg-white border border-slate-200",
    iconBg: "bg-[#6b2fa5]/10",
    iconColor: "text-[#6b2fa5]",
    textColor: "text-slate-800",
  },
  {
    icon: Vote,
    label: "Polls",
    description: "View and manage polls",
    href: "/polls",
    accent: "bg-white border border-slate-200",
    iconBg: "bg-[#6b2fa5]/10",
    iconColor: "text-[#6b2fa5]",
    textColor: "text-slate-800",
  },
  {
    icon: Landmark,
    label: "Elections",
    description: "View and manage elections",
    href: "/elections",
    accent: "bg-white border border-slate-200",
    iconBg: "bg-[#6b2fa5]/10",
    iconColor: "text-[#6b2fa5]",
    textColor: "text-slate-800",
  },
]

export function QuickActions() {
  return (
    <div>
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Quick Actions</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {actions.map((action) => {
          const Icon = action.icon
          return (
            <Link
              key={action.href}
              href={action.href}
              className={`group flex flex-col gap-3 p-4 rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 ${action.accent}`}
            >
              <div className={`w-9 h-9 ${action.iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                <Icon size={18} className={action.primary ? "text-white" : action.iconColor} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold leading-tight ${action.primary ? "text-white" : action.textColor}`}>
                  {action.label}
                </p>
                <p className={`text-xs mt-0.5 ${action.primary ? "text-white/70" : "text-slate-400"}`}>
                  {action.description}
                </p>
              </div>
              <ChevronRight
                size={14}
                className={`self-end group-hover:translate-x-0.5 transition-transform ${action.primary ? "text-white/60" : "text-slate-300"}`}
              />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
