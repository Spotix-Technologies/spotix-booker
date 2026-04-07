"use client"

import { useState, useEffect } from "react"
import { Plus, Trash2, X, AlertCircle } from "lucide-react"

interface ReferralUsage {
  name: string
  ticketType: string
  purchaseDate: any
}

interface ReferralData {
  code: string
  usages: ReferralUsage[]
  totalTickets: number
}

interface ReferralsTabProps {
  eventId: string
}

export default function ReferralsTab({ eventId }: ReferralsTabProps) {
  const [referralCode, setReferralCode] = useState("")
  const [referrals, setReferrals] = useState<ReferralData[]>([])
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [selectedReferral, setSelectedReferral] = useState<ReferralData | null>(null)
  const [codeToDelete, setCodeToDelete] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // ── Fetch referrals ──────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchReferrals = async () => {
      setFetching(true)
      setFetchError(null)
      try {
        const res = await fetch(`/api/event/list/${eventId}/referrals`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Failed to fetch referrals")
        setReferrals(data.referrals)
      } catch (e: any) {
        console.error("Error fetching referrals:", e)
        setFetchError(e.message || "Failed to load referral codes")
      } finally {
        setFetching(false)
      }
    }

    fetchReferrals()
  }, [eventId])

  // ── Add referral ─────────────────────────────────────────────────────────────
  const handleAddReferral = async () => {
    if (!referralCode.trim()) return
    setAddError(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/event/list/${eventId}/referrals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: referralCode.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to add referral code")

      setReferrals((prev) => [...prev, data.referral])
      setReferralCode("")
    } catch (e: any) {
      console.error("Error adding referral:", e)
      setAddError(e.message || "Failed to add referral code")
    } finally {
      setLoading(false)
    }
  }

  // ── Delete referral ──────────────────────────────────────────────────────────
  const handleDeleteReferral = async () => {
    if (!codeToDelete) return
    setLoading(true)
    try {
      const res = await fetch(`/api/event/list/${eventId}/referrals`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codeToDelete }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to delete referral code")

      setReferrals((prev) => prev.filter((r) => r.code !== codeToDelete))
      if (selectedReferral?.code === codeToDelete) setSelectedReferral(null)
      setCodeToDelete(null)
    } catch (e: any) {
      console.error("Error deleting referral:", e)
      setFetchError(e.message || "Failed to delete referral code")
      setCodeToDelete(null)
    } finally {
      setLoading(false)
    }
  }

  // ── Format date ──────────────────────────────────────────────────────────────
  const formatDate = (timestamp: any): string => {
    if (!timestamp) return "Unknown"
    if (typeof timestamp === "object" && "seconds" in timestamp) {
      try { return new Date(timestamp.seconds * 1000).toLocaleDateString() } catch { return "Invalid date" }
    }
    return String(timestamp)
  }

  return (
    <div className="space-y-6">
      {/* Add Referral Code Section */}
      <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl border border-slate-200 p-4 sm:p-6 shadow-sm">
        <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-4">Add Referral Code</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={referralCode}
            onChange={(e) => { setReferralCode(e.target.value); setAddError(null) }}
            placeholder="Enter referral code name"
            className="w-full sm:flex-1 px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#6b2fa5] focus:border-transparent transition-all"
            disabled={loading}
            onKeyDown={(e) => {
              if (e.key === "Enter" && referralCode.trim()) handleAddReferral()
            }}
          />
          <button
            onClick={handleAddReferral}
            disabled={loading || !referralCode.trim()}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-[#6b2fa5] text-white rounded-lg hover:bg-[#5a2589] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 font-medium shadow-md hover:shadow-lg"
          >
            <Plus size={18} />
            <span>Add Code</span>
          </button>
        </div>

        {/* Inline add error */}
        {addError && (
          <div className="mt-3 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
            <AlertCircle size={16} className="shrink-0" />
            <span>{addError}</span>
          </div>
        )}
      </div>

      {/* Fetch error */}
      {fetchError && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
          <AlertCircle size={16} className="shrink-0" />
          <span>{fetchError}</span>
        </div>
      )}

      {/* Referrals Table */}
      <div>
        <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-4">Referral Codes</h3>
        {fetching ? (
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-[#6b2fa5] border-r-transparent mb-4" />
            <p className="text-slate-600">Loading referral codes...</p>
          </div>
        ) : referrals.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 sm:p-12 text-center shadow-sm">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Plus size={32} className="text-slate-400" />
            </div>
            <p className="text-slate-600 font-medium">No referral codes added yet</p>
            <p className="text-slate-500 text-sm mt-2">Create your first referral code to start tracking</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
                  <tr>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-slate-900">Referral Code</th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-slate-900">Uses</th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-slate-900">Tickets</th>
                    <th className="px-4 sm:px-6 py-3 text-right text-xs sm:text-sm font-semibold text-slate-900">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {referrals.map((referral) => (
                    <tr key={referral.code} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 sm:px-6 py-4">
                        <button
                          onClick={() => setSelectedReferral(referral)}
                          className="font-mono text-sm sm:text-base font-semibold text-[#6b2fa5] hover:underline hover:text-[#5a2589] transition-colors"
                        >
                          {referral.code}
                        </button>
                      </td>
                      <td className="px-4 sm:px-6 py-4">
                        <span className="inline-flex items-center justify-center min-w-[2rem] px-2.5 py-1 bg-blue-100 text-blue-700 text-xs sm:text-sm font-semibold rounded-full">
                          {referral.usages.length}
                        </span>
                      </td>
                      <td className="px-4 sm:px-6 py-4">
                        <span className="inline-flex items-center justify-center min-w-[2rem] px-2.5 py-1 bg-green-100 text-green-700 text-xs sm:text-sm font-semibold rounded-full">
                          {referral.totalTickets}
                        </span>
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-right">
                        <button
                          onClick={() => setCodeToDelete(referral.code)}
                          disabled={loading}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                          title="Delete referral code"
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {codeToDelete && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 size={22} className="text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 text-center">Delete Referral Code?</h3>
              <p className="text-sm text-slate-500 text-center mt-2">
                Are you sure you want to delete{" "}
                <span className="font-mono font-semibold text-slate-700">{codeToDelete}</span>?
                This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={() => setCodeToDelete(null)}
                className="flex-1 py-2.5 px-4 rounded-xl border-2 border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-all duration-200"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteReferral}
                disabled={loading}
                className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 text-white font-semibold text-sm hover:bg-red-700 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed active:scale-95"
              >
                {loading ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Referral Details Modal */}
      {selectedReferral && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-slate-100">
              <div>
                <h3 className="text-xl sm:text-2xl font-bold text-slate-900">Referral Code</h3>
                <span className="font-mono text-lg sm:text-xl font-bold text-[#6b2fa5] mt-1 block">{selectedReferral.code}</span>
              </div>
              <button
                onClick={() => setSelectedReferral(null)}
                className="p-2 text-slate-500 hover:bg-white hover:text-slate-700 rounded-lg transition-all active:scale-95"
              >
                <X size={24} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 sm:p-6 overflow-y-auto max-h-[calc(85vh-100px)]">
              <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200 shadow-sm">
                  <p className="text-xs sm:text-sm text-blue-700 font-medium mb-1">Total Uses</p>
                  <p className="text-2xl sm:text-3xl font-bold text-blue-900">{selectedReferral.usages.length}</p>
                </div>
                <div className="bg-gradient-to-br from-[#6b2fa5]/10 to-[#6b2fa5]/20 rounded-xl p-4 border border-[#6b2fa5]/30 shadow-sm">
                  <p className="text-xs sm:text-sm text-[#6b2fa5] font-medium mb-1">Tickets Sold</p>
                  <p className="text-2xl sm:text-3xl font-bold text-[#6b2fa5]">{selectedReferral.totalTickets}</p>
                </div>
              </div>

              <div>
                <h4 className="text-base sm:text-lg font-bold text-slate-900 mb-4">Usage Details</h4>
                {selectedReferral.usages.length === 0 ? (
                  <div className="bg-slate-50 rounded-xl border border-slate-200 p-8 sm:p-12 text-center">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                      <Plus size={32} className="text-slate-400" />
                    </div>
                    <p className="text-slate-600 font-medium">No usage yet</p>
                    <p className="text-slate-500 text-sm mt-2">This referral code hasn't been used</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
                          <tr>
                            <th className="px-3 sm:px-4 py-3 text-left text-xs sm:text-sm font-semibold text-slate-900">Name</th>
                            <th className="px-3 sm:px-4 py-3 text-left text-xs sm:text-sm font-semibold text-slate-900">Ticket Type</th>
                            <th className="px-3 sm:px-4 py-3 text-left text-xs sm:text-sm font-semibold text-slate-900">Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {selectedReferral.usages.map((usage, index) => (
                            <tr key={index} className="hover:bg-slate-50 transition-colors">
                              <td className="px-3 sm:px-4 py-3 text-slate-700 text-sm sm:text-base font-medium">{usage.name}</td>
                              <td className="px-3 sm:px-4 py-3">
                                <span className="inline-block px-2.5 py-1 bg-slate-100 text-slate-700 text-xs sm:text-sm rounded-full font-medium">
                                  {usage.ticketType}
                                </span>
                              </td>
                              <td className="px-3 sm:px-4 py-3 text-slate-600 text-xs sm:text-sm">{formatDate(usage.purchaseDate)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}