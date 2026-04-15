"use client"

import { useState } from "react"
import { X, CheckCircle, AlertCircle, Loader2, Clock, ArrowRightLeft, XCircle } from "lucide-react"

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

  if (!isOpen) return null

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(5px)",
        WebkitBackdropFilter: "blur(5px)",
        padding: "0 16px",
        overflow: "auto",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Event Transfer Requests</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Organizers want to hand you ownership of their events
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X size={22} className="text-slate-600" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
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
                    <div className="flex gap-2 pt-1">
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

        {/* Footer */}
        <div className="border-t border-slate-200 p-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-700 font-semibold rounded-lg hover:bg-slate-100 transition-colors text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}