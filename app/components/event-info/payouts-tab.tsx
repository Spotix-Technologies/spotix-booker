"use client"

import {
  AlertCircle, Wallet, Calendar, Loader2, CheckCircle,
  TrendingUp, CreditCard, X, ChevronRight, Clock, Shield,
  ReceiptText, Ban, CalendarX,
} from "lucide-react"
import { useState, useEffect, useCallback } from "react"
import CreatePayoutMethod from "./helper/CreatePayoutMethod"
import ViewPayoutMethods from "./helper/ViewPayoutMethods"
import PayoutConfirmation from "./helper/payout-confirmation"
import PayoutLog from "./helper/payout-log"

interface DailyTransaction {
  date: string
  eventName?: string
  ticketCount: number
  ticketSales: number
  lastPurchaseTime?: string
  createdAt?: string
  updatedAt: string
}

interface PayoutMethod {
  id: string
  accountNumber: string
  bankName: string
  bankCode: string
  accountName: string
  primary: boolean
  createdAt: string
}

// Parsed payout error types so we can render structured UI
type PayoutErrorKind = "restrictedDay" | "restrictedDate" | "generic"

interface PayoutError {
  kind: PayoutErrorKind
  day?: string    // for restrictedDay: e.g. "Sunday"
  date?: string   // for restrictedDate: e.g. "2025-01-05"
  reason: string  // the message from the API
}

interface PayoutsTabProps {
  availableBalance: number
  eventData: any
  userId: string
  eventId: string
  currentUserId: string
  attendees: any[]
  payId: string
}

const LOCK_HOURS = 30
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

function getUnlockTime(updatedAt: string): Date {
  return new Date(new Date(updatedAt).getTime() + LOCK_HOURS * 60 * 60 * 1000)
}

function isWithdrawable(updatedAt: string): boolean {
  if (!updatedAt) return false
  return Date.now() >= getUnlockTime(updatedAt).getTime()
}

function timeUntilWithdrawable(updatedAt: string): string {
  if (!updatedAt) return ""
  const diffMs = getUnlockTime(updatedAt).getTime() - Date.now()
  if (diffMs <= 0) return ""
  const totalSeconds = Math.floor(diffMs / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h >= 24) {
    const days = Math.floor(h / 24)
    return `Available in ${days}d ${h % 24}h ${m}m`
  }
  return `Available in ${h}h ${m}m ${s}s`
}

function unlockProgress(updatedAt: string): number {
  if (!updatedAt) return 0
  const start = new Date(updatedAt).getTime()
  const end = getUnlockTime(updatedAt).getTime()
  const now = Date.now()
  if (now >= end) return 100
  return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100))
}

/**
 * Classify an API error string into a structured PayoutError.
 *
 * The API sends the raw reason from Firestore for restricted checks, so:
 *   restrictedDay  → API reason contains a day name (Sunday–Saturday) or the
 *                    default message "Payouts for transactions on {Day}s..."
 *   restrictedDate → API reason references the specific yyyy-mm-dd date or the
 *                    default message "Payouts for {date} are currently restricted"
 *   generic        → everything else
 */
function classifyPayoutError(rawMessage: string, txnDate: string): PayoutError {
  const lower = rawMessage.toLowerCase()

  // Check for restricted date first (more specific match)
  if (lower.includes(txnDate)) {
    return { kind: "restrictedDate", date: txnDate, reason: rawMessage }
  }

  // Check for restricted day — any day name appearing alongside restriction language
  const matchedDay = DAYS.find((d) => lower.includes(d.toLowerCase()))
  if (matchedDay && (lower.includes("restricted") || lower.includes("processing"))) {
    return { kind: "restrictedDay", day: matchedDay, reason: rawMessage }
  }

  return { kind: "generic", reason: rawMessage }
}

