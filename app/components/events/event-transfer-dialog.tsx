"use client"

import { useState } from "react"
import ResponsiveSheet from "@/components/ui/responsive-sheet"
import { CheckCircle, AlertCircle, Loader2, Clock, ArrowRightLeft, XCircle } from "lucide-react"

export interface IncomingTransfer {
  id: string
  transferId: string
  eventId: string
  eventName: string
  organizerUsername: string
  status: "pending" | "accepted" | "rejected"
  createdAt: any
  expiresAt: string | null
}

interface EventTransferDialogProps {
  isOpen: boolean
  onClose: () => void
  transfers: IncomingTransfer[]
  onTransferActioned: (transferId: string, newStatus: "accepted" | "rejected") => void
}

export default function EventTransferDialog({
  isOpen,
  onClose,
  transfers,
  onTransferActioned,
}: EventTransferDialogProps) {
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleAction(transfer: IncomingTransfer, action: "accept" | "reject") {
    setProcessingId(transfer.id)
    setError(null)
    try {
      const res = await fetch("/api/event/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          eventId: transfer.eventId,
          transferId: transfer.id,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || `Failed to ${action} transfer`)
        return
      }
      onTransferActioned(transfer.id, action === "accept" ? "accepted" : "rejected")
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <ResponsiveSheet
      open={isOpen}
      onClose={onClose}
      size="md"
      title="Event Transfer Requests"
      description="Organizers want to hand you ownership of their events"
      bodyClassName="px-5 py-5"
      footer={
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-700 font-semibold rounded-lg hover:bg-slate-100 transition-colors text-sm"
          >
            Close
          </button>
        </div>
      }
    >
      <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
          <AlertCircle size={15} className="text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {transfers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
            <Clock size={28} className="text-slate-400" />
          </div>
          <p className="text-slate-600 font-medium">No pending transfer requests</p>
          <p className="text-slate-400 text-sm mt-1">
            When an organizer transfers an event to you, it will appear here.
          </p>
        </div>
      ) : (
        transfers.map((transfer) => {
          const expiresAt = transfer.expiresAt ? new Date(transfer.expiresAt) : null
          const isExpired = expiresAt ? expiresAt < new Date() : false
          const hoursLeft = expiresAt
            ? Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60)))
            : 0

          return (
            <div
              key={transfer.id}
              className="border border-slate-200 rounded-xl p-4 space-y-3 hover:border-slate-300 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-[#6b2fa5]/10 flex items-center justify-center flex-shrink-0">
                  <ArrowRightLeft size={17} className="text-[#6b2fa5]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-800 truncate">{transfer.eventName}</p>
                  <p className="text-sm text-slate-500 mt-0.5">
                    From{" "}
                    <span className="font-medium text-slate-700">
                      @{transfer.organizerUsername}
                    </span>
                  </p>
                  <p
                    className={`text-xs mt-0.5 ${
                      isExpired ? "text-red-500" : "text-slate-400"
                    }`}
                  >
                    {isExpired
                      ? "This request has expired"
                      : `Expires in ${hoursLeft} hour${hoursLeft !== 1 ? "s" : ""}`}
                  </p>
                </div>
                {isExpired && (
                  <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full flex-shrink-0 font-medium">
                    Expired
                  </span>
                )}
              </div>

              {!isExpired && (
                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <button
                    onClick={() => handleAction(transfer, "accept")}
                    disabled={processingId === transfer.id}
                    className="flex-1 px-3 py-2.5 bg-[#6b2fa5] text-white text-sm font-semibold rounded-lg hover:bg-[#5a2589] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                  >
                    {processingId === transfer.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <CheckCircle size={14} />
                    )}
                    Accept Ownership
                  </button>
                  <button
                    onClick={() => handleAction(transfer, "reject")}
                    disabled={processingId === transfer.id}
                    className="flex-1 px-3 py-2.5 bg-slate-100 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-200 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                  >
                    <XCircle size={14} />
                    Reject
                  </button>
                </div>
              )}
            </div>
          )
        })
      )}
      </div>
    </ResponsiveSheet>
  )
}
