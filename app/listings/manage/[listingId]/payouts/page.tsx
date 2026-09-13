"use client"

/**
 * app/listings/manage/[listingId]/payouts/page.tsx
 *
 * Full-page payouts view for one merch listing — the same idea as the
 * event Payouts tab and the election Payout tab, reached from the
 * "Payouts" icon on Manage Listings (listing-card.tsx / listing-list-row.tsx).
 *
 * Daily sales come from admin/merch/{listingId}/{date} (Firestore),
 * written by spotix-backend on every merch order. A day becomes
 * withdrawable 30 hours after its last order, same rule as events/polls/
 * elections. Requesting a payout validates (server-side, in
 * /api/listings/[listingId]/payout):
 *   - the listing isn't flagged
 *   - the date/day isn't platform-restricted
 *   - payouts aren't globally paused
 *   - the 30-hour lock has cleared
 *   - no active/successful payout already exists for that date
 * before the booker picks which saved bank account to settle into and
 * confirms.
 *
 * Listings have no collaborator system, so this is simpler than the
 * event tab: no Vault, no role-aware method resolution — just the
 * listing owner and their own payout methods.
 */

import { useCallback, useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import {
  ArrowLeft, Calendar, CreditCard, ReceiptText, Package, Loader2,
  AlertCircle, CheckCircle, Clock, Shield, Ban, CalendarX, X, Star,
  Wallet, ShoppingBag,
} from "lucide-react"
import { authFetch, getAccessToken, tryRefreshTokens } from "@/lib/auth-client"
import { waitForAuthInit } from "@/hooks/useAuth"
import { useBVTStatus } from "@/hooks/useBVTStatus"
import { toast } from "@/lib/toast"
import { SkeletonRows } from "@/components/ui/skeleton"
import ViewPayoutMethods from "@/components/event-info/helper/ViewPayoutMethods"
import ReceiptModal from "@/components/event-info/helper/receipt-modal"
import PayoutStatusCard from "@/components/payout/PayoutStatusCard"
import { displayRecordToReceipt } from "@/lib/receipt-image"
import { fetchMerchPayoutLogRecords } from "@/lib/merch-payout-log-data"
import { formatStatusLabel, type DisplayRecord } from "@/lib/payout-log-data"

// ── Types ────────────────────────────────────────────────────────────────

interface Listing {
  id: string
  productName: string
  images: string[]
  totalAmount: number
  totalSold: number
  totalPaidOut: number
  flagged: boolean
}

interface DailyMerchTxn {
  date: string
  productName?: string
  orderCount: number
  unitsSold: number
  merchSales: number
  lastOrderTime?: string
  lastUpdated: string
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

type PayoutErrorKind = "restrictedDay" | "restrictedDate" | "generic"
interface PayoutError {
  kind: PayoutErrorKind
  day?: string
  date?: string
  reason: string
}

const LOCK_HOURS = 30
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

function getUnlockTime(lastUpdated: string): Date {
  return new Date(new Date(lastUpdated).getTime() + LOCK_HOURS * 60 * 60 * 1000)
}
function isWithdrawable(lastUpdated: string): boolean {
  if (!lastUpdated) return false
  return Date.now() >= getUnlockTime(lastUpdated).getTime()
}
function timeUntilWithdrawable(lastUpdated: string): string {
  if (!lastUpdated) return ""
  const diffMs = getUnlockTime(lastUpdated).getTime() - Date.now()
  if (diffMs <= 0) return ""
  const totalSeconds = Math.floor(diffMs / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  if (h >= 24) {
    const days = Math.floor(h / 24)
    return `Available in ${days}d ${h % 24}h ${m}m`
  }
  return `Available in ${h}h ${m}m`
}
function unlockProgress(lastUpdated: string): number {
  if (!lastUpdated) return 0
  const start = new Date(lastUpdated).getTime()
  const end = getUnlockTime(lastUpdated).getTime()
  const now = Date.now()
  if (now >= end) return 100
  return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100))
}

function classifyPayoutError(rawMessage: string, txnDate: string): PayoutError {
  const lower = rawMessage.toLowerCase()
  if (lower.includes(txnDate)) return { kind: "restrictedDate", date: txnDate, reason: rawMessage }
  const matchedDay = DAYS.find((d) => lower.includes(d.toLowerCase()))
  if (matchedDay && (lower.includes("restricted") || lower.includes("processing"))) {
    return { kind: "restrictedDay", day: matchedDay, reason: rawMessage }
  }
  return { kind: "generic", reason: rawMessage }
}

const STATUS_BADGE: Record<string, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  initializing: { label: "Initializing", bg: "bg-amber-100", text: "text-amber-700", icon: <Loader2 size={11} className="animate-spin" /> },
  processing: { label: "Processing", bg: "bg-blue-100", text: "text-blue-700", icon: <Loader2 size={11} className="animate-spin" /> },
  failed: { label: "Failed", bg: "bg-red-100", text: "text-red-700", icon: <AlertCircle size={11} /> },
  successful: { label: "Successful", bg: "bg-green-100", text: "text-green-700", icon: <CheckCircle size={11} /> },
}

