"use client"

import { useState, useEffect } from "react"
import { getTimeBasedGreeting, getGreetingAddon } from "@/lib/greeting-utils"
import { RefreshCw, Plus, CalendarDays, ChevronRight } from "lucide-react"
import Link from "next/link"
import Image from "next/image"

interface DashboardHeaderProps {
  userName: string
  onRefresh: () => void
  isRefreshing: boolean
  lastRefreshed: Date | null
}

export function DashboardHeader({ userName, onRefresh, isRefreshing, lastRefreshed }: DashboardHeaderProps) {
  const [now, setNow] = useState(new Date())
  const greeting = getTimeBasedGreeting()
  const addon    = getGreetingAddon()
  const hour     = now.getHours()

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  })
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  })

  const gradientClass =
    hour >= 5 && hour < 12
      ? "from-[#5a2595] to-[#7c3aed]"
      : hour >= 12 && hour < 18
      ? "from-[#6b2fa5] to-[#7c3aed]"
      : "from-[#3d1578] to-[#6b2fa5]"

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4">

      {/*  Greeting card  */}
      <div className={`relative bg-gradient-to-br ${gradientClass} rounded-2xl p-7 text-white overflow-hidden shadow-lg`}>
        {/* create-event-bg.png as a backdrop — sits under the gradient
            overlay so text stays readable. Assumed filename/ext; swap the
            path below if it's actually .jpg/.webp/etc. */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-45"
          style={{ backgroundImage: "url('/create-event-bg.jpg')" }}
        />
        {/* Color overlay on top of the image so copy stays legible — lighter
            than before so the image reads through more clearly */}
        <div className={`absolute inset-0 bg-gradient-to-br ${gradientClass} opacity-70`} />

        {/* Subtle grid pattern */}
        <div className="absolute inset-0 opacity-[0.07]">
          <svg className="w-full h-full" viewBox="0 0 800 200">
            <defs>
              <pattern id="hgrid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="800" height="200" fill="url(#hgrid)" />
          </svg>
        </div>

        {/* Ambient orbs */}
        <div className="absolute -top-16 -right-16 w-56 h-56 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-white/5 rounded-full blur-2xl" />

        <div className="relative z-10 flex items-start justify-between gap-4">
          <div className="space-y-2 flex-1">
            {/* Uptime status badge. The iframe's own internal link isn't
                reliably tappable on mobile (cross-origin iframe click
                events don't bubble to a wrapping <a>), so a transparent
                anchor sits on top of it to guarantee the tap works
                everywhere. */}
            <div className="relative inline-block">
              <iframe
                src="https://status.spotix.com.ng/badge?theme=dark"
                width="250"
                height="30"
                frameBorder="0"
                scrolling="no"
                style={{ colorScheme: "normal", pointerEvents: "none" }}
              />
              <a
                href="https://status.spotix.com.ng"
                target="_blank"
                rel="noopener noreferrer"
                className="absolute inset-0"
                aria-label="View status page"
              />
            </div>

            <div>
              <p className="text-white/70 text-sm font-medium">{greeting},</p>
              <h1 className="text-3xl font-black tracking-tight mt-0.5">
                {userName} 👋
              </h1>
            </div>

            <p className="text-white/80 text-sm leading-relaxed max-w-sm">{addon}</p>
          </div>

          {/* Logo */}
          <div className="hidden sm:block flex-shrink-0">
            <div className="relative w-16 h-16 rounded-2xl overflow-hidden ring-2 ring-white/20 shadow-xl">
              <Image src="/logo.png" alt="Spotix" fill className="object-cover" priority />
            </div>
          </div>
        </div>

        {/* Bottom: time */}
        <div className="relative z-10 mt-5 pt-4 border-t border-white/15 flex items-center justify-between">
          <div>
            <p className="text-2xl font-bold tabular-nums tracking-wider">{timeStr}</p>
            <p className="text-white/60 text-xs mt-0.5 flex items-center gap-1">
              <CalendarDays size={11} /> {dateStr}
            </p>
          </div>
          {lastRefreshed && (
            <p className="text-white/40 text-xs hidden sm:block">
              Updated {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
      </div>

      {/*  Right action panel  */}
      <div className="lg:w-72 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Quick Actions</p>

        <Link
          href="/create-event"
          className="group flex items-center gap-3 w-full px-4 py-3 bg-[#6b2fa5] hover:bg-[#5a2589] text-white rounded-xl font-semibold text-sm transition-all duration-200 shadow-sm hover:shadow-md"
        >
          <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
            <Plus size={16} />
          </div>
          <span className="flex-1">Create Event</span>
          <ChevronRight size={15} className="opacity-60 group-hover:translate-x-0.5 transition-transform" />
        </Link>

        <Link
          href="/events"
          className="group flex items-center gap-3 w-full px-4 py-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 hover:text-slate-900 rounded-xl font-semibold text-sm transition-all duration-200"
        >
          <div className="w-7 h-7 bg-[#6b2fa5]/10 rounded-lg flex items-center justify-center flex-shrink-0">
            <CalendarDays size={15} className="text-[#6b2fa5]" />
          </div>
          <span className="flex-1">View All Events</span>
          <ChevronRight size={15} className="opacity-40 group-hover:translate-x-0.5 transition-transform" />
        </Link>

        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="group flex items-center gap-3 w-full px-4 py-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl font-semibold text-sm transition-all duration-200 disabled:opacity-50"
        >
          <div className="w-7 h-7 bg-slate-200 rounded-lg flex items-center justify-center flex-shrink-0">
            <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
          </div>
          <span className="flex-1 text-left">{isRefreshing ? "Refreshing…" : "Refresh Data"}</span>
        </button>
      </div>
    </div>
  )
}
