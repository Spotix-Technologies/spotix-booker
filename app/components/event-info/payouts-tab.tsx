"use client"

import {
  AlertCircle, Wallet, Calendar, Loader2, CheckCircle,
  TrendingUp, CreditCard, X, ChevronRight, Clock, Shield,
  ReceiptText, Ban, CalendarX, Lock, Eye, Download, ChevronDown,
  FileText, FileSpreadsheet,
} from "lucide-react"
import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/hooks/useAuth"
import { useBVTStatus } from "@/hooks/useBVTStatus"
import { toast } from "@/lib/toast"
import { SkeletonRows } from "@/components/ui/skeleton"
import ViewPayoutMethods from "./helper/ViewPayoutMethods"
import { MaskedAmount } from "@/components/ui/masked-amount"
import PayoutConfirmation from "./helper/payout-confirmation"
import PayoutLog from "./helper/payout-log"
import VaultPanel from "./helper/vault-panel"
import VaultSignoffs from "./helper/vault-signoffs"
import VaultKeyEnterOnPayoutDialog from "./helper/vault-key-enter-onPayout"
import PayoutStateDialog from "@/components/payout/PayoutStateDialog"
import type { PayoutLiveState } from "@/components/payout/use-payout-stream"
import { fetchPayoutLogRecords, type DisplayRecord } from "@/lib/payout-log-data"
import { buildPayoutCsv, buildPayoutPdfBlob } from "@/lib/payout-export"
import { displayRecordToReceipt } from "@/lib/receipt-image"
import ReceiptModal from "./helper/receipt-modal"

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
  payId: string
  isOwner: boolean
  collabRole: string | null
  organizerId: string
  /** Lets the parent (event-info page) deep-link straight into a sub-view via
   *  ?tab=payouts&payoutLogs — see app/event-info/[eventId]/page.tsx. */
  initialView?: "transactions" | "methods" | "addMethod" | "logs"
  onViewChange?: (view: "transactions" | "methods" | "addMethod" | "logs") => void
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
  initializing: {
    label: "Initializing",
    bg: "bg-amber-100",
    text: "text-amber-700",
    icon: <Loader2 size={11} className="animate-spin" />,
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
  vault_pending: {
    label: "Awaiting Vault Sign-off",
    bg: "bg-purple-100",
    text: "text-purple-700",
    icon: <Lock size={11} />,
  },
  cancelled: {
    label: "Cancelled",
    bg: "bg-gray-100",
    text: "text-gray-600",
    icon: <Ban size={11} />,
  },
  rejected: {
    label: "Rejected",
    bg: "bg-gray-100",
    text: "text-gray-600",
    icon: <Ban size={11} />,
  },
}

// ─── Transaction Card ─────────────────────────────────────────────────────────
interface TxnCardProps {
  txn: DailyTransaction
  /** null = no payout record exists for this date yet */
  payoutStatus: string | null
  /** The Supabase payout reference for this date, if one exists — lets an
   *  in-flight badge (initializing/processing) reopen the live dialog. */
  payoutReference?: string | null
  /** Full merged payout record for this date (see payout-log-data.ts) — only
   *  populated once the payout has resolved; drives the "View Receipt" button. */
  payoutRecord?: DisplayRecord | null
  eventName: string
  onPayout: (txn: DailyTransaction) => void
  /** Reopens the live PayoutStateDialog for an in-flight payout. */
  onReopen: (reference: string) => void
  onAddMethod: () => void
  hasMethods: boolean
  isSelected?: boolean
  onToggleSelect?: (date: string) => void
  /** false when the Vault is enabled but some participant hasn't set their key yet */
  vaultReady?: boolean
  /** false for Accountant / custom "payout"-permission roles — records view only, no initiating */
  canInitiate?: boolean
}

