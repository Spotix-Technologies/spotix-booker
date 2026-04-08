"use client"

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
} from "lucide-react"
import { useState, useCallback, useEffect } from "react"

type PayoutStatus = "pending" | "processing" | "failed" | "successful"

interface PayoutRecord {
  id: string
  eventId: string
  userId: string
  date: string
  amount: number
  bankName: string
  bankCode: string
  accountNumber: string
  accountName: string
  status: PayoutStatus
  createdAt: string | null
  updatedAt: string | null
  pendingAt: string | null
  processingAt: string | null
}

interface PayoutLogProps {
  eventId: string
  userId: string
}

const STATUS_CONFIG: Record<
  PayoutStatus,
  { label: string; bg: string; text: string; border: string; icon: React.ReactNode }
> = {
  pending: {
    label: "Pending",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    icon: <Clock size={13} className="text-amber-500" />,
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
}

const ALL_STATUSES: PayoutStatus[] = ["pending", "processing", "failed", "successful"]
const STALE_HOURS = 2

function hoursElapsed(iso: string | null): number {
  if (!iso) return 0
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60)
}

function isPendingStale(record: PayoutRecord): boolean {
  if (record.status !== "pending") return false
  const ref = record.pendingAt ?? record.createdAt
  return hoursElapsed(ref) >= STALE_HOURS
}

function isProcessingStale(record: PayoutRecord): boolean {
  return record.status === "processing" && hoursElapsed(record.processingAt) >= STALE_HOURS
}

function buildWhatsAppLink(record: PayoutRecord, kind: "pending" | "processing"): string {
  const submittedStr = record.createdAt
    ? new Date(record.createdAt).toLocaleString()
    : "Unknown"

  const statusTimestampLabel = kind === "pending" ? "Pending since" : "Processing since"
  const statusTimestamp =
    kind === "pending"
      ? record.pendingAt
        ? new Date(record.pendingAt).toLocaleString()
        : "Unknown"
      : record.processingAt
        ? new Date(record.processingAt).toLocaleString()
        : "Unknown"

  const intro =
    kind === "pending"
      ? "My payout has been pending for more than 2 hours."
      : "My payout has been processing for more than 2 hours."

  const message =
    `${intro} Here are my payout details:\n\n` +
    `Event ID: ${record.eventId}\n` +
    `Transaction Date: ${record.date}\n` +
    `Amount: ₦${Number(record.amount).toLocaleString()}\n` +
    `Bank: ${record.bankName}\n` +
    `Account: ${record.accountName} (•••• ${record.accountNumber.slice(-4)})\n` +
    `Payout ID: ${record.id}\n` +
    `Submitted: ${submittedStr}\n` +
    `${statusTimestampLabel}: ${statusTimestamp}\n\n` +
    `Thank you`

  return `https://wa.me/2348123927685?text=${encodeURIComponent(message)}`
}