// ── Page ─────────────────────────────────────────────────────────────────

type ActiveView = "transactions" | "logs" | "methods"

export default function MerchPayoutsPage() {
  const router = useRouter()
  const params = useParams()
  const listingId = params.listingId as string

  const [loading, setLoading] = useState(true)
  const [listing, setListing] = useState<Listing | null>(null)

  const [transactions, setTransactions] = useState<DailyMerchTxn[]>([])
  const [txnLoading, setTxnLoading] = useState(true)
  const [txnError, setTxnError] = useState<string | null>(null)

  const [payoutStatuses, setPayoutStatuses] = useState<Record<string, string>>({})
  const [payoutRefs, setPayoutRefs] = useState<Record<string, string>>({})
  const [payoutRecords, setPayoutRecords] = useState<Record<string, DisplayRecord>>({})

  const [methods, setMethods] = useState<PayoutMethod[]>([])
  const [methodsLoading, setMethodsLoading] = useState(true)
  const [methodsError, setMethodsError] = useState<string | null>(null)

  const [logs, setLogs] = useState<DisplayRecord[]>([])
  const [logsLoading, setLogsLoading] = useState(true)

  const [activeView, setActiveView] = useState<ActiveView>("transactions")
  const [dialogTxn, setDialogTxn] = useState<DailyMerchTxn | null>(null)
  const [payoutError, setPayoutError] = useState<PayoutError | null>(null)
  const [liveReference, setLiveReference] = useState<string | null>(null)
  const [receiptRecord, setReceiptRecord] = useState<DisplayRecord | null>(null)

  const { isVerified: bvtVerified, loading: bvtLoading } = useBVTStatus()

  function requireBVTOrRedirect(): boolean {
    if (bvtLoading) return false
    if (!bvtVerified) {
      toast.warning("Verification required", { description: "Complete KYC in the verification page to access withdrawals." })
      router.push("/verification")
      return false
    }
    return true
  }

  // ── Auth + initial load ───────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        await waitForAuthInit()
        let token = getAccessToken()
        if (!token) {
          const refreshed = await tryRefreshTokens()
          if (!refreshed) { router.push("/login"); return }
        }
        await loadListing()
      } catch (err) {
        console.error("Merch payouts page auth error:", err)
        router.push("/login")
      } finally {
        setLoading(false)
      }
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId])

  async function loadListing() {
    const res = await authFetch(`/api/listings/${listingId}`)
    if (!res.ok) {
      if (res.status === 404) router.push("/listings/manage")
      return
    }
    const data = await res.json()
    setListing(data.listing ?? null)
  }

  const fetchTransactions = useCallback(async () => {
    try {
      setTxnLoading(true)
      setTxnError(null)
      const res = await authFetch(`/api/listings/${listingId}/payout?action=list`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to fetch transactions")
      setTransactions(data.transactions ?? [])
    } catch (err: any) {
      setTxnError(err.message || "Failed to load transaction days")
    } finally {
      setTxnLoading(false)
    }
  }, [listingId])

  const fetchPayoutStatuses = useCallback(async () => {
    try {
      const res = await authFetch(`/api/listings/${listingId}/payout?action=status`)
      const data = await res.json()
      if (!res.ok) return
      const statuses: Record<string, string> = {}
      const refs: Record<string, string> = {}
      const records: Record<string, DisplayRecord> = {}
      for (const p of data.payouts ?? []) {
        // A date can only ever have one active/successful row (server
        // enforces this) — the newest one wins if somehow more than one
        // (e.g. a prior failed attempt) shares a date.
        if (!statuses[p.date] || p.status !== "failed") {
          statuses[p.date] = p.status
          refs[p.date] = p.reference
          records[p.date] = {
            id: p.reference,
            source: "payout",
            date: p.date,
            amount: p.amount,
            bankName: p.bankName,
            accountNumber: p.accountNumber,
            accountName: p.accountName,
            status: p.status,
            failureReason: p.failureReason,
            narration: p.narration,
            userId: "",
            createdAt: p.createdAt,
            resolvedAt: p.resolvedAt,
            durationSeconds: p.durationSeconds,
          }
        }
      }
      setPayoutStatuses(statuses)
      setPayoutRefs(refs)
      setPayoutRecords(records)
    } catch {
      // Non-fatal — Transaction Days still render without status badges.
    }
  }, [listingId])

  const fetchMethods = useCallback(async () => {
    try {
      setMethodsLoading(true)
      setMethodsError(null)
      const res = await authFetch("/api/payout/method")
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to fetch payout methods")
      setMethods(data.methods ?? [])
    } catch (err: any) {
      setMethodsError(err.message || "Failed to load payout methods")
    } finally {
      setMethodsLoading(false)
    }
  }, [])

  const fetchLogs = useCallback(async () => {
    try {
      setLogsLoading(true)
      const records = await fetchMerchPayoutLogRecords(listingId)
      setLogs(records)
    } catch {
      // Logs are a convenience view — Transaction Days remains the source of truth.
    } finally {
      setLogsLoading(false)
    }
  }, [listingId])

  useEffect(() => {
    if (loading) return
    fetchTransactions()
    fetchPayoutStatuses()
    fetchMethods()
    fetchLogs()
  }, [loading, fetchTransactions, fetchPayoutStatuses, fetchMethods, fetchLogs])

  // Live ticker for countdown timers
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  async function handlePayoutSuccess(reference: string) {
    setPayoutRefs((prev) => (dialogTxn ? { ...prev, [dialogTxn.date]: reference } : prev))
    setPayoutStatuses((prev) => (dialogTxn ? { ...prev, [dialogTxn.date]: "initializing" } : prev))
    setLiveReference(reference)
    toast.success("Payout requested", { description: "We'll update the status here as it processes." })
    fetchPayoutStatuses()
    fetchLogs()
  }

  const formatCurrency = (n: number) => `₦${Number(n || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 via-purple-50/30 to-gray-100">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-[#6b2fa5]/30 border-t-[#6b2fa5] rounded-full animate-spin" />
          <Wallet className="w-8 h-8 text-[#6b2fa5] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <p className="mt-4 text-gray-600 font-medium">Loading payouts...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-purple-50/30 to-gray-100">
      <div className="container mx-auto px-4 py-12 max-w-5xl">
        <button
          onClick={() => router.push("/listings/manage")}
          className="inline-flex items-center gap-2 text-[#6b2fa5] hover:text-[#5a2789] mb-6 transition-colors duration-200"
        >
          <ArrowLeft size={20} />
          <span className="font-medium">Back to Listings</span>
        </button>

        {listing && (
          <div className="mb-6 bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-[#6b2fa5]/10 rounded-xl flex items-center justify-center flex-shrink-0">
                <Package className="w-6 h-6 text-[#6b2fa5]" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold text-gray-900 truncate">{listing.productName}</h1>
                <p className="text-sm text-gray-500">Payouts</p>
              </div>
            </div>
          </div>
        )}

        {listing?.flagged && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3">
            <Ban size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 font-medium">
              This listing has been flagged. Payouts are on hold until support clears it — contact Spotix with your listing ID.
            </p>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-5 flex items-center gap-4">
            <div className="w-11 h-11 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <ShoppingBag className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Total Revenue</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(listing?.totalAmount ?? 0)}</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-5 flex items-center gap-4">
            <div className="w-11 h-11 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Paid Out</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(listing?.totalPaidOut ?? 0)}</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-5 flex items-center gap-4">
            <div className="w-11 h-11 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Wallet className="w-5 h-5 text-[#6b2fa5]" />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Available</p>
              <p className="text-xl font-bold text-gray-900">
                {formatCurrency(Math.max(0, (listing?.totalAmount ?? 0) - (listing?.totalPaidOut ?? 0)))}
              </p>
            </div>
          </div>
        </div>

        {/* Live payout dialog */}
        {liveReference && (
          <div
            style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", backdropFilter: "blur(5px)", padding: "0 16px" }}
            onClick={(e) => { if (e.target === e.currentTarget) setLiveReference(null) }}
          >
            <div className="w-full max-w-md">
              <PayoutStatusCard
                reference={liveReference}
                onStatusChange={(state) => {
                  setPayoutStatuses((prev) => {
                    const date = Object.keys(payoutRefs).find((d) => payoutRefs[d] === liveReference)
                    return date ? { ...prev, [date]: state.status } : prev
                  })
                  if (state.status === "successful" || state.status === "failed") {
                    fetchPayoutStatuses()
                    fetchLogs()
                  }
                }}
              />
              <button
                onClick={() => setLiveReference(null)}
                className="mt-3 w-full py-2.5 rounded-xl text-sm font-semibold bg-white/90 text-gray-700 hover:bg-white transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 overflow-x-auto overflow-y-hidden mb-6">
          <button
            onClick={() => setActiveView("transactions")}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px flex items-center gap-2 whitespace-nowrap ${activeView === "transactions" ? "border-[#6b2fa5] text-[#6b2fa5]" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            <Calendar size={14} /> Transaction Days
          </button>
          <button
            onClick={() => setActiveView("logs")}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px flex items-center gap-2 whitespace-nowrap ${activeView === "logs" ? "border-[#6b2fa5] text-[#6b2fa5]" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            <ReceiptText size={14} /> Payout Logs
          </button>
          <button
            onClick={() => setActiveView("methods")}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px flex items-center gap-2 whitespace-nowrap ${activeView === "methods" ? "border-[#6b2fa5] text-[#6b2fa5]" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            <CreditCard size={14} /> Payout Methods
            {methods.length > 0 && <span className="bg-gray-200 text-gray-700 text-xs rounded-full px-1.5 py-0.5 leading-none">{methods.length}</span>}
          </button>
        </div>

        {activeView === "transactions" && (
          <div>
            {payoutError && (
              <PayoutErrorBanner error={payoutError} onDismiss={() => setPayoutError(null)} />
            )}
            {txnLoading ? (
              <SkeletonRows count={4} rowClassName="h-24" />
            ) : txnError ? (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3">
                <AlertCircle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-700">Failed to load</p>
                  <p className="text-sm text-red-600 mt-0.5">{txnError}</p>
                  <button onClick={fetchTransactions} className="text-xs text-red-600 underline mt-2 font-medium">Try again</button>
                </div>
              </div>
            ) : transactions.length === 0 ? (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-10 text-center">
                <Calendar size={28} className="text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600 font-semibold">No transactions yet</p>
                <p className="text-sm text-gray-400 mt-1">Transaction records will appear here once orders come in.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {transactions.map((txn) => (
                  <MerchTxnCard
                    key={txn.date}
                    txn={txn}
                    payoutStatus={payoutStatuses[txn.date] ?? null}
                    payoutReference={payoutRefs[txn.date] ?? null}
                    payoutRecord={payoutRecords[txn.date] ?? null}
                    productName={listing?.productName ?? ""}
                    hasMethods={methods.length > 0}
                    flagged={listing?.flagged ?? false}
                    onPayout={(t) => { if (requireBVTOrRedirect()) setDialogTxn(t) }}
                    onReopen={(ref) => setLiveReference(ref)}
                    onAddMethod={() => setActiveView("methods")}
                    onViewReceipt={setReceiptRecord}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {activeView === "logs" && (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            {logsLoading ? (
              <div className="p-6"><SkeletonRows count={3} rowClassName="h-16" /></div>
            ) : logs.length === 0 ? (
              <div className="p-16 text-center">
                <ReceiptText className="w-10 h-10 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 font-semibold">No payout requests yet</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {logs.map((log) => {
                  const badge = STATUS_BADGE[log.status] ?? null
                  return (
                    <div key={log.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{log.date}</p>
                        <p className="text-xs text-gray-500">{log.narration || formatStatusLabel(log.status)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-gray-900">{formatCurrency(log.amount)}</span>
                        {badge && (
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold ${badge.bg} ${badge.text}`}>
                            {badge.icon}{badge.label}
                          </span>
                        )}
                        {log.status === "successful" && (
                          <button
                            onClick={() => setReceiptRecord(log)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-50 text-[#6b2fa5] border border-purple-200 hover:bg-purple-100 transition-colors"
                          >
                            <ReceiptText size={13} /> View Receipt
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {activeView === "methods" && (
          <ViewPayoutMethods
            methods={methods}
            loading={methodsLoading}
            error={methodsError}
            onRefresh={fetchMethods}
            onAddNew={() => router.push("/integrations")}
          />
        )}
      </div>

      {dialogTxn && (
        <MerchPayoutConfirmation
          txn={dialogTxn}
          methods={methods}
          listingId={listingId}
          onSuccess={(reference) => { setDialogTxn(null); handlePayoutSuccess(reference) }}
          onError={(message) => { setDialogTxn(null); setPayoutError(classifyPayoutError(message, dialogTxn.date)) }}
          onClose={() => setDialogTxn(null)}
        />
      )}

      {receiptRecord && (
        <ReceiptModal
          data={displayRecordToReceipt(receiptRecord, listing?.productName ?? "listing")}
          onClose={() => setReceiptRecord(null)}
        />
      )}
    </div>
  )
}

// ── Error banner ─────────────────────────────────────────────────────────

function PayoutErrorBanner({ error, onDismiss }: { error: PayoutError; onDismiss: () => void }) {
  const common = "rounded-xl p-4 flex gap-3 mb-4"
  if (error.kind === "restrictedDay") {
    return (
      <div className={`bg-orange-50 border border-orange-200 ${common}`}>
        <Ban size={18} className="text-orange-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1 space-y-0.5">
          <p className="text-sm font-semibold text-orange-800">Payouts unavailable for this day</p>
          <p className="text-sm text-orange-700 leading-relaxed">
            We aren&apos;t processing payouts on <span className="font-semibold">{error.day}s</span> because{" "}
            <span className="font-medium">{error.reason}</span>
          </p>
        </div>
        <button onClick={onDismiss} className="text-orange-400 hover:text-orange-600 flex-shrink-0"><X size={16} /></button>
      </div>
    )
  }
  if (error.kind === "restrictedDate") {
    return (
      <div className={`bg-orange-50 border border-orange-200 ${common}`}>
        <CalendarX size={18} className="text-orange-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1 space-y-0.5">
          <p className="text-sm font-semibold text-orange-800">This date is restricted</p>
          <p className="text-sm text-orange-700 leading-relaxed">
            Payouts for <span className="font-semibold">{error.date}</span> isn&apos;t being processed because{" "}
            <span className="font-medium">{error.reason}</span>
          </p>
        </div>
        <button onClick={onDismiss} className="text-orange-400 hover:text-orange-600 flex-shrink-0"><X size={16} /></button>
      </div>
    )
  }
  return (
    <div className={`bg-red-50 border border-red-200 ${common}`}>
      <AlertCircle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1 space-y-0.5">
        <p className="text-sm font-semibold text-red-700">Payout request failed</p>
        <p className="text-sm text-red-600 leading-relaxed">{error.reason}</p>
      </div>
      <button onClick={onDismiss} className="text-red-400 hover:text-red-600 flex-shrink-0"><X size={16} /></button>
    </div>
  )
}

// ── Transaction day card ───────────────────────────────────────────────

function MerchTxnCard({
  txn, payoutStatus, payoutReference, payoutRecord, productName, hasMethods, flagged, onPayout, onReopen, onAddMethod, onViewReceipt,
}: {
  txn: DailyMerchTxn
  payoutStatus: string | null
  payoutReference: string | null
  payoutRecord: DisplayRecord | null
  productName: string
  hasMethods: boolean
  flagged: boolean
  onPayout: (txn: DailyMerchTxn) => void
  onReopen: (reference: string) => void
  onAddMethod: () => void
  onViewReceipt: (record: DisplayRecord) => void
}) {
  const canWithdraw = isWithdrawable(txn.lastUpdated) && !flagged
  const timeLeft = timeUntilWithdrawable(txn.lastUpdated)
  const progress = unlockProgress(txn.lastUpdated)
  const badge = payoutStatus ? (STATUS_BADGE[payoutStatus] ?? null) : null
  const blockingStatus = Boolean(payoutStatus) && payoutStatus !== "failed"
  const isReopenable = blockingStatus && (payoutStatus === "initializing" || payoutStatus === "processing") && Boolean(payoutReference)

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-all space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="space-y-1.5 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-gray-900 text-base">{txn.date}</span>
            {badge && (
              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold ${badge.bg} ${badge.text}`}>
                {badge.icon}{badge.label}
              </span>
            )}
            {!blockingStatus && canWithdraw && (
              <span className="inline-flex items-center gap-1 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold">
                <Shield size={11} /> Ready
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-gray-600">
            <span><span className="font-semibold text-gray-800">{txn.unitsSold}</span> unit{txn.unitsSold !== 1 ? "s" : ""} · {txn.orderCount} order{txn.orderCount !== 1 ? "s" : ""}</span>
            <span>Sales: <span className="font-semibold text-gray-800">₦{Number(txn.merchSales).toLocaleString()}</span></span>
          </div>
        </div>

        <div className="flex-shrink-0">
          {blockingStatus ? (
            <button
              onClick={isReopenable ? () => onReopen(payoutReference as string) : undefined}
              disabled={!isReopenable}
              className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 ${isReopenable ? "cursor-pointer hover:opacity-80" : "cursor-not-allowed"} ${badge ? `${badge.bg} ${badge.text}` : "bg-gray-100 text-gray-500"}`}
            >
              {badge?.icon}{badge?.label ?? payoutStatus}
            </button>
          ) : !hasMethods ? (
            <button onClick={onAddMethod} className="px-4 py-2 rounded-xl text-sm font-semibold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors">
              Add Payout Method
            </button>
          ) : (
            <button
              onClick={() => onPayout(txn)}
              disabled={!canWithdraw}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${canWithdraw ? "bg-[#6b2fa5] text-white hover:bg-[#5a2589]" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
            >
              Withdraw
            </button>
          )}
        </div>
      </div>

      {payoutStatus === "successful" && payoutRecord && (
        <div className="flex justify-end">
          <button
            onClick={() => onViewReceipt(payoutRecord)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-purple-50 text-[#6b2fa5] border border-purple-200 hover:bg-purple-100 transition-colors"
          >
            <ReceiptText size={13} /> View Receipt
          </button>
        </div>
      )}

      {!blockingStatus && !canWithdraw && txn.lastUpdated && !flagged && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-amber-600 font-semibold flex items-center gap-1"><Clock size={12} />{timeLeft}</span>
            <span className="text-xs text-gray-400">{Math.round(progress)}% unlocked</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${progress}%`, background: progress >= 80 ? "#7c3aed" : progress >= 50 ? "#f59e0b" : "#d1d5db" }} />
          </div>
          <p className="text-xs text-gray-400">Last order: {new Date(txn.lastUpdated).toLocaleString()}</p>
        </div>
      )}
    </div>
  )
}

// ── Account-choice confirmation dialog ────────────────────────────────

function MerchPayoutConfirmation({
  txn, methods, listingId, onSuccess, onError, onClose,
}: {
  txn: DailyMerchTxn
  methods: PayoutMethod[]
  listingId: string
  onSuccess: (reference: string) => void
  onError: (message: string) => void
  onClose: () => void
}) {
  const primaryMethod = methods.find((m) => m.primary) ?? null
  const [selectedMethodId, setSelectedMethodId] = useState<string>(primaryMethod?.id ?? "")
  const [processing, setProcessing] = useState(false)
  const selectedMethod = methods.find((m) => m.id === selectedMethodId) ?? null

  async function handleConfirm() {
    if (!selectedMethod) return
    setProcessing(true)
    try {
      const res = await authFetch(`/api/listings/${listingId}/payout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ date: txn.date, amount: txn.merchSales, methodId: selectedMethodId }),
      })
      const data = await res.json()
      if (!res.ok) {
        onClose()
        onError(data.error || "Payout request failed")
        return
      }
      onClose()
      onSuccess(data.reference)
    } catch {
      onClose()
      onError("A network error occurred. Please try again.")
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", backdropFilter: "blur(5px)", padding: "0 16px", overflow: "auto" }}
      onClick={(e) => { if (e.target === e.currentTarget && !processing) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Request Payout</h3>
          <button onClick={onClose} disabled={processing} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg transition-colors disabled:opacity-40"><X size={18} /></button>
        </div>

        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-2">
          <p className="text-xs text-purple-600 font-semibold uppercase tracking-wider">Transaction Day</p>
          <p className="text-xl font-bold text-gray-900">{txn.date}</p>
          <div className="flex gap-4 text-sm text-gray-600 pt-1">
            <span><span className="font-semibold text-gray-800">{txn.unitsSold}</span> unit{txn.unitsSold !== 1 ? "s" : ""}</span>
            <span>Total: <span className="font-semibold text-gray-800">₦{Number(txn.merchSales).toLocaleString()}</span></span>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-700">Settle to</p>
          {methods.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
              <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-700">No payout methods found. Add a bank account first.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {methods.map((method) => (
                <label
                  key={method.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${selectedMethodId === method.id ? "border-[#6b2fa5] bg-purple-50 shadow-sm" : "border-gray-200 hover:border-gray-300"}`}
                >
                  <input type="radio" name="payoutMethod" value={method.id} checked={selectedMethodId === method.id} onChange={() => setSelectedMethodId(method.id)} className="accent-[#6b2fa5]" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900 truncate">{method.bankName}</p>
                      {method.primary && <Star size={14} fill="#6b2fa5" className="text-[#6b2fa5] flex-shrink-0" />}
                    </div>
                    <p className="text-xs text-gray-500">{method.accountName} · •••• {method.accountNumber.slice(-4)}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} disabled={processing} className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">Cancel</button>
          <button
            onClick={handleConfirm}
            disabled={!selectedMethod || processing}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${selectedMethod && !processing ? "bg-[#6b2fa5] text-white hover:bg-[#5a2589]" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
          >
            {processing ? (<><Loader2 size={16} className="animate-spin" /> Processing...</>) : "Confirm Payout"}
          </button>
        </div>
      </div>
    </div>
  )
}