function TxnCard({ txn, payoutStatus, payoutReference, payoutRecord, eventName, onPayout, onReopen, onAddMethod, hasMethods, isSelected, onToggleSelect, vaultReady = true, canInitiate = true }: TxnCardProps) {
  const [showReceipt, setShowReceipt] = useState(false)
  const canWithdraw = isWithdrawable(txn.updatedAt) && vaultReady
  const timeLeft = timeUntilWithdrawable(txn.updatedAt)
  const progress = unlockProgress(txn.updatedAt)
  const badge = payoutStatus ? (STATUS_BADGE[payoutStatus] ?? STATUS_BADGE.pending) : null
  // A "failed" payout is a dead end, not a reservation — the date is free
  // to request again (server enforces the same rule; see
  // hasActiveOrSuccessfulPayout in lib/payout-db.ts). Every other status
  // (initializing/processing/successful/vault_pending) blocks a new
  // request for this date.
  const blockingStatus = Boolean(payoutStatus) && payoutStatus !== "failed"
  const isEligibleForBulk = !blockingStatus && canWithdraw && canInitiate
  // Still in flight and we know its Supabase reference — vault_pending has
  // no reference yet (no Supabase row exists until it's released), so only
  // initializing/processing are reopenable.
  const isReopenable =
    blockingStatus && (payoutStatus === "initializing" || payoutStatus === "processing") && Boolean(payoutReference)

  return (
    <div className={`bg-white border rounded-xl p-5 hover:shadow-md transition-all space-y-4 ${
      isSelected && isEligibleForBulk
        ? "border-[#6b2fa5] bg-purple-50/30"
        : "border-gray-200"
    }`}>
      {/* Top row */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="space-y-1.5 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {isEligibleForBulk && onToggleSelect && (
              <input
                type="checkbox"
                checked={isSelected ?? false}
                onChange={() => onToggleSelect(txn.date)}
                className="w-4 h-4 rounded border-gray-300 accent-[#6b2fa5] cursor-pointer"
              />
            )}
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

            {/* Ready badge — only when no active/successful payout exists and lock cleared */}
            {!blockingStatus && canWithdraw && (
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
          {blockingStatus ? (
            // An active or successful payout record exists — show status chip.
            // If it's still in flight and we have its reference, clicking
            // reopens the live progress dialog instead of doing nothing.
            <button
              onClick={isReopenable ? () => onReopen(payoutReference as string) : undefined}
              disabled={!isReopenable}
              title={isReopenable ? "View live payout progress" : undefined}
              className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 ${
                isReopenable ? "cursor-pointer hover:opacity-80" : "cursor-not-allowed"
              } ${
                badge ? `${badge.bg} ${badge.text}` : "bg-gray-100 text-gray-500"
              }`}
            >
              {badge?.icon}
              {badge?.label ?? payoutStatus}
            </button>
          ) : !canInitiate ? (
            // Accountant / custom "payout"-permission roles — can see this
            // record exists but can't initiate a payout themselves.
            <button
              disabled
              title="You can't initiate payouts on this event"
              className="px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 bg-gray-100 text-gray-400 cursor-not-allowed"
            >
              <Eye size={14} /> View Only
            </button>
          ) : (
            // No payout yet — payout / locked button
            <button
              onClick={() => {
                if (!hasMethods) { onAddMethod(); return }
                if (canWithdraw) onPayout(txn)
              }}
              disabled={!canWithdraw}
              title={!vaultReady && isWithdrawable(txn.updatedAt) ? "Blocked: not every Vault participant has set their Vault Key yet" : undefined}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 ${
                canWithdraw
                  ? "bg-[#6b2fa5] text-white hover:bg-[#5a2589] shadow-sm"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
            >
              {canWithdraw ? (
                <>Payout <ChevronRight size={14} /></>
              ) : !vaultReady && isWithdrawable(txn.updatedAt) ? (
                <><Lock size={14} /> Vault Not Ready</>
              ) : (
                <><Clock size={14} /> Processing</>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Receipt — only once this date's payout has actually gone through */}
      {payoutStatus === "successful" && payoutRecord && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowReceipt(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-purple-50 text-[#6b2fa5] border border-purple-200 hover:bg-purple-100 transition-colors"
          >
            <ReceiptText size={13} />
            View Receipt
          </button>
        </div>
      )}

      {showReceipt && payoutRecord && (
        <ReceiptModal
          data={displayRecordToReceipt(payoutRecord, eventName)}
          onClose={() => setShowReceipt(false)}
        />
      )}

      {/* Countdown + progress bar — only when not submitted and still locked */}
      {!blockingStatus && !canWithdraw && txn.updatedAt && (
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
  isOwner,
  collabRole,
  organizerId,
  initialView,
  onViewChange,
}: PayoutsTabProps) {
  const [transactions, setTransactions] = useState<DailyTransaction[]>([])
  const [txnLoading, setTxnLoading] = useState(true)
  const [txnError, setTxnError] = useState<string | null>(null)

  const [methods, setMethods] = useState<PayoutMethod[]>([])
  const [methodsLoading, setMethodsLoading] = useState(true)
  const [methodsError, setMethodsError] = useState<string | null>(null)
  const [methodsReadOnly, setMethodsReadOnly] = useState(false)

  // date → payout status, seeded from the status API on mount
  const [payoutStatuses, setPayoutStatuses] = useState<Record<string, string>>({})
  // date → Supabase payout reference, so an in-flight badge can reopen the
  // live dialog. Populated from the status fetch and from fresh submissions.
  const [payoutRefs, setPayoutRefs] = useState<Record<string, string>>({})
  // date → full merged payout record, so TxnCard can render a receipt
  // without a second fetch — same shape/source as payout-log.tsx uses.
  const [payoutRecords, setPayoutRecords] = useState<Record<string, DisplayRecord>>({})

  // Vault readiness — reported up by VaultPanel. Payouts are blocked for
  // every date on this event until every assigned Vault participant
  // (Creator included) has set their Vault Key.
  const [vaultStatus, setVaultStatus] = useState<{ enabledVault: boolean; ready: boolean; missing: { uid: string; email: string }[] }>({
    enabledVault: false,
    ready: true,
    missing: [],
  })
  const handleVaultStatusChange = useCallback(
    (status: { enabledVault: boolean; ready: boolean; missing: { uid: string; email: string }[] }) => {
      setVaultStatus(status)
    },
    []
  )

  // "Enter your own Vault Key now" prompt — shown right after the current
  // user's own payout request comes back vault-locked. Only meaningful for
  // roles that can actually be Vault participants (Creator/Admin — see
  // /api/payout/vault addParticipant, which only accepts admin collaborators).
  const [vaultKeyPrompt, setVaultKeyPrompt] = useState<{ holdIds: string[]; amount: number; dates: string[] } | null>(null)
  // Bumped whenever the requester enters their key immediately, to force
  // VaultSignoffs (the "awaiting your sign-off" section up top) to refetch.
  const [vaultSignoffsRefreshKey, setVaultSignoffsRefreshKey] = useState(0)

  // Live payout dialog — opened the moment a non-Vault payout begins, or
  // the moment a Vault-locked one is released by the last sign-off.
  const [liveReferences, setLiveReferences] = useState<string[] | null>(null)

  const [activeView, setActiveViewState] = useState<ActiveView>(initialView ?? "transactions")
  const setActiveView = (view: ActiveView) => {
    setActiveViewState(view)
    onViewChange?.(view)
  }
  const router = useRouter()
  const { user } = useAuth()
  const { isVerified: bvtVerified, loading: bvtLoading } = useBVTStatus()

  // Same KYC/BVT gate as the poll and election payout flows — see
  // hooks/useBVTStatus.ts. Blocks initiating a withdrawal (viewing the
  // Payouts tab itself is still fine) until the booker is verified.
  function requireBVTOrRedirect(): boolean {
    if (bvtLoading) return false
    if (!bvtVerified) {
      toast.warning("Verification required", { description: "Complete KYC in the verification page to access withdrawals." })
      router.push("/verification")
      return false
    }
    return true
  }
  const [dialogTxn, setDialogTxn] = useState<DailyTransaction | null>(null)
  const [payoutError, setPayoutError] = useState<PayoutError | null>(null)
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())
  const [isBulkPayoutLoading, setIsBulkPayoutLoading] = useState(false)
  const [bulkPayoutTxns, setBulkPayoutTxns] = useState<DailyTransaction[]>([])

  // Export Report — computed and downloaded entirely client-side, unlike
  // the Attendee Post Mortem (nothing is generated or stored server-side).
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [exportingFormat, setExportingFormat] = useState<"csv" | "pdf" | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const exportMenuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [])

  // Own vs Creator's payout methods (spec §4 Role Permissions) — Creator and
  // Admin manage/settle to their own methods; Accountant and custom "payout"
  // roles always settle to the Creator's methods and can't edit them here.
  const canManageOwnMethods = isOwner || collabRole === "admin"

  // Who may actually INITIATE a payout (spec §4 Role Permissions) — Creator
  // and Admin only. Accountant and custom roles with the "payout" permission
  // can still view this whole tab and every payout record on it, but the
  // request itself is locked to them — mirrors the POST /api/payout gate.
  const canInitiatePayout = isOwner || collabRole === "admin"

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

  // Seeds the payoutStatuses map from Supabase payout records + any
  // still-open Vault holds (which live separately in Firestore — see
  // lib/payout-firestore.ts). Reuses the same merged fetch payout-log.tsx
  // uses (see payout-log-data.ts) instead of a bespoke lighter one, so
  // TxnCard also gets the full record (bank, resolvedAt, etc.) needed for
  // "View Receipt" at no extra request cost. Runs silently — a failure
  // here doesn't block the UI.
  const fetchPayoutStatuses = useCallback(async () => {
    try {
      const merged = await fetchPayoutLogRecords(eventId)

      const map: Record<string, string> = {}
      const refMap: Record<string, string> = {}
      const recordMap: Record<string, DisplayRecord> = {}

      // Vault holds first, then payout records override them for the same
      // date — a released hold graduates into a payout row, which should
      // win.
      merged.filter((r) => r.source === "vaultHold").forEach((h) => { map[h.date] = "vault_pending" })
      merged.filter((r) => r.source === "payout").forEach((r) => {
        map[r.date] = r.status
        refMap[r.date] = r.id
        recordMap[r.date] = r
      })

      setPayoutStatuses(map)
      setPayoutRefs((prev) => ({ ...prev, ...refMap }))
      setPayoutRecords(recordMap)
    } catch {
      // Non-critical — button just stays visible until next load
    }
  }, [eventId])

  const fetchMethods = useCallback(async () => {
    try {
      setMethodsLoading(true)
      setMethodsError(null)
      const res = await fetch(`/api/payout/method?eventId=${eventId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to fetch payout methods")
      setMethods(data.methods ?? [])
      setMethodsReadOnly(Boolean(data.readOnly))
    } catch (err: any) {
      setMethodsError(err.message || "Failed to load payout methods")
    } finally {
      setMethodsLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    fetchTransactions()
    fetchPayoutStatuses()
    fetchMethods()
  }, [fetchTransactions, fetchPayoutStatuses, fetchMethods])

  // Ready count excludes dates that already have an active or successful
  // payout record — a "failed" one doesn't block a fresh request.
  const readyCount = transactions.filter(
    (t) => isWithdrawable(t.updatedAt) && (!payoutStatuses[t.date] || payoutStatuses[t.date] === "failed")
  ).length

  // Non-Vault payout — already began the moment POST /api/payout returned.
  // Open the live dialog immediately; the "pending" optimistic status text
  // used to show here is gone since the real status now streams live.
  function handlePayoutSuccess(date: string, references: string[]) {
    setPayoutStatuses((prev) => ({ ...prev, [date]: "initializing" }))
    if (references[0]) setPayoutRefs((prev) => ({ ...prev, [date]: references[0] }))
    if (references.length) setLiveReferences(references)
  }

  function handleVaultLocked(dates: string[], holdIds: string[], totalAmount: number) {
    dates.forEach((date) => {
      setPayoutStatuses((prev) => ({ ...prev, [date]: "vault_pending" }))
    })
    if (canManageOwnMethods && holdIds.length) {
      setVaultKeyPrompt({ holdIds, amount: totalAmount, dates })
    }
  }

  function handlePayoutError(rawMessage: string, txnDate: string) {
    setPayoutError(classifyPayoutError(rawMessage, txnDate))
  }

  function handleBulkPayoutClick() {
    if (selectedDates.size === 0) return
    if (!requireBVTOrRedirect()) return
    const txnsToProcess = transactions.filter((t) => selectedDates.has(t.date))
    setBulkPayoutTxns(txnsToProcess)
    setDialogTxn(null) // Clear single transaction if any
  }

  function handleBulkPayoutSuccess(dates: string[], references: string[]) {
    dates.forEach((date, i) => {
      setPayoutStatuses((prev) => ({ ...prev, [date]: "initializing" }))
      if (references[i]) setPayoutRefs((prev) => ({ ...prev, [date]: references[i] }))
    })
    setSelectedDates(new Set())
    setBulkPayoutTxns([])
    if (references.length) setLiveReferences(references)
  }

  function handleBulkVaultLocked(dates: string[], holdIds: string[], totalAmount: number) {
    dates.forEach((date) => {
      setPayoutStatuses((prev) => ({ ...prev, [date]: "vault_pending" }))
    })
    setSelectedDates(new Set())
    setBulkPayoutTxns([])
    if (canManageOwnMethods && holdIds.length) {
      setVaultKeyPrompt({ holdIds, amount: totalAmount, dates })
    }
  }

  // Called once the requester submits their own Vault Key immediately from
  // vault-key-enter.tsx's "Enter Now" path. If that submission happened to
  // be the last one needed, releasedReferences carries the freshly-created
  // Supabase reference(s) — open the live dialog right away.
  function handleVaultKeyEntered(releasedReferences: string[]) {
    fetchPayoutStatuses()
    setVaultSignoffsRefreshKey((k) => k + 1)
    if (releasedReferences.length) setLiveReferences(releasedReferences)
  }

  // Called from VaultSignoffs when ANOTHER participant's sign-off is the
  // one that released the payout — the person watching this tab (who may
  // not be the original requester) still deserves to see it go live.
  function handleVaultSignoffResolved(releasedReference?: string) {
    fetchPayoutStatuses()
    if (releasedReference) setLiveReferences([releasedReference])
  }

  // Fires on every live SSE event for any reference currently shown in the
  // dialog — mirrors that status onto the Transaction Days list instantly,
  // so a card resolving to successful/failed shows up there without the
  // person needing to refresh or even keep the dialog open.
  function handleLiveStatusChange(state: PayoutLiveState) {
    setPayoutStatuses((prev) => {
      const date = Object.keys(payoutRefs).find((d) => payoutRefs[d] === state.reference)
      if (!date || prev[date] === state.status) return prev
      return { ...prev, [date]: state.status }
    })
  }

  function handleReopenPayout(reference: string) {
    setLiveReferences([reference])
  }

  /**
   * Export Report — pulls together data the tab already has (transactions,
   * payoutStatuses) plus one fresh fetch of the merged payout log timeline
   * (same source PayoutLog uses — see lib/payout-log-data.ts), then builds
   * the file entirely in the browser and triggers an immediate download.
   * Nothing is uploaded or stored anywhere; re-opening this menu just
   * recomputes from current data.
   */
  const handleExport = async (format: "csv" | "pdf") => {
    setExportMenuOpen(false)
    setExportingFormat(format)
    setExportError(null)
    try {
      const records = await fetchPayoutLogRecords(eventId)
      const totals = { totalRevenue, availableRevenue, paidAmount }
      const meta = {
        eventName: eventData?.eventName || "Event",
        eventId,
        generatedByName: user?.fullName || user?.email || "Organizer",
      }
      const fileBase = `spotix_payouts_${eventId}`

      if (format === "csv") {
        const csv = buildPayoutCsv(transactions, payoutStatuses, records, totals, meta)
        triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8;" }), `${fileBase}.csv`)
      } else {
        const blob = await buildPayoutPdfBlob(transactions, payoutStatuses, records, totals, meta)
        triggerDownload(blob, `${fileBase}.pdf`)
      }
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed")
    } finally {
      setExportingFormat(null)
    }
  }

  function triggerDownload(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Live payout progress — SSE-backed, survives closing/reopening */}
      {liveReferences && (
        <PayoutStateDialog references={liveReferences} onClose={() => setLiveReferences(null)} onStatusChange={handleLiveStatusChange} />
      )}

      {/* Payout Confirmation Dialog */}
      {(dialogTxn || bulkPayoutTxns.length > 0) && (
        <PayoutConfirmation
          txns={bulkPayoutTxns.length > 0 ? bulkPayoutTxns : dialogTxn!}
          methods={methods}
          eventId={eventId}
          onSuccess={(references) => {
            if (bulkPayoutTxns.length > 0) {
              handleBulkPayoutSuccess(bulkPayoutTxns.map((t) => t.date), references)
            } else if (dialogTxn) {
              handlePayoutSuccess(dialogTxn.date, references)
            }
          }}
          onVaultLocked={(dates, holdIds, totalAmount) => {
            if (bulkPayoutTxns.length > 0) {
              handleBulkVaultLocked(dates, holdIds, totalAmount)
            } else if (dialogTxn) {
              handleVaultLocked(dates, holdIds, totalAmount)
            }
          }}
          onError={(msg) => {
            if (bulkPayoutTxns.length > 0) {
              setPayoutError({
                kind: "generic",
                reason: msg,
              })
            } else if (dialogTxn) {
              handlePayoutError(msg, dialogTxn.date)
            }
          }}
          onClose={() => {
            setDialogTxn(null)
            setBulkPayoutTxns([])
          }}
        />
      )}

      {/* "Enter your OWN Vault Key" — bottom-sheet shown right after the
          requester's own payout request comes back vault-locked */}
      {vaultKeyPrompt && (
        <VaultKeyEnterOnPayoutDialog
          holdIds={vaultKeyPrompt.holdIds}
          amount={vaultKeyPrompt.amount}
          dates={vaultKeyPrompt.dates}
          onClose={() => setVaultKeyPrompt(null)}
          onEntered={handleVaultKeyEntered}
        />
      )}

      {/* Vault — sign-offs needed from the current user take priority visibility */}
      <VaultSignoffs
        key={vaultSignoffsRefreshKey}
        eventId={eventId}
        currentUserId={currentUserId}
        onResolved={handleVaultSignoffResolved}
      />

      {/* Export Report — CSV or a branded PDF, computed client-side */}
      <div className="flex justify-end">
        <div className="relative" ref={exportMenuRef}>
          <button
            onClick={() => setExportMenuOpen((v) => !v)}
            disabled={txnLoading || exportingFormat !== null}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#6b2fa5] text-white font-semibold text-sm rounded-xl shadow-lg shadow-[#6b2fa5]/25 hover:bg-[#5a2690] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exportingFormat ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            Export Report
            <ChevronDown size={14} className={`transition-transform ${exportMenuOpen ? "rotate-180" : ""}`} />
          </button>

          {exportMenuOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl border-2 border-gray-200 shadow-xl z-20 overflow-hidden">
              <button
                onClick={() => handleExport("pdf")}
                className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[#6b2fa5]/5 transition-colors"
              >
                <FileText size={18} className="text-[#6b2fa5] flex-shrink-0 mt-0.5" />
                <span>
                  <span className="block text-sm font-semibold text-gray-900">PDF Report</span>
                  <span className="block text-xs text-gray-500">Branded summary — transaction days &amp; payout logs</span>
                </span>
              </button>
              <div className="border-t border-gray-100" />
              <button
                onClick={() => handleExport("csv")}
                className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[#6b2fa5]/5 transition-colors"
              >
                <FileSpreadsheet size={18} className="text-[#6b2fa5] flex-shrink-0 mt-0.5" />
                <span>
                  <span className="block text-sm font-semibold text-gray-900">CSV</span>
                  <span className="block text-xs text-gray-500">Raw data for spreadsheets</span>
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {exportError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3">
          <AlertCircle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-700">Export failed</p>
            <p className="text-sm text-red-600 mt-0.5">{exportError}</p>
          </div>
          <button onClick={() => setExportError(null)} className="text-red-400 hover:text-red-600 flex-shrink-0">
            <X size={16} />
          </button>
        </div>
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

      {/* View-only notice for Accountant / custom "payout"-permission roles */}
      {!canInitiatePayout && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex gap-3">
          <Eye size={18} className="text-gray-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-gray-600 leading-relaxed">
            You can view every payout record on this event, but only the Event Creator or an
            Admin can initiate a payout.
          </p>
        </div>
      )}

      {/* Burden of Fee notice — only shown when this organizer is absorbing
          at least one of the two fees (see Overview tab → gear icon). */}
      {(() => {
        const fb = eventData?.feeBurden && typeof eventData.feeBurden === "object"
          ? { coversPaystackFee: eventData.feeBurden.coversPaystackFee === true, coversSpotixFee: eventData.feeBurden.coversSpotixFee === true }
          : { coversPaystackFee: false, coversSpotixFee: eventData?.buyerBearsBurden === false }
        if (!fb.coversPaystackFee && !fb.coversSpotixFee) return null

        const message = fb.coversPaystackFee && fb.coversSpotixFee
          ? "You're the one paying the platform fees, it's coming out of your revenue."
          : fb.coversSpotixFee
          ? "You're covering Spotix's platform fee — it's coming out of your revenue. Attendees still cover Paystack's processing fee."
          : "You're covering Paystack's processing fee — it's coming out of your revenue. Attendees still cover Spotix's platform fee."

        return (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
            <AlertCircle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800 leading-relaxed">
              {message}{" "}
              <a href="#" className="font-semibold underline hover:text-amber-900">
                Learn more
              </a>
            </p>
          </div>
        )
      })()}

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
                <MaskedAmount value={`₦${totalRevenue.toLocaleString()}`} size="lg" className="text-gray-900" />
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
                <MaskedAmount value={`₦${availableRevenue.toLocaleString()}`} size="lg" className="text-[#6b2fa5]" />
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

      {/* The Vault — settings, participants, key setup */}
      <VaultPanel eventId={eventId} isOwner={isOwner} currentUserId={currentUserId} onStatusChange={handleVaultStatusChange} />

      {vaultStatus.enabledVault && !vaultStatus.ready && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex gap-3">
          <Lock size={18} className="text-[#6b2fa5] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-purple-900">
              Payouts are blocked until every Vault participant sets their Vault Key
            </p>
            <p className="text-xs text-purple-700 mt-0.5">
              Waiting on:{" "}
              {vaultStatus.missing
                .map((m) => (m.uid === currentUserId ? "You" : m.email))
                .join(", ")}
            </p>
          </div>
        </div>
      )}

      {/* ── View Toggle ───────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto overflow-y-hidden">
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
            <SkeletonRows count={5} rowClassName="h-24" />
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
            <div className="space-y-4">
              {/* Bulk payout checklist banner — initiators only */}
              {methods.length > 0 && canInitiatePayout && (
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-purple-900">Bulk Payout</p>
                    <p className="text-xs text-purple-700 mt-0.5">
                      Select multiple available days to pay into your primary account at once
                    </p>
                  </div>
                  <button
                    onClick={handleBulkPayoutClick}
                    disabled={selectedDates.size === 0}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors flex items-center gap-2 ${
                      selectedDates.size > 0
                        ? "bg-[#6b2fa5] text-white hover:bg-[#5a2589]"
                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    Payout {selectedDates.size > 0 ? `(${selectedDates.size})` : ""}
                  </button>
                </div>
              )}

              {transactions.map((txn) => (
                <TxnCard
                  key={txn.date}
                  txn={txn}
                  payoutStatus={payoutStatuses[txn.date] ?? null}
                  payoutReference={payoutRefs[txn.date] ?? null}
                  payoutRecord={payoutRecords[txn.date] ?? null}
                  eventName={eventData?.eventName ?? ""}
                  hasMethods={methods.length > 0}
                  onPayout={(t) => { if (requireBVTOrRedirect()) setDialogTxn(t) }}
                  onReopen={handleReopenPayout}
                  onAddMethod={() => setActiveView("methods")}
                  vaultReady={vaultStatus.ready}
                  canInitiate={canInitiatePayout}
                  isSelected={selectedDates.has(txn.date)}
                  onToggleSelect={(date) => {
                    const newSelected = new Set(selectedDates)
                    if (newSelected.has(date)) {
                      newSelected.delete(date)
                    } else {
                      newSelected.add(date)
                    }
                    setSelectedDates(newSelected)
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

    
      {activeView === "logs" && (
        <PayoutLog
          eventId={eventId}
          userId={userId}
          eventName={eventData?.eventName ?? ""}
          canManage={isOwner || collabRole === "admin"}
          onCancelled={() => {
            // A cancel or reject just happened — that payout's status moved
            // off "vault_pending" (if it was there at all), so refresh both
            // the Transactions view's status map and force VaultSignoffs to
            // refetch so a rejected/cancelled payout instantly disappears
            // from the "awaiting your Vault sign-off" panel and no other
            // Admin can submit a key against it.
            fetchPayoutStatuses()
            setVaultSignoffsRefreshKey((k) => k + 1)
          }}
        />
      )}

     
      {activeView === "methods" && (
        <ViewPayoutMethods
          methods={methods}
          loading={methodsLoading}
          error={methodsError}
          onRefresh={fetchMethods}
          onAddNew={() => router.push("/integrations")}
          readOnly={methodsReadOnly || !canManageOwnMethods}
          readOnlyNote={
            methodsReadOnly || !canManageOwnMethods
              ? "These are the event creator's payout methods. Payouts you initiate on this event settle here — only the creator can add, edit, or remove them."
              : undefined
          }
        />
      )}
    </div>
  )
}
