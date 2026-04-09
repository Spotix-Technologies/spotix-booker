"use client"

import { ArrowLeft, FolderPlus, FolderCheck, Check, ArrowRight, Info } from "lucide-react"
import Image from "next/image"

interface EventGroupLobbyProps {
  onCreateCollection: () => void
  onAddToCollection: () => void
  onBack: () => void
}

export function EventGroupLobby({ onCreateCollection, onAddToCollection, onBack }: EventGroupLobbyProps) {
  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-8 animate-in fade-in duration-700">

      {/* Back */}
      <button
        onClick={onBack}
        className="group inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-[#6b2fa5] border border-slate-200 hover:border-[#6b2fa5]/40 rounded-lg px-3.5 py-2 transition-all duration-150"
      >
        <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
        Back to event type
      </button>

      {/* Hero — text left, image right */}
      <div className="grid md:grid-cols-[1fr_auto] gap-10 items-start">
        <div className="space-y-4">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span>Create event</span>
            <span>›</span>
            <span className="text-[#6b2fa5]">Event group</span>
          </div>

          <h1 className="text-4xl font-semibold text-slate-900 leading-tight">
            Event <span className="text-[#6b2fa5]">Group</span> Options
          </h1>

          <p className="text-slate-500 leading-relaxed max-w-lg">
            Organise recurring events under a single collection. Start fresh with a new series,
            or slot a new date into one you've already built.
          </p>

          <div className="flex flex-wrap gap-4">
            {[
              "Shared branding across series",
              "Per-instance ticket pricing",
              "Unified revenue tracking",
            ].map((f) => (
              <span key={f} className="flex items-center gap-1.5 text-xs text-slate-500">
                <Check className="w-3 h-3 text-[#6b2fa5]" />
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* Illustration — tucked to the right */}
        <div className="hidden md:flex items-center justify-center w-44 bg-slate-50 border border-slate-100 rounded-2xl p-5 flex-shrink-0">
          <Image
            src="/event-group.svg"
            alt="Event group illustration"
            width={140}
            height={140}
            className="w-full h-auto"
          />
        </div>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-4">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-xs text-slate-400">Choose an option</span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>

      {/* Cards */}
      <div className="grid md:grid-cols-2 gap-5">
        {[
          {
            action: onCreateCollection,
            icon: FolderPlus,
            title: "Create New Collection",
            tag: "Start fresh",
            desc: "Start a brand-new event series with its own template, recurrence, and branding.",
            features: [
              "New event group template",
              "Set recurrence frequency",
              "Add individual event instances",
              "Manage as a unified series",
            ],
            footer: "No existing collection needed",
            cta: "Create",
          },
          {
            action: onAddToCollection,
            icon: FolderCheck,
            title: "Add to Existing Collection",
            tag: "Add to existing",
            desc: "Pick one of your existing collections and slot in a new event date.",
            features: [
              "Browse your collections",
              "Inherit collection settings",
              "Override pricing per instance",
              "Quick setup — fewer steps",
            ],
            footer: "Requires an existing collection",
            cta: "Add event",
          },
        ].map(({ action, icon: Icon, title, tag, desc, features, footer, cta }) => (
          <button
            key={title}
            onClick={action}
            className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-7 text-left transition-all duration-200 hover:border-[#6b2fa5] hover:-translate-y-1 hover:shadow-lg hover:shadow-[#6b2fa5]/10 active:translate-y-0"
          >
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#6b2fa5] opacity-0 group-hover:opacity-100 transition-opacity" />

            <div className="flex items-start justify-between mb-5">
              <div className="w-12 h-12 rounded-xl bg-[#6b2fa5]/10 flex items-center justify-center transition-colors group-hover:bg-[#6b2fa5]">
                <Icon className="w-5 h-5 text-[#6b2fa5] group-hover:text-white transition-colors" />
              </div>
              <span className="text-xs text-slate-400 border border-slate-200 rounded-full px-2.5 py-1">
                {tag}
              </span>
            </div>

            <h2 className="text-lg font-semibold text-slate-900 mb-1 group-hover:text-[#6b2fa5] transition-colors">
              {title}
            </h2>
            <p className="text-sm text-slate-500 leading-relaxed mb-5">{desc}</p>

            <ul className="space-y-2 border-t border-slate-100 pt-4 mb-5">
              {features.map((f) => (
                <li key={f} className="flex items-center gap-2.5 text-sm text-slate-500">
                  <span className="w-4 h-4 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
                    <Check className="w-2.5 h-2.5 text-emerald-600" />
                  </span>
                  {f}
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between border-t border-slate-100 pt-4">
              <span className="text-xs text-slate-400">{footer}</span>
              <span className="flex items-center gap-1.5 text-sm font-medium text-[#6b2fa5]">
                {cta}
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
          <span className="font-medium">Tip:</span> Collections help you organise recurring events
          like monthly workshops or seasonal festivals. Create a new collection to start fresh, or
          add to an existing one to continue your series.
        </p>
      </div>
    </div>
  )
}