"use client"

import { Users } from "lucide-react"

interface VirtualQueueNoticeProps {
  eventData: {
    virtualQueueEnabled?: boolean
    queueBatchSize?: number
  }
}

/**
 * components/event-info/virtual-queue-notice.tsx
 *
 * Surfaces on the booker's Overview tab whenever spotix-admin has turned
 * on the virtual queue for this event (event-data-tab.tsx's "toggleQueue"
 * action -> event.virtualQueueEnabled / event.queueBatchSize on the event
 * doc). Read-only from here — the toggle itself stays admin-only; this is
 * just a notice so the booker understands why checkout looks different.
 *
 * Renders nothing when the queue isn't set up for this event.
 */
export default function VirtualQueueNotice({ eventData }: VirtualQueueNoticeProps) {
  if (!eventData?.virtualQueueEnabled) return null

  const batchSize = eventData.queueBatchSize || 50

  return (
    <div className="rounded-2xl border border-purple-200 bg-purple-50/30 p-5 flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg bg-purple-100 border border-purple-200 flex items-center justify-center flex-shrink-0">
        <Users className="w-4 h-4 text-[#6b2fa5]" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-sm text-slate-800">Virtual queue is active</p>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#6b2fa5]/10 text-[#6b2fa5]">
            Active
          </span>
        </div>
        <p className="text-sm text-slate-600 mt-1 leading-relaxed">
          Buyers wait in a virtual line and are admitted to checkout in batches of {batchSize}, instead of
          everyone hitting checkout at once. This was turned on by Spotix admin for this event.
        </p>
        <a href="#" className="inline-flex items-center gap-1 text-xs font-semibold text-[#6b2fa5] hover:text-[#5a2589] mt-2">
          What is this?
        </a>
      </div>
    </div>
  )
}
