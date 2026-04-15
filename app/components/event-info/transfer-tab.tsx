"use client"

import { useState } from "react"
import { Send, AlertCircle, CheckCircle, Clock, Search, Loader2, X, ArrowRightLeft } from "lucide-react"

interface TransferTabProps {
  eventId: string
  eventName: string
  organizerId: string
  currentUserId: string
}

interface RecipientInfo {
  userId: string
  email: string
  fullName: string
  username: string
}

type Step = "input" | "confirm" | "success"

export default function TransferTab({
  eventId,
  eventName,
  organizerId,
  currentUserId,
}: TransferTabProps) {
  const isOwner = organizerId === currentUserId

  // ─── Form state ────────────────────────────────────────────────────────────
  const [email, setEmail] = useState("")
  const [recipient, setRecipient] = useState<RecipientInfo | null>(null)
  const [step, setStep] = useState<Step>("input")

  // ─── Async state ───────────────────────────────────────────────────────────
  const [lookupLoading, setLookupLoading] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ─── Pending transfer (for cancel) ────────────────────────────────────────
  const [pendingTransferId, setPendingTransferId] = useState<string | null>(null)

  // ─────────────────────────────────────────────────────────────────────────
  // Step 1: look up recipient via /api/user/whoru
  // ─────────────────────────────────────────────────────────────────────────
  const handleLookup = async () => {
    setError(null)
    setRecipient(null)

    const trimmed = email.trim()
    if (!trimmed || !trimmed.includes("@")) {
      setError("Please enter a valid email address.")
      return
    }

    setLookupLoading(true)
    try {
      const res = await fetch(
        `/api/user/whoru?type=email&value=${encodeURIComponent(trimmed)}&limit=1`,
        {
          headers: {
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_ACCESS_TOKEN_SECRET}`,
          },
        }
      )

      const data = await res.json()

      if (!res.ok) {
        setError(data.error === "User not found"
          ? "No Spotix account found for that email."
          : data.error || "Failed to look up user.")
        return
      }

      if (data.userId === currentUserId) {
        setError("You cannot transfer an event to yourself.")
        return
      }

      setRecipient({
        userId: data.userId,
        email: data.email,
        fullName: data.fullName,
        username: data.username,
      })
      setStep("confirm")
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLookupLoading(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2: submit the transfer request
  // ─────────────────────────────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!recipient) return
    setError(null)
    setSubmitLoading(true)

    try {
      const res = await fetch("/api/event/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          eventId,
          recipientEmail: recipient.email,
          recipientId: recipient.userId,
          recipientUsername: recipient.username,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Failed to send transfer request.")
        setStep("confirm")
        return
      }

      setPendingTransferId(data.transferId)
      setStep("success")
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setSubmitLoading(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Cancel: delete the pending transfer
  // ─────────────────────────────────────────────────────────────────────────
  const handleCancel = async () => {
    if (!pendingTransferId) return
    setError(null)
    setCancelLoading(true)

    try {
      const res = await fetch("/api/event/transfer", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, transferId: pendingTransferId }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Failed to cancel the transfer.")
        return
      }

      // Reset everything
      setStep("input")
      setEmail("")
      setRecipient(null)
      setPendingTransferId(null)
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setCancelLoading(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Not owner guard
  // ─────────────────────────────────────────────────────────────────────────
  if (!isOwner) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
          <AlertCircle size={32} className="text-slate-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-700 mb-2">Not the Event Owner</h3>
        <p className="text-sm text-slate-500 max-w-sm">
          Only the event organizer can transfer ownership of this event.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Info banner */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 flex items-start gap-3">
        <Clock size={18} className="text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-900">
          <p className="font-semibold">Transfer Event Ownership</p>
          <p className="text-blue-800 mt-1">
            The recipient will have 3 days to accept. Once accepted, they become the organizer
            and gain full control over this event.
          </p>
        </div>
      </div>

      {/* ── STEP: input ───────────────────────────────────────────────────── */}
      {step === "input" && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div>
            <label htmlFor="recipientEmail" className="block text-sm font-semibold text-slate-700 mb-2">
              Recipient Email Address
            </label>
            <div className="flex gap-2">
              <input
                id="recipientEmail"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setError(null)
                }}
                onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                placeholder="user@example.com"
                disabled={lookupLoading}
                className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-transparent disabled:bg-slate-50 disabled:text-slate-400 text-sm"
              />
              <button
                onClick={handleLookup}
                disabled={lookupLoading || !email.trim()}
                className="px-4 py-2.5 rounded-lg font-semibold flex items-center gap-2 bg-[#6b2fa5] text-white hover:bg-[#5a2589] disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors text-sm"
              >
                {lookupLoading ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Search size={15} />
                )}
                {lookupLoading ? "Looking up..." : "Find User"}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1.5">
              Enter the Spotix account email of the person you want to transfer this event to.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
              <AlertCircle size={15} className="text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
        </div>
      )}

      {/* ── STEP: confirm ─────────────────────────────────────────────────── */}
      {step === "confirm" && recipient && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          {/* Recipient card */}
          <div>
            <p className="text-sm font-semibold text-slate-600 mb-3">Transferring to</p>
            <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="w-11 h-11 rounded-full bg-[#6b2fa5]/10 flex items-center justify-center flex-shrink-0">
                <span className="text-[#6b2fa5] font-bold text-base">
                  {recipient.username?.[0]?.toUpperCase() ?? "?"}
                </span>
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-800 truncate">@{recipient.username}</p>
                <p className="text-sm text-slate-500 truncate">{recipient.email}</p>
                {recipient.fullName && (
                  <p className="text-xs text-slate-400 truncate">{recipient.fullName}</p>
                )}
              </div>
            </div>
          </div>

          {/* Confirmation message */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
            <ArrowRightLeft size={17} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-900">
              <span className="font-semibold">@{recipient.username}</span> will gain full
              control over <span className="font-semibold">{eventName}</span> once they accept.
              This action cannot be undone after acceptance.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
              <AlertCircle size={15} className="text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => {
                setStep("input")
                setRecipient(null)
                setError(null)
              }}
              disabled={submitLoading}
              className="flex-1 px-4 py-2.5 rounded-lg font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors text-sm"
            >
              Back
            </button>
            <button
              onClick={handleConfirm}
              disabled={submitLoading}
              className="flex-1 px-4 py-2.5 rounded-lg font-semibold flex items-center justify-center gap-2 bg-[#6b2fa5] text-white hover:bg-[#5a2589] disabled:opacity-60 disabled:cursor-not-allowed transition-colors text-sm"
            >
              {submitLoading ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Send size={15} />
              )}
              {submitLoading ? "Sending..." : "Send Transfer Request"}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP: success ─────────────────────────────────────────────────── */}
      {step === "success" && recipient && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mb-3">
              <CheckCircle size={28} className="text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-800 mb-1">Request Sent</h3>
            <p className="text-sm text-slate-500">
              Transfer request sent to{" "}
              <span className="font-semibold text-slate-700">@{recipient.username}</span>.
              They have 3 days to accept.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
              <AlertCircle size={15} className="text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <button
            onClick={handleCancel}
            disabled={cancelLoading}
            className="w-full px-4 py-2.5 rounded-lg font-semibold flex items-center justify-center gap-2 border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
          >
            {cancelLoading ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <X size={15} />
            )}
            {cancelLoading ? "Cancelling..." : "Cancel Transfer Request"}
          </button>
        </div>
      )}

      {/* ── FAQ ───────────────────────────────────────────────────────────── */}
      <div className="space-y-3 pt-4 border-t border-slate-200">
        <h3 className="font-semibold text-slate-800">Frequently Asked Questions</h3>

        {[
          {
            q: "What happens when I transfer an event?",
            a: (
              <>
                <p>The recipient becomes the event organizer and gains full control, including:</p>
                <ul className="mt-2 ml-4 list-disc space-y-1">
                  <li>Managing attendees and check-ins</li>
                  <li>Editing event details</li>
                  <li>Processing payouts</li>
                  <li>Viewing analytics and reports</li>
                </ul>
              </>
            ),
          },
          {
            q: "How long does the recipient have to accept?",
            a: "The recipient has 3 days to accept or reject. After that, the request expires automatically.",
          },
          {
            q: "Can I cancel a transfer request?",
            a: 'Yes — after sending a request, a "Cancel Transfer Request" button will appear on this page.',
          },
        ].map(({ q, a }) => (
          <details key={q} className="group">
            <summary className="flex cursor-pointer items-center justify-between rounded-lg bg-slate-50 p-4 font-medium text-slate-800 hover:bg-slate-100 text-sm">
              {q}
              <span className="transition-transform group-open:rotate-180 text-slate-400">▼</span>
            </summary>
            <div className="rounded-b-lg bg-slate-50 px-4 pb-4 text-sm text-slate-600">{a}</div>
          </details>
        ))}
      </div>
    </div>
  )
}