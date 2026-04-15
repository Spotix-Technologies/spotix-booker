"use client"

import { useState, useEffect } from "react"
import { X, CheckCircle, Clock, AlertCircle, Loader2 } from "lucide-react"

interface Transfer {
  id: string
  eventId: string
  requesterId: string
  recipientId: string
  recipientEmail: string
  status: "pending" | "accepted" | "rejected"
  createdAt: any
  expiresAt: any
}

interface EventTransferDialogProps {
  isOpen: boolean
  onClose: () => void
  userId: string
  userAccessToken: string
}

export default function EventTransferDialog({
  isOpen,
  onClose,
  userId,
  userAccessToken,
}: EventTransferDialogProps) {
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [processingId, setProcessingId] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      fetchTransfers()
    }
  }, [isOpen])

  async function fetchTransfers() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/event/transfer", {
        headers: {
          Authorization: `Bearer ${userAccessToken}`,
        },
      })

      if (!res.ok) {
        setError("Failed to load transfer requests")
        return
      }

      const data = await res.json()
      setTransfers(data.transfers || [])
    } catch (err: any) {
      setError(err.message || "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  async function handleAccept(transferId: string) {
    setProcessingId(transferId)

    try {
      const res = await fetch("/api/event/transfer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userAccessToken}`,
        },
        body: JSON.stringify({
          action: "accept",
          transferId,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || "Failed to accept transfer")
        return
      }

      setTransfers((prev) =>
        prev.map((t) => (t.id === transferId ? { ...t, status: "accepted" } : t))
      )
    } catch (err: any) {
      setError(err.message || "An error occurred")
    } finally {
      setProcessingId(null)
    }
  }

  async function handleReject(transferId: string) {
    setProcessingId(transferId)

    try {
      const res = await fetch("/api/event/transfer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userAccessToken}`,
        },
        body: JSON.stringify({
          action: "reject",
          transferId,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || "Failed to reject transfer")
        return
      }

      setTransfers((prev) =>
        prev.map((t) => (t.id === transferId ? { ...t, status: "rejected" } : t))
      )
    } catch (err: any) {
      setError(err.message || "An error occurred")
    } finally {
      setProcessingId(null)
    }
  }

  if (!isOpen) return null

  const pendingTransfers = transfers.filter((t) => t.status === "pending")
  const pastTransfers = transfers.filter((t) => t.status !== "pending")

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
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-xl font-bold text-slate-900">Event Transfers</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X size={24} className="text-slate-600" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[calc(100vh-200px)] overflow-y-auto space-y-6">
          {error && (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 border border-red-200">
              <AlertCircle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={32} className="text-[#6b2fa5] animate-spin" />
            </div>
          ) : pendingTransfers.length === 0 && pastTransfers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                <Clock size={32} className="text-slate-400" />
              </div>
              <p className="text-slate-600">No transfer requests at this time</p>
            </div>
          ) : (
            <>
              {/* Pending transfers */}
              {pendingTransfers.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wide">
                    Pending ({pendingTransfers.length})
                  </h3>
                  {pendingTransfers.map((transfer) => {
                    const expiresAt = transfer.expiresAt?.toDate?.() || new Date(transfer.expiresAt)
                    const isExpired = expiresAt < new Date()
                    const hoursLeft = Math.max(0, Math.round((expiresAt - new Date()) / (1000 * 60 * 60)))

                    return (
                      <div key={transfer.id} className="border border-slate-200 rounded-lg p-4 space-y-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <p className="font-semibold text-slate-900">{transfer.recipientEmail}</p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {isExpired
                                ? "Request expired"
                                : `Expires in ${hoursLeft} hour${hoursLeft !== 1 ? "s" : ""}`}
                            </p>
                          </div>
                          {isExpired && (
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">
                              Expired
                            </span>
                          )}
                        </div>

                        {!isExpired && (
                          <div className="flex gap-2 pt-2">
                            <button
                              onClick={() => handleAccept(transfer.id)}
                              disabled={processingId === transfer.id}
                              className="flex-1 px-3 py-2 bg-[#6b2fa5] text-white text-sm font-semibold rounded-lg hover:bg-[#5a2589] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                              {processingId === transfer.id ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <CheckCircle size={14} />
                              )}
                              Accept
                            </button>
                            <button
                              onClick={() => handleReject(transfer.id)}
                              disabled={processingId === transfer.id}
                              className="flex-1 px-3 py-2 bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Past transfers */}
              {pastTransfers.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wide">
                    History
                  </h3>
                  {pastTransfers.map((transfer) => (
                    <div key={transfer.id} className="border border-slate-200 rounded-lg p-4 opacity-60">
                      <div className="flex items-center justify-between">
                        <p className="text-slate-700">{transfer.recipientEmail}</p>
                        <span
                          className={`text-xs px-2 py-1 rounded-full font-medium ${
                            transfer.status === "accepted"
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {transfer.status === "accepted" ? "Accepted" : "Rejected"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 p-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-700 font-semibold rounded-lg hover:bg-slate-100 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
