"use client"

/**
 * app/components/event-info/helper/payout-log.tsx
 *
 * Merges two sources into one timeline:
 *   1. Supabase `payouts` — real money-movement attempts (GET
 *      /api/payout?action=status). initializing/processing/successful/failed.
 *   2. Firestore `vaultHolds` — pre-payout Vault sign-off state (GET
 *      /api/payout?action=vaultPending). vault_pending only; a released
 *      hold graduates into a payouts row and disappears from this list on
 *      the next refresh (it's now represented by its Supabase row instead).
 *
 * No retry, anywhere, ever — a failed payout is a dead end; the only
 * action offered is "Contact Spotix" with the reference. Cancel/Reject
 * only ever applies to a still-open Vault hold, since that's the only
 * state left where money hasn't moved yet.
 */

import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  RefreshCw,
  MessageCircle,
  Filter,
  ReceiptText,
  Ban,
  Lock,
  Copy,
  Check,
} from "lucide-react"
import { useState, useCallback, useEffect } from "react"
import { SkeletonTable } from "@/components/ui/skeleton"
import { fetchPayoutLogRecords, type DisplayStatus, type DisplayRecord } from "@/lib/payout-log-data"
import { displayRecordToReceipt } from "@/lib/receipt-image"
import ReceiptModal from "./receipt-modal"

interface PayoutLogProps {
  eventId: string
  userId: string
  /** Name shown on the receipt image — see receipt-image.ts. */
  eventName: string
  /** Can this viewer cancel/reject any active Vault hold on the event (not just their own)? */
  canManage?: boolean
  /** Fired after a Vault hold is successfully cancelled or rejected. */
  onCancelled?: () => void
}

const STATUS_CONFIG: Record<
  DisplayStatus,
  { label: string; bg: string; text: string; border: string; icon: React.ReactNode }
> = {
  initializing: {
    label: "Initializing",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    icon: <Loader2 size={13} className="text-amber-500 animate-spin" />,
  },
  processing: {
    label: "Processing",
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
    icon: <Loader2 size={13} className="text-blue-500 animate-spin" />,
  },
  failed: {
    label: "Failed",
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
    icon: <XCircle size={13} className="text-red-500" />,
  },
  successful: {
    label: "Successful",
    bg: "bg-green-50",
    text: "text-green-700",
    border: "border-green-200",
    icon: <CheckCircle2 size={13} className="text-green-500" />,
  },
  vault_pending: {
    label: "Awaiting Vault Sign-off",
    bg: "bg-purple-50",
    text: "text-purple-700",
    border: "border-purple-200",
    icon: <Lock size={13} className="text-purple-500" />,
  },
  cancelled: {
    label: "Cancelled",
    bg: "bg-gray-100",
    text: "text-gray-600",
    border: "border-gray-300",
    icon: <Ban size={13} className="text-gray-500" />,
  },
  rejected: {
    label: "Rejected",
    bg: "bg-gray-100",
    text: "text-gray-600",
    border: "border-gray-300",
    icon: <XCircle size={13} className="text-gray-500" />,
  },
}

const ALL_STATUSES: DisplayStatus[] = [
  "initializing", "processing", "vault_pending", "failed", "successful", "cancelled", "rejected",
]

function buildSupportLink(record: DisplayRecord): string {
  const message =
    `Hi Spotix, my payout failed and I need help.\n\n` +
    `Reference: ${record.id}\n` +
    `Date: ${record.date}\n` +
    `Amount: ₦${Number(record.amount).toLocaleString()}\n` +
    `Reason shown: ${record.failureReason || "Not specified"}\n\n` +
    `Please advise.`
  return `https://wa.me/2348123927685?text=${encodeURIComponent(message)}`
}

