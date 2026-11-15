"use client"

/**
 * app/components/event-info/helper/vault-key-enter.tsx
 *
 * Shown once, right after the requester's own payout request goes into
 * "vault_pending". Lets them enter their OWN Vault Key immediately, or
 * close it and do it later from the "awaiting your Vault sign-off"
 * section (VaultSignoffs) at the top of the Payouts tab.
 *
 * Submits the same key against every payoutId created in this request —
 * a bulk request creates one payout doc per day, and the requester signs
 * all of them with one key entry, same as vault-signoffs.tsx does per
 * payout when acting on someone else's request.
 */

import { useState } from "react"
import ResponsiveSheet from "@/components/ui/responsive-sheet"
import { ShieldCheck, KeyRound, Loader2, AlertCircle } from "lucide-react"

interface VaultKeyEnterDialogProps {
  payoutIds: string[]
  amount: number
  dates: string[]
  onClose: () => void
  /** Fired once the key has been accepted for every payoutId */
  onEntered: () => void
}

export default function VaultKeyEnterDialog({ payoutIds, amount, dates, onClose, onEntered }: VaultKeyEnterDialogProps) {
  const [mode, setMode] = useState<"prompt" | "enter">("prompt")
  const [key, setKey] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dayLabel = dates.length === 1 ? dates[0] : `${dates.length} days (${dates.join(", ")})`

  async function handleSubmit() {
    if (!key) return
    setSubmitting(true)
    setError(null)
    try {
      for (const payoutId of payoutIds) {
        const res = await fetch("/api/payout/vault", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payoutId, vaultKey: key }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Incorrect Vault Key")
      }
      onEntered()
      onClose()
    } catch (err: any) {
      setError(err.message || "Failed to submit Vault Key")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ResponsiveSheet
      open
      onClose={onClose}
      dismissible={!submitting}
      size="sm"
      zIndex={70}
      title="One more step"
      icon={
        <div className="p-2 bg-purple-100 rounded-lg">
          <ShieldCheck size={16} className="text-[#6b2fa5]" />
        </div>
      }
      footer={
        mode === "prompt" ? (
          <div className="flex flex-col-reverse sm:flex-row gap-3">
            <button
              onClick={onClose}
              disabled={submitting}
              className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              I'll do it later
            </button>
            <button
              onClick={() => setMode("enter")}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-[#6b2fa5] text-white hover:bg-[#5a2589] transition-colors"
            >
              Enter Now
            </button>
          </div>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting || !key}
            className="w-full py-2.5 rounded-xl text-sm font-semibold bg-[#6b2fa5] text-white hover:bg-[#5a2589] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={14} />}
            {submitting ? "Verifying..." : "Submit Key"}
          </button>
        )
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600 leading-relaxed">
          As you have just made a payout request for{" "}
          <span className="font-semibold text-gray-900">{dayLabel}</span> (₦
          {Number(amount).toLocaleString()}), you still need to enter your OWN Vault Key.
        </p>

        {mode === "enter" && (
          <>
            <input
              type="password"
              autoFocus
              placeholder="Your Vault Key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && key) handleSubmit() }}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#6b2fa5]"
            />

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 flex gap-2">
                <AlertCircle size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{error}</p>
              </div>
            )}

            <p className="text-xs text-gray-400 text-center">
              You can also do this later from the Vault sign-off section at the top of this page.
            </p>
          </>
        )}
      </div>
    </ResponsiveSheet>
  )
}
