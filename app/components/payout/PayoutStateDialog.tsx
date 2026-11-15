"use client"

import { useRef, useState } from "react"
import ResponsiveSheet from "@/components/ui/responsive-sheet"
import { ChevronLeft, ChevronRight } from "lucide-react"
import PayoutStatusCard from "./PayoutStatusCard"
import type { PayoutLiveState } from "./use-payout-stream"

interface PayoutStateDialogProps {
  /** One reference → single card. More than one → swipeable carousel. */
  references: string[]
  onClose: () => void
  /** Fires whenever any card's live status changes — lets the page behind
   *  this dialog (e.g. the Transaction Days list) update its own status
   *  badges in real time, independent of whether this dialog stays open. */
  onStatusChange?: (state: PayoutLiveState) => void
}

/**
 * The live-progress dialog opened the moment a payout begins (right
 * after POST /api/payout or /api/polls/payout returns a reference, or
 * once PATCH /api/payout/vault reports released:true). Each card
 * subscribes to its own SSE stream independently via
 * usePayoutStream/PayoutStatusCard — closing this dialog does NOT stop
 * processing, it's purely a viewer. Every payout keeps its final state
 * in the payout log regardless of whether this stays open.
 */
export default function PayoutStateDialog({ references, onClose, onStatusChange }: PayoutStateDialogProps) {
  const [index, setIndex] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const isBulk = references.length > 1

  function goTo(i: number) {
    const clamped = Math.max(0, Math.min(references.length - 1, i))
    setIndex(clamped)
    const el = scrollRef.current
    if (el) {
      el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" })
    }
  }

  function handleScroll() {
    const el = scrollRef.current
    if (!el || el.clientWidth === 0) return
    const i = Math.round(el.scrollLeft / el.clientWidth)
    if (i !== index) setIndex(i)
  }

  return (
    <ResponsiveSheet
      open
      onClose={onClose}
      size="md"
      zIndex={70}
      title={isBulk ? `Payout ${index + 1} of ${references.length}` : "Payout in progress"}
      description={isBulk ? "Swipe or use the arrows to check on other transactions" : undefined}
      bodyClassName="py-4"
    >
      {/* Card(s) */}
      <div className="relative">
        {isBulk && (
          <button
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-white shadow-md border border-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={16} />
          </button>
        )}

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth px-5 pb-2 gap-4"
          style={{ scrollbarWidth: "none" }}
        >
          {references.map((reference) => (
            <div key={reference} className="w-full flex-shrink-0 snap-center" style={{ minWidth: "100%" }}>
              <PayoutStatusCard reference={reference} onStatusChange={onStatusChange} />
            </div>
          ))}
        </div>

        {isBulk && (
          <button
            onClick={() => goTo(index + 1)}
            disabled={index === references.length - 1}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-white shadow-md border border-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={16} />
          </button>
        )}
      </div>

      {isBulk && (
        <div className="flex items-center justify-center gap-1.5 pb-4">
          {references.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`h-1.5 rounded-full transition-all ${i === index ? "w-4 bg-[#6b2fa5]" : "w-1.5 bg-gray-200"}`}
            />
          ))}
        </div>
      )}

      <div className="px-5 pt-1">
        <p className="text-xs text-gray-400 text-center">
          You can close this and check progress later from the payout log — processing continues in the background.
        </p>
      </div>
    </ResponsiveSheet>
  )
}
