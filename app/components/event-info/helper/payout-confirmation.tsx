"use client"

import { X, Loader2, AlertCircle } from "lucide-react"
import { useState } from "react"

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

interface PayoutConfirmationProps {
  txn: DailyTransaction
  methods: PayoutMethod[]
  eventId: string
  onSuccess: (date: string) => void
  onError: (message: string) => void
  onClose: () => void
}

export default function PayoutConfirmation({
  txn,
  methods,
  eventId,
  onSuccess,
  onError,
  onClose,
}: PayoutConfirmationProps) {
  const primaryMethod = methods.find((m) => m.primary) ?? null
  const [selectedMethodId, setSelectedMethodId] = useState<string>(primaryMethod?.id ?? "")
  const [processing, setProcessing] = useState(false)

  const selectedMethod = methods.find((m) => m.id === selectedMethodId) ?? null

  async function handleConfirm() {
    if (!selectedMethod) return
    setProcessing(true)
    try {
      const res = await fetch("/api/payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          date: txn.date,
          amount: txn.ticketSales,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        // Close dialog first so error surfaces on the parent tab
        onClose()
        onError(data.error || "Payout request failed")
        return
      }
      onSuccess(txn.date)
      onClose()
    } catch {
      onClose()
      onError("A network error occurred. Please try again.")
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(4px)",
        padding: "0 16px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !processing) onClose()
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Request Payout</h3>
          <button
            onClick={onClose}
            disabled={processing}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg transition-colors disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        {/* Transaction Summary */}
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-1">
          <p className="text-xs text-purple-600 font-semibold uppercase tracking-wider">
            Transaction Day
          </p>
          <p className="text-xl font-bold text-gray-900">{txn.date}</p>
          <div className="flex gap-4 text-sm text-gray-600 pt-1">
            <span>
              <span className="font-semibold text-gray-800">{txn.ticketCount}</span>{" "}
              ticket{txn.ticketCount !== 1 ? "s" : ""}
            </span>
            <span>
              Amount:{" "}
              <span className="font-semibold text-gray-800">
                ₦{Number(txn.ticketSales).toLocaleString()}
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
                        <span className="text-xs bg-[#6b2fa5] text-white px-1.5 py-0.5 rounded-full font-medium">
                          Primary
                        </span>
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

        {/* Actions */}
        <div className="flex gap-3 pt-1">
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
      </div>
    </div>
  )
}