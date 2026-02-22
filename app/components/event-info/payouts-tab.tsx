"use client"
import { AlertCircle, Wallet, Calendar, Loader2, CheckCircle } from "lucide-react"
import { useState, useEffect } from "react"

interface DailyTransaction {
  date: string // YYYY-MM-DD
  eventName: string
  ticketCount: number
  ticketSales: number
  lastPurchaseTime: string
  createdAt: string
  updatedAt: string
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

function isWithdrawable(updatedAt: string): boolean {
  if (!updatedAt) return false
  const lastPurchase = new Date(updatedAt)
  const now = new Date()
  const diffMs = now.getTime() - lastPurchase.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  return diffDays >= 2
}

function timeUntilWithdrawable(updatedAt: string): string {
  if (!updatedAt) return ""
  const lastPurchase = new Date(updatedAt)
  const unlockTime = new Date(lastPurchase.getTime() + 2 * 24 * 60 * 60 * 1000)
  const now = new Date()
  const diffMs = unlockTime.getTime() - now.getTime()
  if (diffMs <= 0) return ""
  const hours = Math.floor(diffMs / (1000 * 60 * 60))
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    const remHours = hours % 24
    return `Available in ${days}d ${remHours}h`
  }
  return `Available in ${hours}h ${minutes}m`
}

export default function PayoutsTab({
  availableBalance,
  eventData,
  userId,
  eventId,
  currentUserId,
  attendees,
  payId,
}: PayoutsTabProps) {
  const [transactions, setTransactions] = useState<DailyTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [withdrawing, setWithdrawing] = useState<string | null>(null)
  const [withdrawn, setWithdrawn] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const ticketsSold = attendees.length
  const platformFee = eventData?.isFree ? 0 : availableBalance * 0.05 + ticketsSold * 100
  const payableAmount = eventData?.isFree ? 0 : availableBalance - platformFee

  useEffect(() => {
    if (eventId) {
      fetchTransactions()
    }
  }, [eventId])

  const fetchTransactions = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`/api/payout?eventId=${eventId}`)
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to fetch transactions")
      }
      const data = await res.json()
      setTransactions(data.transactions || [])
    } catch (err: any) {
      console.error("Error fetching transactions:", err)
      setError(err.message || "Failed to load transaction data")
    } finally {
      setLoading(false)
    }
  }

  const handleWithdraw = async (txn: DailyTransaction) => {
    if (!payId) {
      setError("No payId configured for this event. Contact support.")
      return
    }

    setWithdrawing(txn.date)
    setError(null)

    try {
      const res = await fetch("/api/payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payId,
          eventId,
          date: txn.date,
          ticketCount: txn.ticketCount,
          ticketSales: txn.ticketSales,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Withdrawal request failed")
      }

      setWithdrawn((prev) => new Set([...prev, txn.date]))
    } catch (err: any) {
      console.error("Withdraw error:", err)
      setError(err.message || "An error occurred during withdrawal")
    } finally {
      setWithdrawing(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Info Alert */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
        <AlertCircle size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-blue-700">
          Payouts are available per transaction day. Withdrawals can only be requested 2 days after the last ticket
          purchase on that day. The payable amount excludes our platform fee of 5% + ₦100 per ticket sold.
        </p>
      </div>

      {/* Balance Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-purple-200 p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-purple-100 rounded-lg">
              <Wallet size={24} className="text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600 font-medium">Available Balance</p>
              <p className="text-2xl font-bold text-gray-900">₦{availableBalance.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-green-200 p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-green-100 rounded-lg">
              <Wallet size={24} className="text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600 font-medium">Payable Amount</p>
              <p className="text-2xl font-bold text-green-600">₦{payableAmount.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
          <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Transaction Dates */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Calendar size={20} className="text-purple-600" />
          Transaction Days
        </h3>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={32} className="animate-spin text-purple-600" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
            <Calendar size={40} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No transactions yet</p>
            <p className="text-sm text-gray-400 mt-1">Transaction records will appear here once tickets are sold.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.map((txn) => {
              const canWithdraw = isWithdrawable(txn.updatedAt)
              const alreadyWithdrawn = withdrawn.has(txn.date)
              const isProcessing = withdrawing === txn.date
              const timeLeft = !canWithdraw ? timeUntilWithdrawable(txn.updatedAt) : ""

              return (
                <div
                  key={txn.date}
                  className="bg-white border border-gray-200 rounded-lg p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 text-base">{txn.date}</span>
                      {alreadyWithdrawn && (
                        <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                          <CheckCircle size={12} /> Submitted
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                      <span>
                        <span className="font-medium text-gray-700">{txn.ticketCount}</span> ticket
                        {txn.ticketCount !== 1 ? "s" : ""} sold
                      </span>
                      <span>
                        Total Sales:{" "}
                        <span className="font-medium text-gray-700">₦{Number(txn.ticketSales).toLocaleString()}</span>
                      </span>
                    </div>
                    {!canWithdraw && !alreadyWithdrawn && timeLeft && (
                      <p className="text-xs text-amber-600 font-medium">{timeLeft}</p>
                    )}
                  </div>

                  <div className="flex-shrink-0">
                    {alreadyWithdrawn ? (
                      <button
                        disabled
                        className="px-5 py-2 rounded-lg text-sm font-medium bg-green-100 text-green-700 cursor-not-allowed flex items-center gap-2"
                      >
                        <CheckCircle size={16} />
                        Withdrawal Requested
                      </button>
                    ) : (
                      <button
                        onClick={() => handleWithdraw(txn)}
                        disabled={!canWithdraw || isProcessing}
                        className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                          canWithdraw && !isProcessing
                            ? "bg-[#6b2fa5] text-white hover:bg-[#5a2589]"
                            : "bg-gray-100 text-gray-400 cursor-not-allowed"
                        }`}
                      >
                        {isProcessing ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            Processing...
                          </>
                        ) : (
                          "Withdraw"
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}