export default function PayoutLog({ eventId, userId }: PayoutLogProps) {
  const [payouts, setPayouts] = useState<PayoutRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<PayoutStatus | "all">("all")
  const [rerunning, setRerunning] = useState<Set<string>>(new Set())
  const [rerunErrors, setRerunErrors] = useState<Record<string, string>>({})

  const [, setTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(interval)
  }, [])

  const fetchPayouts = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`/api/payout?eventId=${eventId}&action=status`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to fetch payout logs")
      setPayouts(data.payouts ?? [])
    } catch (err: any) {
      setError(err.message || "Failed to load payout logs")
    } finally {
      setLoading(false)
    }
  }, [eventId])

  // Initial fetch
  useEffect(() => {
    fetchPayouts()
  }, [fetchPayouts])

  // Poll every 30s while any payout is pending or processing
  useEffect(() => {
    const hasInFlight = payouts.some(
      (p) => p.status === "pending" || p.status === "processing"
    )
    if (!hasInFlight) return

    const id = setInterval(fetchPayouts, 30_000)
    return () => clearInterval(id)
  }, [payouts, fetchPayouts])

  async function handleRerun(record: PayoutRecord) {
    setRerunning((prev) => new Set([...prev, record.id]))
    setRerunErrors((prev) => {
      const next = { ...prev }
      delete next[record.id]
      return next
    })

    try {
      const res = await fetch("/api/payout", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payoutId: record.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to re-run payout")
      setPayouts((prev) =>
        prev.map((p) =>
          p.id === record.id
            ? { ...p, status: "pending", pendingAt: new Date().toISOString() }
            : p
        )
      )
    } catch (err: any) {
      setRerunErrors((prev) => ({
        ...prev,
        [record.id]: err.message || "Re-run failed",
      }))
    } finally {
      setRerunning((prev) => {
        const next = new Set(prev)
        next.delete(record.id)
        return next
      })
    }
  }

  const filtered =
    activeFilter === "all" ? payouts : payouts.filter((p) => p.status === activeFilter)

  const countsByStatus = ALL_STATUSES.reduce(
    (acc, s) => ({ ...acc, [s]: payouts.filter((p) => p.status === s).length }),
    {} as Record<PayoutStatus, number>
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-14">
        <div className="text-center space-y-3">
          <Loader2 size={30} className="animate-spin text-[#6b2fa5] mx-auto" />
          <p className="text-sm text-gray-400">Loading payout logs...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3">
        <AlertCircle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-red-700">Failed to load payout logs</p>
          <p className="text-sm text-red-600 mt-0.5">{error}</p>
          <button
            onClick={fetchPayouts}
            className="text-xs text-red-600 underline mt-2 font-medium"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (payouts.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-10 text-center">
        <div className="p-3 bg-gray-100 rounded-full w-fit mx-auto mb-3">
          <ReceiptText size={28} className="text-gray-400" />
        </div>
        <p className="text-gray-600 font-semibold">No payout requests yet</p>
        <p className="text-sm text-gray-400 mt-1">
          Submitted payout requests for this event will appear here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700">
          {payouts.length} payout request{payouts.length !== 1 ? "s" : ""}
        </p>
        <button
          onClick={fetchPayouts}
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
            activeFilter === "all"
              ? "bg-[#6b2fa5] text-white border-[#6b2fa5]"
              : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
          }`}
        >
          <Filter size={11} />
          All
          <span
            className={`rounded-full px-1.5 py-0.5 leading-none text-[10px] font-bold ${
              activeFilter === "all" ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"
            }`}
          >
            {payouts.length}
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
                activeFilter === s
                  ? `${cfg.bg} ${cfg.text} ${cfg.border}`
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              }`}
            >
              {cfg.icon}
              {cfg.label}
              <span
                className={`rounded-full px-1.5 py-0.5 leading-none text-[10px] font-bold ${cfg.bg} ${cfg.text}`}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-500">
            No{" "}
            {activeFilter !== "all"
              ? STATUS_CONFIG[activeFilter as PayoutStatus].label.toLowerCase()
              : ""}{" "}
            payouts found.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((record) => {
            const cfg = STATUS_CONFIG[record.status]
            const pendingStale = isPendingStale(record)
            const processingStale = isProcessingStale(record)
            const isRerunning = rerunning.has(record.id)
            const rerunError = rerunErrors[record.id]

            return (
              <div
                key={record.id}
                className="bg-white border border-gray-200 rounded-xl p-5 space-y-3 hover:shadow-sm transition-shadow"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900 text-base">{record.date}</span>
                      <span
                        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border}`}
                      >
                        {cfg.icon}
                        {cfg.label}
                      </span>
                      {(pendingStale || processingStale) && (
                        <span className="inline-flex items-center gap-1 text-xs bg-orange-100 text-orange-600 border border-orange-200 px-2 py-0.5 rounded-full font-semibold">
                          <Clock size={11} />
                          Overdue
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                      <span>
                        Amount:{" "}
                        <span className="font-semibold text-gray-800">
                          ₦{Number(record.amount).toLocaleString()}
                        </span>
                      </span>
                      <span>
                        Bank:{" "}
                        <span className="font-semibold text-gray-800">{record.bankName}</span>
                      </span>
                    </div>

                    <p className="text-xs text-gray-400">
                      {record.accountName} · •••• {record.accountNumber.slice(-4)}
                    </p>

                    {record.createdAt && (
                      <p className="text-xs text-gray-400">
                        Submitted: {new Date(record.createdAt).toLocaleString()}
                      </p>
                    )}
                    {record.pendingAt && (
                      <p className="text-xs text-gray-400">
                        Pending since: {new Date(record.pendingAt).toLocaleString()}
                      </p>
                    )}
                    {record.processingAt && (
                      <p className="text-xs text-gray-400">
                        Processing since: {new Date(record.processingAt).toLocaleString()}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 items-end flex-shrink-0">
                    {record.status === "failed" && (
                      <button
                        onClick={() => handleRerun(record)}
                        disabled={isRerunning}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors disabled:opacity-50"
                      >
                        {isRerunning ? (
                          <>
                            <Loader2 size={13} className="animate-spin" />
                            Re-running...
                          </>
                        ) : (
                          <>
                            <RefreshCw size={13} />
                            Re-run
                          </>
                        )}
                      </button>
                    )}

                    {pendingStale && (
                      <a
                        href={buildWhatsAppLink(record, "pending")}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
                      >
                        <MessageCircle size={13} />
                        Report — Pending too long
                      </a>
                    )}

                    {processingStale && (
                      <a
                        href={buildWhatsAppLink(record, "processing")}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
                      >
                        <MessageCircle size={13} />
                        Report — Processing too long
                      </a>
                    )}
                  </div>
                </div>

                {rerunError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 flex gap-2 items-start">
                    <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-600">{rerunError}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