export default function PayoutLog({ eventId, userId, eventName, canManage = false, onCancelled }: PayoutLogProps) {
  const [records, setRecords] = useState<DisplayRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<DisplayStatus | "all">("all")

  const [cancelling, setCancelling] = useState<Set<string>>(new Set())
  const [cancelErrors, setCancelErrors] = useState<Record<string, string>>({})
  const [confirmCancel, setConfirmCancel] = useState<DisplayRecord | null>(null)
  const [copiedRef, setCopiedRef] = useState<string | null>(null)
  const [receiptRecord, setReceiptRecord] = useState<DisplayRecord | null>(null)

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const merged = await fetchPayoutLogRecords(eventId)
      setRecords(merged)
    } catch (err: any) {
      setError(err.message || "Failed to load payout logs")
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // Poll every 15s while anything is still in flight (initializing/processing/vault_pending)
  useEffect(() => {
    const hasInFlight = records.some(
      (r) => r.status === "initializing" || r.status === "processing" || r.status === "vault_pending"
    )
    if (!hasInFlight) return
    const id = setInterval(fetchAll, 15_000)
    return () => clearInterval(id)
  }, [records, fetchAll])

  async function handleCancel(record: DisplayRecord) {
    setCancelling((prev) => new Set([...prev, record.id]))
    setCancelErrors((prev) => {
      const next = { ...prev }
      delete next[record.id]
      return next
    })
    try {
      const res = await fetch("/api/payout", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdId: record.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to cancel/reject payout")
      setConfirmCancel(null)
      await fetchAll()
      onCancelled?.()
    } catch (err: any) {
      setCancelErrors((prev) => ({ ...prev, [record.id]: err.message || "Action failed" }))
    } finally {
      setCancelling((prev) => {
        const next = new Set(prev)
        next.delete(record.id)
        return next
      })
    }
  }

  function copyReference(id: string) {
    navigator.clipboard.writeText(id).then(() => {
      setCopiedRef(id)
      setTimeout(() => setCopiedRef(null), 1500)
    })
  }

  // Only a still-open Vault hold can be cancelled/rejected — money hasn't
  // moved yet at that stage. Everything past that point is irreversible.
  const canAct = (r: DisplayRecord) => canManage && r.source === "vaultHold" && r.status === "vault_pending"

  const filtered = activeFilter === "all" ? records : records.filter((r) => r.status === activeFilter)
  const countsByStatus = ALL_STATUSES.reduce(
    (acc, s) => ({ ...acc, [s]: records.filter((r) => r.status === s).length }),
    {} as Record<DisplayStatus, number>
  )

  if (loading) {
    return <SkeletonTable rows={5} />
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3">
        <AlertCircle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-red-700">Failed to load payout logs</p>
          <p className="text-sm text-red-600 mt-0.5">{error}</p>
          <button onClick={fetchAll} className="text-xs text-red-600 underline mt-2 font-medium">
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (records.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-10 text-center">
        <div className="p-3 bg-gray-100 rounded-full w-fit mx-auto mb-3">
          <ReceiptText size={28} className="text-gray-400" />
        </div>
        <p className="text-gray-600 font-semibold">No payout requests yet</p>
        <p className="text-sm text-gray-400 mt-1">Submitted payout requests for this event will appear here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700">
          {records.length} payout request{records.length !== 1 ? "s" : ""}
        </p>
        <button
          onClick={fetchAll}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#6b2fa5] transition-colors font-medium"
        >
          <RefreshCw size={13} />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveFilter("all")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
            activeFilter === "all" ? "bg-[#6b2fa5] text-white border-[#6b2fa5]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
          }`}
        >
          <Filter size={11} />
          All
          <span className={`rounded-full px-1.5 py-0.5 leading-none text-[10px] font-bold ${activeFilter === "all" ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"}`}>
            {records.length}
          </span>
        </button>

        {ALL_STATUSES.map((s) => {
          const cfg = STATUS_CONFIG[s]
          const count = countsByStatus[s]
          if (count === 0) return null
          return (
            <button
              key={s}
              onClick={() => setActiveFilter(s)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                activeFilter === s ? `${cfg.bg} ${cfg.text} ${cfg.border}` : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              }`}
            >
              {cfg.icon}
              {cfg.label}
              <span className={`rounded-full px-1.5 py-0.5 leading-none text-[10px] font-bold ${cfg.bg} ${cfg.text}`}>{count}</span>
            </button>
          )
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-500">
            No {activeFilter !== "all" ? STATUS_CONFIG[activeFilter as DisplayStatus].label.toLowerCase() : ""} payouts found.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((record) => {
            const cfg = STATUS_CONFIG[record.status]
            const isCancelling = cancelling.has(record.id)
            const cancelError = cancelErrors[record.id]
            const isInitiator = record.userId === userId
            const actionable = canAct(record)

            return (
              <div key={record.id} className="bg-white border border-gray-200 rounded-xl p-5 space-y-3 hover:shadow-sm transition-shadow">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900 text-base">{record.date}</span>
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                        {cfg.icon}
                        {cfg.label}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                      <span>
                        Amount: <span className="font-semibold text-gray-800">₦{Number(record.amount).toLocaleString()}</span>
                      </span>
                      <span>
                        Bank: <span className="font-semibold text-gray-800">{record.bankName}</span>
                      </span>
                    </div>

                    <p className="text-xs text-gray-400">
                      {record.accountName} · •••• {record.accountNumber?.slice(-4)}
                    </p>

                    {record.initiatedByName && (
                      <p className="text-xs text-gray-400">
                        Requested by: <span className="text-gray-600 font-medium">{record.initiatedByName}</span>
                      </p>
                    )}

                    {record.createdAt && (
                      <p className="text-xs text-gray-400">Submitted: {new Date(record.createdAt).toLocaleString()}</p>
                    )}

                    {record.source === "payout" && (
                      <button
                        onClick={() => copyReference(record.id)}
                        className="flex items-center gap-1.5 text-xs font-mono text-gray-500 hover:text-gray-700 transition-colors"
                      >
                        {copiedRef === record.id ? <Check size={11} className="text-green-600" /> : <Copy size={11} />}
                        {record.id}
                      </button>
                    )}

                    {record.status === "failed" && record.failureReason && (
                      <p className="text-xs text-red-600 mt-1">{record.failureReason}</p>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 items-end flex-shrink-0">
                    {actionable && isInitiator && (
                      <button
                        onClick={() => setConfirmCancel(record)}
                        disabled={isCancelling}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100 transition-colors disabled:opacity-50"
                      >
                        {isCancelling ? <><Loader2 size={13} className="animate-spin" />Stopping...</> : <><Ban size={13} />Stop Payout</>}
                      </button>
                    )}

                    {actionable && !isInitiator && (
                      <button
                        onClick={() => setConfirmCancel(record)}
                        disabled={isCancelling}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors disabled:opacity-50"
                      >
                        {isCancelling ? <><Loader2 size={13} className="animate-spin" />Rejecting...</> : <><XCircle size={13} />Reject</>}
                      </button>
                    )}

                    {record.status === "failed" && (
                      <a
                        href={buildSupportLink(record)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors"
                      >
                        <MessageCircle size={13} />
                        Contact Spotix
                      </a>
                    )}

                    {record.status === "successful" && (
                      <button
                        onClick={() => setReceiptRecord(record)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-purple-50 text-[#6b2fa5] border border-purple-200 hover:bg-purple-100 transition-colors"
                      >
                        <ReceiptText size={13} />
                        View Receipt
                      </button>
                    )}
                  </div>
                </div>

                {cancelError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 flex gap-2 items-start">
                    <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-600">{cancelError}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {confirmCancel && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmCancel(null) }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex justify-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                {confirmCancel.userId === userId ? <Ban size={22} className="text-red-600" /> : <XCircle size={22} className="text-red-600" />}
              </div>
            </div>
            {confirmCancel.userId === userId ? (
              <div className="text-center space-y-1">
                <h3 className="text-base font-bold text-gray-900">Stop this payout?</h3>
                <p className="text-sm text-gray-600">
                  The Vault hold for <span className="font-semibold">{confirmCancel.date}</span> (₦
                  {Number(confirmCancel.amount).toLocaleString()}) will be marked as cancelled — nothing has moved yet, so
                  this fully stops it. This stays visible in the logs and can&apos;t be undone.
                </p>
              </div>
            ) : (
              <div className="text-center space-y-1">
                <h3 className="text-base font-bold text-gray-900">Reject this payout?</h3>
                <p className="text-sm text-gray-600">
                  The Vault hold for <span className="font-semibold">{confirmCancel.date}</span> (₦
                  {Number(confirmCancel.amount).toLocaleString()}), requested by{" "}
                  <span className="font-semibold">{confirmCancel.initiatedByName ?? "another team member"}</span>, will be
                  permanently rejected. The whole team will see you rejected it.
                </p>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmCancel(null)}
                disabled={cancelling.has(confirmCancel.id)}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Keep it
              </button>
              <button
                onClick={() => handleCancel(confirmCancel)}
                disabled={cancelling.has(confirmCancel.id)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {cancelling.has(confirmCancel.id) ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : confirmCancel.userId === userId ? (
                  <Ban size={14} />
                ) : (
                  <XCircle size={14} />
                )}
                {confirmCancel.userId === userId ? "Stop Payout" : "Reject Payout"}
              </button>
            </div>
          </div>
        </div>
      )}

      {receiptRecord && (
        <ReceiptModal
          data={displayRecordToReceipt(receiptRecord, eventName)}
          onClose={() => setReceiptRecord(null)}
        />
      )}
    </div>
  )
}
