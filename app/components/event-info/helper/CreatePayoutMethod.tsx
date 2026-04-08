"use client"

import { useState, useEffect, useRef } from "react"
import { Loader2, CheckCircle, AlertCircle, Search, Plus } from "lucide-react"
import { auth } from "@/lib/firebase"

interface Bank {
  name: string
  code: string
}

interface CreatePayoutMethodProps {
  userId: string
  onCreated: () => void
  onCancel: () => void
}

export default function CreatePayoutMethod({ userId, onCreated, onCancel }: CreatePayoutMethodProps) {
  const [accountNumber, setAccountNumber] = useState("")
  const [bankQuery, setBankQuery] = useState("")
  const [selectedBank, setSelectedBank] = useState<Bank | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [banks, setBanks] = useState<Bank[]>([])
  const [filteredBanks, setFilteredBanks] = useState<Bank[]>([])
  const [banksLoading, setBanksLoading] = useState(false)
  const [banksError, setBanksError] = useState<string | null>(null)

  const [verifyLoading, setVerifyLoading] = useState(false)
  const [verifyStatus, setVerifyStatus] = useState<"idle" | "verified" | "failed">("idle")
  const [verifiedName, setVerifiedName] = useState<string | null>(null)
  const [verifyError, setVerifyError] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const dropdownRef = useRef<HTMLDivElement>(null)

  // ── Fetch banks from Paystack via our API ──────────────────────────────────
  useEffect(() => {
    const fetchBanks = async () => {
      setBanksLoading(true)
      setBanksError(null)
      try {
        const res = await fetch("/api/payout/method?resource=banks")
        if (!res.ok) throw new Error("Failed to fetch banks")
        const data = await res.json()
        setBanks(data.banks ?? [])
      } catch (err: any) {
        setBanksError("Could not load banks. Please try again.")
      } finally {
        setBanksLoading(false)
      }
    }
    fetchBanks()
  }, [])

  // ── Filter banks as user types ─────────────────────────────────────────────
  useEffect(() => {
    if (!bankQuery.trim()) {
      setFilteredBanks([])
      setShowDropdown(false)
      return
    }
    const q = bankQuery.toLowerCase()
    const matches = banks.filter((b) => b.name.toLowerCase().includes(q)).slice(0, 8)
    setFilteredBanks(matches)
    setShowDropdown(matches.length > 0)
  }, [bankQuery, banks])

  // ── Close dropdown on outside click ───────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  // Reset verification when inputs change
  useEffect(() => {
    setVerifyStatus("idle")
    setVerifiedName(null)
    setVerifyError(null)
  }, [accountNumber, selectedBank])

  const handleBankSelect = (bank: Bank) => {
    setSelectedBank(bank)
    setBankQuery(bank.name)
    setShowDropdown(false)
  }

  const handleVerify = async () => {
    if (!accountNumber || accountNumber.length !== 10) {
      setVerifyError("Account number must be exactly 10 digits.")
      return
    }
    if (!selectedBank) {
      setVerifyError("Please select a bank first.")
      return
    }

    setVerifyLoading(true)
    setVerifyError(null)
    setVerifyStatus("idle")

    try {
      const user = auth.currentUser
      if (!user) throw new Error("Not authenticated")
      const idToken = await user.getIdToken()

      const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL
      const res = await fetch(
        `${BACKEND_URL}/v1/verify?accountNumber=${accountNumber}&bankName=${encodeURIComponent(selectedBank.name)}&bankCode=${selectedBank.code}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${idToken}` },
        }
      )
      const data = await res.json()

      if (res.ok && data.status === true) {
        setVerifiedName(data.account_name)
        setVerifyStatus("verified")
      } else {
        setVerifyError(data.message || "Failed to verify account. Please check your details.")
        setVerifyStatus("failed")
      }
    } catch (err: any) {
      setVerifyError("An error occurred while verifying. Please try again.")
      setVerifyStatus("failed")
    } finally {
      setVerifyLoading(false)
    }
  }

  const handleSave = async () => {
    if (verifyStatus !== "verified" || !verifiedName || !selectedBank) return

    setSaving(true)
    setSaveError(null)

    try {
      const res = await fetch("/api/payout/method", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountNumber,
          bankName: selectedBank.name,
          bankCode: selectedBank.code,
          accountName: verifiedName,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to save payout method")
      onCreated()
    } catch (err: any) {
      setSaveError(err.message || "Failed to save. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const inputBase =
    "w-full px-4 py-2.5 rounded-lg border border-gray-300 text-black text-sm outline-none transition-colors focus:border-[#6b2fa5] focus:ring-2 focus:ring-[#6b2fa5]/20"

  return (
    <div className="space-y-5">
      <h3 className="text-base font-semibold text-gray-900">Add Payout Method</h3>

      {/* Account Number */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">Account Number</label>
        <input
          type="text"
          inputMode="numeric"
          maxLength={10}
          placeholder="0123456789"
          value={accountNumber}
          onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
          className={inputBase}
        />
        {accountNumber.length > 0 && accountNumber.length < 10 && (
          <p className="text-xs text-amber-600">{10 - accountNumber.length} more digit{10 - accountNumber.length !== 1 ? "s" : ""} needed</p>
        )}
      </div>

      {/* Bank Search */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">Bank</label>
        {banksLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
            <Loader2 size={16} className="animate-spin text-[#6b2fa5]" />
            Loading banks...
          </div>
        ) : banksError ? (
          <p className="text-sm text-red-600">{banksError}</p>
        ) : (
          <div className="relative" ref={dropdownRef}>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Type to search your bank..."
                value={bankQuery}
                onChange={(e) => {
                  setBankQuery(e.target.value)
                  if (selectedBank && e.target.value !== selectedBank.name) {
                    setSelectedBank(null)
                  }
                }}
                className={`${inputBase} pl-9`}
              />
            </div>
            {showDropdown && (
              <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                {filteredBanks.map((bank) => (
                  <button
                    key={bank.code}
                    onClick={() => handleBankSelect(bank)}
                    className="w-full text-left px-4 py-2.5 text-sm text-black hover:bg-purple-50 hover:text-[#6b2fa5] transition-colors"
                  >
                    {bank.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Verify Button */}
      <div className="space-y-2">
        <button
          onClick={handleVerify}
          disabled={verifyLoading || accountNumber.length !== 10 || !selectedBank}
          className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            accountNumber.length === 10 && selectedBank && !verifyLoading
              ? "bg-[#6b2fa5] text-white hover:bg-[#5a2589]"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          {verifyLoading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Verifying...
            </>
          ) : (
            "Verify Account"
          )}
        </button>

        {/* Verification Result */}
        {verifyStatus === "verified" && verifiedName && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5">
            <CheckCircle size={16} className="text-green-600 flex-shrink-0" />
            <div>
              <p className="text-xs text-green-600 font-medium">Account Verified</p>
              <p className="text-sm font-semibold text-gray-900">{verifiedName}</p>
            </div>
          </div>
        )}
        {verifyStatus === "failed" && verifyError && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
            <AlertCircle size={16} className="text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-700">{verifyError}</p>
          </div>
        )}
      </div>

      {/* Save Error */}
      {saveError && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
          <AlertCircle size={16} className="text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-700">{saveError}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={verifyStatus !== "verified" || saving}
          className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            verifyStatus === "verified" && !saving
              ? "bg-[#6b2fa5] text-white hover:bg-[#5a2589]"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          {saving ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Plus size={16} />
              Add Payout Method
            </>
          )}
        </button>
      </div>
    </div>
  )
}