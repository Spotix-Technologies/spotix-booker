"use client"

import { useEffect, useState } from "react"
import { Loader2, CheckCircle2, XCircle, Clock, Copy, Check, MessageCircle, WifiOff } from "lucide-react"
import { usePayoutStream, type PayoutLiveState } from "./use-payout-stream"

const STEPS: { key: "initializing" | "processing" | "done"; label: string }[] = [
  { key: "initializing", label: "Initializing" },
  { key: "processing", label: "Processing" },
  { key: "done", label: "Done" },
]

function stepIndex(status: string): number {
  if (status === "initializing") return 0
  if (status === "processing") return 1
  return 2 // successful or failed
}

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

function buildSupportLink(reference: string, failureReason: string | null, amount: number, payDate: string): string {
  const message =
    `Hi Spotix, my payout failed and I need help.\n\n` +
    `Reference: ${reference}\n` +
    `Date: ${payDate}\n` +
    `Amount: ₦${Number(amount).toLocaleString()}\n` +
    `Reason shown: ${failureReason || "Not specified"}\n\n` +
    `Please advise.`
  return `https://wa.me/2348123927685?text=${encodeURIComponent(message)}`
}

interface PayoutStatusCardProps {
  reference: string
  /** Fires on every live status event — lets a parent list (e.g. the
   *  Transaction Days table) mirror this payout's status live, without
   *  the person needing to refresh or reopen this dialog. */
  onStatusChange?: (state: PayoutLiveState) => void
}

export default function PayoutStatusCard({ reference, onStatusChange }: PayoutStatusCardProps) {
  const live = usePayoutStream(reference, onStatusChange)
  const [copied, setCopied] = useState(false)
  const [tick, setTick] = useState(0)

  const isTerminal = live.status === "successful" || live.status === "failed"

  // Local 1s ticker — only while non-terminal. The server is the source
  // of truth for the final duration_seconds once resolved.
  useEffect(() => {
    if (isTerminal) return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [isTerminal])

  const elapsedSeconds = isTerminal
    ? live.durationSeconds
    : Math.max(0, Math.floor((Date.now() - new Date(live.createdAt).getTime()) / 1000))

  const label = live.isEvent ? "event" : live.isPoll ? "poll" : live.isElection ? "election" : live.isMerch ? "listing" : "payout"
  const subjectName = live.isEvent ? live.eventName : live.isPoll ? live.pollName : live.isElection ? live.electionName : live.merchName

  function copyReference() {
    navigator.clipboard.writeText(reference).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-5 w-full">
      {/* Stepper */}
      <div className="flex items-center">
        {STEPS.map((step, i) => {
          const current = stepIndex(live.status)
          const isFailedDone = step.key === "done" && live.status === "failed"
          const active = i <= current
          return (
            <div key={step.key} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                    isFailedDone
                      ? "bg-red-100 text-red-600"
                      : active
                        ? "bg-[#6b2fa5] text-white"
                        : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {isFailedDone ? (
                    <XCircle size={14} />
                  ) : active && i < current ? (
                    <Check size={14} />
                  ) : active && i === current && !isTerminal ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : active && i === current && live.status === "successful" ? (
                    <CheckCircle2 size={14} />
                  ) : (
                    i + 1
                  )}
                </div>
                <span className={`text-[10px] font-medium ${active ? "text-gray-700" : "text-gray-400"}`}>
                  {isFailedDone ? "Failed" : step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 flex-1 mx-1 rounded ${i < current ? "bg-[#6b2fa5]" : "bg-gray-100"}`} />
              )}
            </div>
          )
        })}
      </div>

      {live.streamError && !isTerminal && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <WifiOff size={13} className="flex-shrink-0" />
          Reconnecting to live status — this payout is still processing on our end regardless.
        </div>
      )}

      {/* Amount + narration */}
      <div className="text-center space-y-1">
        <p className="text-2xl font-bold text-gray-900">
          ₦{Number(live.amount || 0).toLocaleString()}
        </p>
        <p className="text-sm text-gray-600">
          {live.narration || `Payout for your ${subjectName || label} for ${live.payDate}`}
        </p>
      </div>

      {/* Timer */}
      <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
        <Clock size={14} />
        <span className="font-mono tabular-nums">{formatDuration(elapsedSeconds)}</span>
        <span>{isTerminal ? "total" : "elapsed"}</span>
      </div>

      {/* Terminal state details */}
      {live.status === "successful" && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2">
          <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" />
          <p className="text-sm text-green-700 font-medium">Payout successful — funds are on their way.</p>
        </div>
      )}

      {live.status === "failed" && (
        <div className="space-y-3">
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex gap-2">
            <XCircle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-red-700 font-medium">Payout failed</p>
              <p className="text-xs text-red-600 mt-0.5">{live.failureReason || "No reason provided."}</p>
            </div>
          </div>
          <p className="text-xs text-gray-500 text-center">
            This payout can't be retried. Contact Spotix with the reference below.
          </p>
          <a
            href={buildSupportLink(reference, live.failureReason, live.amount, live.payDate)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors"
          >
            <MessageCircle size={15} />
            Contact Spotix on WhatsApp
          </a>
        </div>
      )}

      {/* Reference */}
      <button
        onClick={copyReference}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors"
      >
        <span className="text-xs font-mono text-gray-600 truncate">{reference}</span>
        {copied ? <Check size={13} className="text-green-600 flex-shrink-0" /> : <Copy size={13} className="text-gray-400 flex-shrink-0" />}
      </button>
    </div>
  )
}