// ─── Structured Error Banner ──────────────────────────────────────────────────
function PayoutErrorBanner({
  error,
  onDismiss,
}: {
  error: PayoutError
  onDismiss: () => void
}) {
  if (error.kind === "restrictedDay") {
    return (
      <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex gap-3">
        <Ban size={18} className="text-orange-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1 space-y-0.5">
          <p className="text-sm font-semibold text-orange-800">Payouts unavailable for this day</p>
          <p className="text-sm text-orange-700 leading-relaxed">
            We aren&apos;t processing payouts on{" "}
            <span className="font-semibold">{error.day}s</span> because{" "}
            <span className="font-medium">{error.reason}</span>
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="text-orange-400 hover:text-orange-600 flex-shrink-0"
        >
          <X size={16} />
        </button>
      </div>
    )
  }

  if (error.kind === "restrictedDate") {
    return (
      <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex gap-3">
        <CalendarX size={18} className="text-orange-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1 space-y-0.5">
          <p className="text-sm font-semibold text-orange-800">This date is restricted</p>
          <p className="text-sm text-orange-700 leading-relaxed">
            Payouts for{" "}
            <span className="font-semibold">{error.date}</span> isn&apos;t being processed
            because{" "}
            <span className="font-medium">{error.reason}</span>
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="text-orange-400 hover:text-orange-600 flex-shrink-0"
        >
          <X size={16} />
        </button>
      </div>
    )
  }

  // Generic error
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3">
      <AlertCircle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1 space-y-0.5">
        <p className="text-sm font-semibold text-red-700">Payout request failed</p>
        <p className="text-sm text-red-600 leading-relaxed">{error.reason}</p>
      </div>
      <button
        onClick={onDismiss}
        className="text-red-400 hover:text-red-600 flex-shrink-0"
      >
        <X size={16} />
      </button>
    </div>
  )
}

// ─── Status badge config for TxnCard ─────────────────────────────────────────
const STATUS_BADGE: Record<
  string,
  { label: string; bg: string; text: string; icon: React.ReactNode }
> = {
  pending: {
    label: "Pending",
    bg: "bg-amber-100",
    text: "text-amber-700",
    icon: <Clock size={11} />,
  },
  processing: {
    label: "Processing",
    bg: "bg-blue-100",
    text: "text-blue-700",
    icon: <Loader2 size={11} className="animate-spin" />,
  },
  failed: {
    label: "Failed",
    bg: "bg-red-100",
    text: "text-red-700",
    icon: <AlertCircle size={11} />,
  },
  successful: {
    label: "Successful",
    bg: "bg-green-100",
    text: "text-green-700",
    icon: <CheckCircle size={11} />,
  },
}

// ─── Transaction Card ─────────────────────────────────────────────────────────
interface TxnCardProps {
  txn: DailyTransaction
  /** null = no payout record exists for this date yet */
  payoutStatus: string | null
  onPayout: (txn: DailyTransaction) => void
  onAddMethod: () => void
  hasMethods: boolean
}

