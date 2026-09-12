import React, { useState } from "react"
import { db } from "@/lib/firebase"
import { doc, getDoc } from "firebase/firestore"
import { Users, CheckCircle, AlertCircle, Shield, Loader2 } from "lucide-react"

interface AffiliatesProps {
  verifiedAffiliate: { id: string; name: string } | null
  setVerifiedAffiliate: (affiliate: { id: string; name: string } | null) => void
}

export function Affiliates({
  verifiedAffiliate,
  setVerifiedAffiliate,
}: AffiliatesProps) {
  const [affiliateInput, setAffiliateInput] = useState("")
  const [isVerifying, setIsVerifying] = useState(false)
  const [error, setError] = useState("")

  const handleVerifyAffiliate = async () => {
    if (!affiliateInput.trim()) {
      setError("Please enter an Affiliate ID")
      return
    }

    setIsVerifying(true)
    setError("")

    try {
      const affiliateRef = doc(db, "Affiliates", affiliateInput.trim())
      const affiliateSnap = await getDoc(affiliateRef)

      if (affiliateSnap.exists()) {
        const affiliateData = affiliateSnap.data()
        if (affiliateData.name) {
          setVerifiedAffiliate({
            id: affiliateInput.trim(),
            name: affiliateData.name,
          })
          setAffiliateInput("")
          setError("")
        } else {
          setError("Affiliate ID is incorrect. Check and try again")
          setAffiliateInput("")
        }
      } else {
        setError("Affiliate ID is incorrect. Check and try again")
        setAffiliateInput("")
      }
    } catch (err) {
      console.error("Error verifying affiliate:", err)
      setError("Failed to verify affiliate. Please try again")
      setAffiliateInput("")
    } finally {
      setIsVerifying(false)
    }
  }

  const handleClearAffiliate = () => {
    setVerifiedAffiliate(null)
    setAffiliateInput("")
    setError("")
  }

  return (
    <div className="space-y-6 rounded-xl border-2 border-slate-200 bg-white p-5 sm:p-6 lg:p-8 shadow-sm">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center justify-center w-10 h-10 bg-[#6b2fa5]/10 rounded-lg">
          <Users className="w-5 h-5 text-[#6b2fa5]" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Affiliate Partner</h2>
      </div>

      <div className="space-y-5">
        <p className="text-sm text-slate-600">
          Add an affiliate partner to this event. Affiliates will earn commissions from
          ticket sales.
        </p>

        {/* Verified Affiliate Display */}
        {verifiedAffiliate && (
          <div className="p-5 rounded-lg border-2 border-emerald-200 bg-emerald-50">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-8 h-8 bg-emerald-500 rounded-full">
                  <CheckCircle className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-emerald-900">
                    Affiliate Verified
                  </p>
                  <p className="text-xs text-emerald-700">
                    This affiliate will be linked to your event
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClearAffiliate}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 underline"
              >
                Remove
              </button>
            </div>

            <div className="space-y-2">
              <div>
                <label className="block text-xs font-semibold text-emerald-900 mb-1">
                  Affiliate ID
                </label>
                <input
                  type="text"
                  value={verifiedAffiliate.id}
                  readOnly
                  className="w-full px-4 py-2.5 border-2 border-emerald-300 rounded-lg bg-white text-slate-900 text-sm font-mono cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-emerald-900 mb-1">
                  Affiliate Name
                </label>
                <input
                  type="text"
                  value={verifiedAffiliate.name}
                  readOnly
                  className="w-full px-4 py-2.5 border-2 border-emerald-300 rounded-lg bg-white text-slate-900 text-sm cursor-not-allowed"
                />
              </div>
            </div>
          </div>
        )}

        {/* Affiliate Input (only show if no verified affiliate) */}
        {!verifiedAffiliate && (
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-700">
              Affiliate ID (Optional)
            </label>

            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Enter Affiliate ID"
                  value={affiliateInput}
                  onChange={(e) => {
                    setAffiliateInput(e.target.value)
                    setError("")
                  }}
                  disabled={isVerifying}
                  className="w-full pl-11 pr-4 py-3 border-2 border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200 text-slate-900 placeholder:text-slate-400 disabled:bg-slate-100 disabled:cursor-not-allowed"
                />
              </div>

              <button
                type="button"
                onClick={handleVerifyAffiliate}
                disabled={isVerifying || !affiliateInput.trim()}
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#6b2fa5] hover:bg-[#5a2589] text-white font-semibold rounded-lg transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Verify
                  </>
                )}
              </button>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-800">{error}</p>
              </div>
            )}

            <div className="flex items-start gap-2 p-4 rounded-lg bg-blue-50 border border-blue-200">
              <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-blue-800 font-semibold mb-1">
                  How Affiliate Partnership Works
                </p>
                <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
                  <li>Enter and verify an affiliate ID to link them to your event</li>
                  <li>Affiliates earn commissions from ticket sales</li>
                  <li>You can add one affiliate per event</li>
                  <li>This field is optional</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}