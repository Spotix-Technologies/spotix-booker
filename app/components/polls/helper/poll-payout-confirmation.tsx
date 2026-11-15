"use client"

import ResponsiveSheet from "@/components/ui/responsive-sheet"
import { Loader2, AlertCircle, Star } from "lucide-react"
import { useState, useRef } from "react"

interface DailyVoteTransaction {
  date: string
  pollName?: string
  voteCount: number
  voteSales: number
  lastVoteTime?: string
  createdAt?: string
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

interface PollPayoutConfirmationProps {
  txns: DailyVoteTransaction | DailyVoteTransaction[]
  methods: PayoutMethod[]
  pollId: string
  /** Opens the live PayoutStateDialog with these references. */
  onSuccess: (references: string[]) => void
  onError: (message: string) => void
  onClose: () => void
}

export default function PollPayoutConfirmation({
  txns,
  methods,
  pollId,
  onSuccess,
  onError,
  onClose,
}: PollPayoutConfirmationProps) {
  const transactions = Array.isArray(txns) ? txns : [txns]
  const primaryMethod = methods.find((m) => m.primary) ?? null
  const [selectedMethodId, setSelectedMethodId] = useState<string>(primaryMethod?.id ?? "")
  const [processing, setProcessing] = useState(false)

  const selectedMethod = methods.find((m) => m.id === selectedMethodId) ?? null
  const totalAmount = transactions.reduce((sum, t) => sum + t.voteSales, 0)
  const totalVotes = transactions.reduce((sum, t) => sum + t.voteCount, 0)
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID())

  async function handleConfirm() {
    if (!selectedMethod) return
    setProcessing(true)
    const references: string[] = []

    try {
      for (const txn of transactions) {
        const res = await fetch("/api/polls/payout", {
          method: "POST",
          // See event-side payout-confirmation.tsx for why this is scoped
          // per-date rather than one key for the whole batch.
          headers: { "Content-Type": "application/json", "Idempotency-Key": `${idempotencyKeyRef.current}:${txn.date}` },
          body: JSON.stringify({
            pollId,
            date: txn.date,
            amount: txn.voteSales,
            methodId: selectedMethodId,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          onClose()
          onError(data.error || "Payout request failed")
          return
        }
        if (data.reference) references.push(data.reference)
      }
      onSuccess(references)
      onClose()
    } catch {
      onClose()
      onError("A network error occurred. Please try again.")
    } finally {
      setProcessing(false)
    }
  }

  return (
    <ResponsiveSheet
      open
      onClose={onClose}
      dismissible={!processing}
      size="md"
      zIndex={70}
      title="Request Payout"
      footer={
        <div className="flex flex-col-reverse sm:flex-row gap-3">
          <button
            onClick={onClose}
            disabled={processing}
            className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedMethod || processing}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
              selectedMethod && !processing
                ? "bg-[#6b2fa5] text-white hover:bg-[#5a2589]"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
          >
            {processing ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Processing...
              </>
            ) : (
              "Confirm Payout"
            )}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Transaction Summary */}
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-2">
          <p className="text-xs text-purple-600 font-semibold uppercase tracking-wider">
            {transactions.length === 1 ? "Transaction Day" : "Transaction Days"}
          </p>
          <div className="space-y-1">
            {transactions.length === 1 ? (
              <p className="text-xl font-bold text-gray-900">{transactions[0].date}</p>
            ) : (
              <div className="space-y-0.5">
                {transactions.map((t) => (
                  <p key={t.date} className="text-base font-semibold text-gray-900">
                    {t.date}
                  </p>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-4 text-sm text-gray-600 pt-1">
            <span>
              <span className="font-semibold text-gray-800">{totalVotes}</span>{" "}
              vote{totalVotes !== 1 ? "s" : ""}
            </span>
            <span>
              Total:{" "}
              <span className="font-semibold text-gray-800">
                ₦{Number(totalAmount).toLocaleString()}
              </span>
            </span>
          </div>
        </div>

        {/* Bank Selection */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-700">Settle to</p>
          {methods.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
              <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-700">
                No payout methods found. Add a bank account first.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {methods.map((method) => (
                <label
                  key={method.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    selectedMethodId === method.id
                      ? "border-[#6b2fa5] bg-purple-50 shadow-sm"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="payoutMethod"
                    value={method.id}
                    checked={selectedMethodId === method.id}
                    onChange={() => setSelectedMethodId(method.id)}
                    className="accent-[#6b2fa5]"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {method.bankName}
                      </p>
                      {method.primary && (
                        <Star size={14} fill="#6b2fa5" className="text-[#6b2fa5] flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      {method.accountName} · •••• {method.accountNumber.slice(-4)}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
    </ResponsiveSheet>
  )
}
