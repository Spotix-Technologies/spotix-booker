// app/components/event-info/helper/ques.tsx
//
// "Ques" — small dismiss-free inline banners that nudge the booker about
// the state of their online check-in registry (has one been built yet? is
// it out of sync with new ticket sales? do they also have offline sync
// set up?). Shared between the Attendees tab and the Check-in tab so the
// wording and styling only live in one place.

"use client"

import type React from "react"
import { Info, AlertTriangle, RefreshCw } from "lucide-react"

export type QueTone = "info" | "warning"

interface QueProps {
  message: string
  tone?: QueTone
  href?: string
  linkLabel?: string
  actionLabel?: string
  onAction?: () => void
  actionLoading?: boolean
}

const TONE_STYLES: Record<QueTone, { wrap: string; icon: React.ReactNode }> = {
  info: {
    wrap: "bg-blue-50 border-blue-200 text-blue-800",
    icon: <Info size={16} className="text-blue-500 flex-shrink-0" />,
  },
  warning: {
    wrap: "bg-amber-50 border-amber-200 text-amber-800",
    icon: <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />,
  },
}

export default function Que({
  message,
  tone = "info",
  href,
  linkLabel,
  actionLabel,
  onAction,
  actionLoading,
}: QueProps) {
  const styles = TONE_STYLES[tone]
  return (
    <div className={`flex items-center gap-3 flex-wrap rounded-xl border px-4 py-3 text-sm ${styles.wrap}`}>
      {styles.icon}
      <p className="flex-1 min-w-[220px] leading-relaxed">{message}</p>
      {href && linkLabel && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold underline underline-offset-2 flex-shrink-0"
        >
          {linkLabel}
        </a>
      )}
      {/* Icon-only action button — actionLabel is kept as the accessible
          name (aria-label/title) rather than visible text; the message
          itself already says what the action does. */}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          disabled={actionLoading}
          aria-label={actionLabel}
          title={actionLabel}
          className="flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white border border-current hover:bg-black/5 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={actionLoading ? "animate-spin" : ""} />
        </button>
      )}
    </div>
  )
}
