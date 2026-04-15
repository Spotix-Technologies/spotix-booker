"use client"

import { useState } from "react"
import { Send, AlertCircle, CheckCircle, Clock } from "lucide-react"

interface TransferTabProps {
  eventId: string
  organizerId: string
  currentUserId: string
  userAccessToken: string
}

export default function TransferTab({
  eventId,
  organizerId,
  currentUserId,
  userAccessToken,
}: TransferTabProps) {
  const isOwner = organizerId === currentUserId
  const [recipientEmail, setRecipientEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (!recipientEmail.trim()) {
      setError("Please enter a recipient email address")
      return
    }

    if (!recipientEmail.includes("@")) {
      setError("Please enter a valid email address")
      return
    }

    setLoading(true)

    try {
      const res = await fetch("/api/event/transfer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userAccessToken}`,
        },
        body: JSON.stringify({
          action: "create",
          eventId,
          recipientEmail: recipientEmail.trim(),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Failed to send transfer request")
        return
      }

      setSuccess(true)
      setRecipientEmail("")
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: any) {
      setError(err.message || "An error occurred while sending the transfer request")
    } finally {
      setLoading(false)
    }
  }

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
      {/* Info box */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 flex items-start gap-3">
        <Clock size={18} className="text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-900">
          <p className="font-semibold">Transfer Event Ownership</p>
          <p className="text-blue-800 mt-1">
            The recipient will have 3 days to accept the transfer request. Once accepted, they will become the event organizer.
          </p>
        </div>
      </div>

      {/* Transfer form */}
      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div>
          <label htmlFor="recipientEmail" className="block text-sm font-semibold text-slate-700 mb-2">
            Recipient Email Address
          </label>
          <input
            id="recipientEmail"
            type="email"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
            placeholder="user@example.com"
            disabled={loading}
            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-transparent disabled:bg-slate-50 disabled:text-slate-400"
          />
          <p className="text-xs text-slate-500 mt-1.5">
            Enter the email of the person you want to transfer this event to.
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
            <AlertCircle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Success message */}
        {success && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
            <CheckCircle size={16} className="text-green-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-green-800">Transfer request sent successfully!</p>
          </div>
        )}

        {/* Submit button */}
        <button
          type="submit"
          disabled={loading || !recipientEmail.trim()}
          className={`w-full px-4 py-2.5 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors ${
            loading || !recipientEmail.trim()
              ? "bg-slate-200 text-slate-400 cursor-not-allowed"
              : "bg-[#6b2fa5] text-white hover:bg-[#5a2589]"
          }`}
        >
          <Send size={16} />
          {loading ? "Sending..." : "Send Transfer Request"}
        </button>
      </form>

      {/* FAQ section */}
      <div className="space-y-4 pt-4 border-t border-slate-200">
        <h3 className="font-semibold text-slate-800">Frequently Asked Questions</h3>

        <details className="group">
          <summary className="flex cursor-pointer items-center justify-between rounded-lg bg-slate-50 p-4 font-medium text-slate-800 hover:bg-slate-100">
            What happens when I transfer an event?
            <span className="transition-transform group-open:rotate-180">▼</span>
          </summary>
          <div className="rounded-b-lg bg-slate-50 px-4 pb-4 text-sm text-slate-600">
            <p>The recipient becomes the event organizer and gains full control over the event, including:</p>
            <ul className="mt-2 ml-4 list-disc space-y-1">
              <li>Managing attendees and check-ins</li>
              <li>Editing event details</li>
              <li>Processing payouts</li>
              <li>Viewing analytics and reports</li>
            </ul>
          </div>
        </details>

        <details className="group">
          <summary className="flex cursor-pointer items-center justify-between rounded-lg bg-slate-50 p-4 font-medium text-slate-800 hover:bg-slate-100">
            How long does the recipient have to accept?
            <span className="transition-transform group-open:rotate-180">▼</span>
          </summary>
          <div className="rounded-b-lg bg-slate-50 px-4 pb-4 text-sm text-slate-600">
            The recipient has 3 days to accept or reject the transfer request. After 3 days, the request will expire and you can send a new one.
          </div>
        </details>

        <details className="group">
          <summary className="flex cursor-pointer items-center justify-between rounded-lg bg-slate-50 p-4 font-medium text-slate-800 hover:bg-slate-100">
            Can I cancel a transfer request?
            <span className="transition-transform group-open:rotate-180">▼</span>
          </summary>
          <div className="rounded-b-lg bg-slate-50 px-4 pb-4 text-sm text-slate-600">
            Currently, transfer requests cannot be manually cancelled. However, they will automatically expire after 3 days if not accepted.
          </div>
        </details>
      </div>
    </div>
  )
}