function TxnCard({ txn, payoutStatus, onPayout, onAddMethod, hasMethods }: TxnCardProps) {
  const canWithdraw = isWithdrawable(txn.updatedAt)
  const timeLeft = timeUntilWithdrawable(txn.updatedAt)
  const progress = unlockProgress(txn.updatedAt)
  const badge = payoutStatus ? (STATUS_BADGE[payoutStatus] ?? STATUS_BADGE.pending) : null

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow space-y-4">
      {/* Top row */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="space-y-1.5 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-gray-900 text-base">{txn.date}</span>

            {/* Existing payout status badge */}
            {badge && (
              <span
                className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold ${badge.bg} ${badge.text}`}
              >
                {badge.icon}
                {badge.label}
              </span>
            )}

            {/* Ready badge — only when no payout exists and lock cleared */}
            {!payoutStatus && canWithdraw && (
              <span className="inline-flex items-center gap-1 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold">
                <Shield size={11} />
                Ready
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-gray-600">
            <span>
              <span className="font-semibold text-gray-800">{txn.ticketCount}</span>{" "}
              ticket{txn.ticketCount !== 1 ? "s" : ""} sold
            </span>
            <span>
              Sales:{" "}
              <span className="font-semibold text-gray-800">
                ₦{Number(txn.ticketSales).toLocaleString()}
              </span>
            </span>
          </div>
        </div>

        {/* Action button */}
        <div className="flex-shrink-0">
          {payoutStatus ? (
            // Payout record exists — show status chip, not the payout button
            <button
              disabled
              className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 cursor-not-allowed ${
                badge ? `${badge.bg} ${badge.text}` : "bg-gray-100 text-gray-500"
              }`}
            >
              {badge?.icon}
              {badge?.label ?? payoutStatus}
            </button>
          ) : (
            // No payout yet — payout / locked button
            <button
              onClick={() => {
                if (!hasMethods) { onAddMethod(); return }
                if (canWithdraw) onPayout(txn)
              }}
              disabled={!canWithdraw}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 ${
                canWithdraw
                  ? "bg-[#6b2fa5] text-white hover:bg-[#5a2589] shadow-sm"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
            >
              {canWithdraw ? (
                <>Payout <ChevronRight size={14} /></>
              ) : (
                <><Clock size={14} /> Locked</>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Countdown + progress bar — only when not submitted and still locked */}
      {!payoutStatus && !canWithdraw && txn.updatedAt && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-amber-600 font-semibold flex items-center gap-1">
              <Clock size={12} />
              {timeLeft}
            </span>
            <span className="text-xs text-gray-400">{Math.round(progress)}% unlocked</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width: `${progress}%`,
                background:
                  progress >= 80 ? "#7c3aed" : progress >= 50 ? "#f59e0b" : "#d1d5db",
              }}
            />
          </div>
          <p className="text-xs text-gray-400">
            Last purchase: {new Date(txn.updatedAt).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
type ActiveView = "transactions" | "methods" | "addMethod" | "logs"

export default function PayoutsTab({
  availableBalance,
  eventData,
  userId,
  eventId,
  currentUserId,
  attendees,
}: PayoutsTabProps) {
  const [transactions, setTransactions] = useState<DailyTransaction[]>([])
  const [txnLoading, setTxnLoading] = useState(true)
  const [txnError, setTxnError] = useState<string | null>(null)

  const [methods, setMethods] = useState<PayoutMethod[]>([])
  const [methodsLoading, setMethodsLoading] = useState(true)
  const [methodsError, setMethodsError] = useState<string | null>(null)

  // date → payout status, seeded from the status API on mount
  const [payoutStatuses, setPayoutStatuses] = useState<Record<string, string>>({})

  const [activeView, setActiveView] = useState<ActiveView>("transactions")
  const [dialogTxn, setDialogTxn] = useState<DailyTransaction | null>(null)
  const [payoutError, setPayoutError] = useState<PayoutError | null>(null)

  // Live ticker for countdown timers
  const [, setTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  const totalRevenue: number = eventData?.totalRevenue ?? 0
  const paidAmount: number = eventData?.totalPaidOut ?? 0
  const availableRevenue: number = eventData?.availableRevenue ?? availableBalance

  const fetchTransactions = useCallback(async () => {
    try {
      setTxnLoading(true)
      setTxnError(null)
      const res = await fetch(`/api/payout?eventId=${eventId}&action=list`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to fetch transactions")
      setTransactions(data.transactions ?? [])
    } catch (err: any) {
      setTxnError(err.message || "Failed to load transaction data")
    } finally {
      setTxnLoading(false)
    }
  }, [eventId])

  // Seeds the payoutStatuses map from existing payout records.
  // Runs silently — a failure here doesn't block the UI.
  const fetchPayoutStatuses = useCallback(async () => {
    try {
      const res = await fetch(`/api/payout?eventId=${eventId}&action=status`)
      const data = await res.json()
      if (!res.ok) return
      const records: Array<{ date: string; status: string }> = data.payouts ?? []
      const map: Record<string, string> = {}
      for (const r of records) {
        map[r.date] = r.status
      }
      setPayoutStatuses(map)
    } catch {
      // Non-critical — button just stays visible until next load
    }
  }, [eventId])

  const fetchMethods = useCallback(async () => {
    try {
      setMethodsLoading(true)
      setMethodsError(null)
      const res = await fetch("/api/payout/method")
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to fetch payout methods")
      setMethods(data.methods ?? [])
    } catch (err: any) {
      setMethodsError(err.message || "Failed to load payout methods")
    } finally {
      setMethodsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTransactions()
    fetchPayoutStatuses()
    fetchMethods()
  }, [fetchTransactions, fetchPayoutStatuses, fetchMethods])

  // Ready count excludes dates that already have any payout record
  const readyCount = transactions.filter(
    (t) => isWithdrawable(t.updatedAt) && !payoutStatuses[t.date]
  ).length

  function handlePayoutSuccess(date: string) {
    // Optimistically mark as pending; next status fetch will confirm
    setPayoutStatuses((prev) => ({ ...prev, [date]: "pending" }))
  }

  function handlePayoutError(rawMessage: string, txnDate: string) {
    setPayoutError(classifyPayoutError(rawMessage, txnDate))
  }

  return (
    <div className="space-y-6">
      {/* Payout Confirmation Dialog */}
      {dialogTxn && (
        <PayoutConfirmation
          txn={dialogTxn}
          methods={methods}
          eventId={eventId}
          onSuccess={handlePayoutSuccess}
          onError={(msg) => handlePayoutError(msg, dialogTxn.date)}
          onClose={() => setDialogTxn(null)}
        />
      )}

      {/* Info Alert */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
        <AlertCircle size={18} className="text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-blue-700 leading-relaxed">
          Payouts are available per transaction day. Withdrawals unlock{" "}
          <strong>30 hours</strong> after the last ticket purchase on that day. Make sure you
          have a primary payout method set before requesting.
        </p>
      </div>

      {/* ── 3 Stat Blocks ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-100 rounded-lg">
              <TrendingUp size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">
                Total Revenue
              </p>
              <p className="text-2xl font-bold text-gray-900">
                ₦{totalRevenue.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-purple-200 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-100 rounded-lg">
              <Wallet size={20} className="text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">
                Available
              </p>
              <p className="text-2xl font-bold text-[#6b2fa5]">
                ₦{availableRevenue.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-green-200 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-green-100 rounded-lg">
              <CheckCircle size={20} className="text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">
                Paid Out
              </p>
              <p className="text-2xl font-bold text-green-600">
                ₦{paidAmount.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Structured Payout Error Banner */}
      {payoutError && (
        <PayoutErrorBanner
          error={payoutError}
          onDismiss={() => setPayoutError(null)}
        />
      )}

      {/* ── View Toggle ───────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        <button
          onClick={() => setActiveView("transactions")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px flex items-center gap-2 whitespace-nowrap ${
            activeView === "transactions"
              ? "border-[#6b2fa5] text-[#6b2fa5]"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Calendar size={14} />
          Transaction Days
          {readyCount > 0 && (
            <span className="bg-[#6b2fa5] text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
              {readyCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveView("logs")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px flex items-center gap-2 whitespace-nowrap ${
            activeView === "logs"
              ? "border-[#6b2fa5] text-[#6b2fa5]"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <ReceiptText size={14} />
          Payout Logs
        </button>

        <button
          onClick={() => setActiveView("methods")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px flex items-center gap-2 whitespace-nowrap ${
            activeView === "methods" || activeView === "addMethod"
              ? "border-[#6b2fa5] text-[#6b2fa5]"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <CreditCard size={14} />
          Payout Methods
          {methods.length > 0 && (
            <span className="bg-gray-200 text-gray-700 text-xs rounded-full px-1.5 py-0.5 leading-none">
              {methods.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Transaction Days View ─────────────────────────────────────────── */}
      {activeView === "transactions" && (
        <div>
          {txnLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center space-y-3">
                <Loader2 size={32} className="animate-spin text-[#6b2fa5] mx-auto" />
                <p className="text-sm text-gray-400">Loading transactions...</p>
              </div>
            </div>
          ) : txnError ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3">
              <AlertCircle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-700">Failed to load</p>
                <p className="text-sm text-red-600 mt-0.5">{txnError}</p>
                <button
                  onClick={fetchTransactions}
                  className="text-xs text-red-600 underline mt-2 font-medium"
                >
                  Try again
                </button>
              </div>
            </div>
          ) : transactions.length === 0 ? (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-10 text-center">
              <div className="p-3 bg-gray-100 rounded-full w-fit mx-auto mb-3">
                <Calendar size={28} className="text-gray-400" />
              </div>
              <p className="text-gray-600 font-semibold">No transactions yet</p>
              <p className="text-sm text-gray-400 mt-1">
                Transaction records will appear here once tickets are sold.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {transactions.map((txn) => (
                <TxnCard
                  key={txn.date}
                  txn={txn}
                  payoutStatus={payoutStatuses[txn.date] ?? null}
                  hasMethods={methods.length > 0}
                  onPayout={(t) => setDialogTxn(t)}
                  onAddMethod={() => setActiveView("methods")}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Payout Logs View ──────────────────────────────────────────────── */}
      {activeView === "logs" && (
        <PayoutLog eventId={eventId} userId={userId} />
      )}

      {/* ── Payout Methods View ───────────────────────────────────────────── */}
      {activeView === "methods" && (
        <ViewPayoutMethods
          methods={methods}
          loading={methodsLoading}
          error={methodsError}
          onRefresh={fetchMethods}
          onAddNew={() => setActiveView("addMethod")}
        />
      )}

      {/* ── Add Method View ───────────────────────────────────────────────── */}
      {activeView === "addMethod" && (
        <CreatePayoutMethod
          userId={currentUserId}
          onCreated={() => {
            fetchMethods()
            setActiveView("methods")
          }}
          onCancel={() => setActiveView("methods")}
        />
      )}
    </div>
  )
}