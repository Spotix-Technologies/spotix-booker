"use client"

import { useState } from "react"
import { Loader2, Star, StarOff, Trash2, Pencil, CheckCircle, AlertCircle, CreditCard } from "lucide-react"

interface PayoutMethod {
  id: string
  accountNumber: string
  bankName: string
  bankCode: string
  accountName: string
  primary: boolean
  createdAt: string
}

interface ViewPayoutMethodsProps {
  methods: PayoutMethod[]
  loading: boolean
  error: string | null
  onRefresh: () => void
  onAddNew: () => void
}

export default function ViewPayoutMethods({
  methods,
  loading,
  error,
  onRefresh,
  onAddNew,
}: ViewPayoutMethodsProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [localMethods, setLocalMethods] = useState<PayoutMethod[]>(methods)

  // Sync when parent refreshes
  useState(() => {
    setLocalMethods(methods)
  })

  const handleSetPrimary = async (method: PayoutMethod) => {
    if (method.primary) return
    setActionLoading(`primary-${method.id}`)
    setActionError(null)
    try {
      const res = await fetch("/api/payout/method", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setPrimary", methodId: method.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to set primary")
      setLocalMethods((prev) =>
        prev.map((m) => ({ ...m, primary: m.id === method.id }))
      )
    } catch (err: any) {
      setActionError(err.message || "Failed to update primary method")
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async (method: PayoutMethod) => {
    if (!confirm(`Delete ${method.bankName} account ending in ${method.accountNumber.slice(-4)}?`)) return
    setActionLoading(`delete-${method.id}`)
    setActionError(null)
    try {
      const res = await fetch("/api/payout/method", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ methodId: method.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to delete method")
      setLocalMethods((prev) => prev.filter((m) => m.id !== method.id))
    } catch (err: any) {
      setActionError(err.message || "Failed to delete payout method")
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 size={28} className="animate-spin text-[#6b2fa5]" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
        <AlertCircle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={onRefresh} className="text-xs text-red-600 underline mt-1">Try again</button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">Payout Methods</h3>
        <button
          onClick={onAddNew}
          className="px-4 py-2 bg-[#6b2fa5] text-white text-sm font-medium rounded-lg hover:bg-[#5a2589] transition-colors"
        >
          + Add New
        </button>
      </div>

      {/* Action Error */}
      {actionError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2">
          <AlertCircle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{actionError}</p>
        </div>
      )}

      {/* Empty State */}
      {localMethods.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <CreditCard size={36} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium text-sm">No payout methods yet</p>
          <p className="text-xs text-gray-400 mt-1">Add a bank account to receive payouts.</p>
          <button
            onClick={onAddNew}
            className="mt-4 px-4 py-2 bg-[#6b2fa5] text-white text-sm font-medium rounded-lg hover:bg-[#5a2589] transition-colors"
          >
            Add Payout Method
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {localMethods.map((method) => (
            <div
              key={method.id}
              className={`rounded-lg border p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 transition-shadow hover:shadow-md ${
                method.primary
                  ? "border-[#6b2fa5] bg-purple-50"
                  : "border-gray-200 bg-white"
              }`}
            >
              {/* Info */}
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${method.primary ? "bg-[#6b2fa5]" : "bg-gray-100"}`}>
                  <CreditCard size={18} className={method.primary ? "text-white" : "text-gray-500"} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900">{method.bankName}</p>
                    {method.primary && (
                      <span className="inline-flex items-center gap-1 text-xs bg-[#6b2fa5] text-white px-2 py-0.5 rounded-full font-medium">
                        <Star size={10} fill="currentColor" /> Primary
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 font-medium">{method.accountName}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    •••• •••• {method.accountNumber.slice(-4)}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {!method.primary && (
                  <button
                    onClick={() => handleSetPrimary(method)}
                    disabled={actionLoading === `primary-${method.id}`}
                    title="Set as primary"
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 text-gray-600 rounded-lg hover:border-[#6b2fa5] hover:text-[#6b2fa5] transition-colors disabled:opacity-50"
                  >
                    {actionLoading === `primary-${method.id}` ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Star size={12} />
                    )}
                    Set Primary
                  </button>
                )}
                <button
                  onClick={() => handleDelete(method)}
                  disabled={!!actionLoading}
                  title="Delete method"
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                >
                  {actionLoading === `delete-${method.id}` ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Trash2 size={16} />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 text-center">
        Only your primary method will be used for payouts.
      </p>
    </div>
  )
}