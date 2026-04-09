"use client"

import { Calendar, Repeat, ArrowRight, Check, Info } from "lucide-react"
import Image from "next/image"

interface EventTypeSelectorProps {
  onSelect: (type: "one-time" | "event-group") => void
}

export function EventTypeSelector({ onSelect }: EventTypeSelectorProps) {
  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-10 animate-in fade-in duration-700">

      {/* Hero — two-column */}
      <div className="grid md:grid-cols-2 gap-12 items-center">
        <div className="space-y-5">
          <h1 className="text-4xl font-semibold text-slate-900 leading-tight">
            Create an <span className="text-[#6b2fa5]">Event</span> on Spotix
          </h1>
          <p className="text-slate-600 leading-relaxed">
            Choose the format that fits your event. Whether it's a one-off occasion
            or a series you'll run again and again, we've got you covered.
          </p>
          <div className="flex flex-wrap gap-4">
            {["Sell tickets in ₦", "Real-time analytics", "Fast payouts"].map((f) => (
              <span key={f} className="flex items-center gap-1.5 text-sm text-slate-600">
                <Check className="w-3.5 h-3.5 text-[#6b2fa5]" />
                {f}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-center bg-slate-50 border border-slate-100 rounded-2xl p-6">
          <Image
            src="/create-event.svg"
            alt="Create event illustration"
            width={320}
            height={240}
            className="w-full max-w-xs h-auto"
          />
        </div>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-4">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-xs text-slate-400">Select event type</span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>

      {/* Cards */}
      <div className="grid md:grid-cols-2 gap-5">
        {[
          {
            type: "one-time" as const,
            icon: Calendar,
            title: "One-Time Event",
            desc: "A single occasion with a fixed date, time, and uniform ticket pricing.",
            badge: "Quick & Easy",
            features: [
              "Single date and time",
              "Uniform ticket pricing",
              "Simple setup and management",
              "Best for one-time occasions",
            ],
          },
          {
            type: "event-group" as const,
            icon: Repeat,
            title: "Event Group",
            desc: "A recurring series with multiple dates, variations, and flexible pricing.",
            badge: "Advanced",
            features: [
              "Multiple dates and variations",
              "Yearly, monthly, or quarterly recurrence",
              "Flexible pricing per instance",
              "Manage series collectively",
            ],
          },
        ].map(({ type, icon: Icon, title, desc, badge, features }) => (
          <button
            key={type}
            onClick={() => onSelect(type)}
            className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-7 text-left transition-all duration-200 hover:border-[#6b2fa5] hover:-translate-y-1 hover:shadow-lg hover:shadow-[#6b2fa5]/10 active:translate-y-0"
          >
            {/* Accent bar */}
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#6b2fa5] opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

            {/* Icon */}
            <div className="w-12 h-12 rounded-xl bg-[#6b2fa5]/10 flex items-center justify-center mb-5 transition-colors duration-200 group-hover:bg-[#6b2fa5]">
              <Icon className="w-5 h-5 text-[#6b2fa5] group-hover:text-white transition-colors duration-200" />
            </div>

            <h2 className="text-xl font-semibold text-slate-900 mb-1 group-hover:text-[#6b2fa5] transition-colors">
              {title}
            </h2>
            <p className="text-sm text-slate-500 leading-relaxed mb-5">{desc}</p>

            <ul className="space-y-2.5 border-t border-slate-100 pt-5 mb-6">
              {features.map((f) => (
                <li key={f} className="flex items-center gap-2.5 text-sm text-slate-600">
                  <span className="w-4 h-4 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
                    <Check className="w-2.5 h-2.5 text-emerald-600" />
                  </span>
                  {f}
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between border-t border-slate-100 pt-5">
              <span className="text-xs text-slate-400 border border-slate-200 rounded-full px-3 py-1">
                {badge}
              </span>
              <span className="flex items-center gap-1.5 text-sm font-medium text-[#6b2fa5]">
                Get started
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Help note */}
      <div className="flex gap-3 items-start bg-blue-50 border border-blue-100 rounded-xl px-4 py-3.5">
        <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-blue-800 leading-relaxed">
          <span className="font-medium">Not sure which to pick?</span> One-time events suit
          conferences, concerts, and parties. Event groups work best for weekly meetups, monthly
          workshops, or seasonal festivals.
        </p>
      </div>
    </div>
  )
}