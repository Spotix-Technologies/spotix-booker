"use client"

/**
 * app/components/event-info/helper/vault-key-enter-onPayout.tsx
 *
 * Bottom-sheet dialog shown right after the requester (Event Creator or
 * Admin — the only roles that can ever reach this, since initiating a
 * payout is gated to them at /api/payout) submits a payout that lands in
 * "vault_pending".
 *
 * It tells them plainly: their request has gone out, every OTHER Vault
 * participant now needs to acknowledge it by entering their own Vault Key,
 * and — separately — the requester themselves still owes their own key
 * before the payout can clear at all.
 *
 * Submitting here calls the same PATCH /api/payout/vault route used by
 * vault-signoffs.tsx, now against Firestore `vaultHolds/{id}` documents
 * (holdIds) rather than the old `payouts` docs. If the requester happens
 * to be the LAST signer needed (e.g. a single-participant Vault, or every
 * other participant already signed off first), the route releases the
 * payout right here and hands back a fresh Supabase reference — which is
 * passed up via onEntered() so the parent can open the live payout dialog
 * immediately instead of leaving the requester wondering what happened.
 */

import { useState } from "react"
import ResponsiveSheet from "@/components/ui/responsive-sheet"
import { ShieldCheck, KeyRound, Loader2, AlertCircle, Users, KeySquare } from "lucide-react"

interface VaultKeyEnterOnPayoutDialogProps {
  /** Firestore vaultHolds/{id} document IDs — one per date on this request. */
  holdIds: string[]
  amount: number
  dates: string[]
  onClose: () => void
  /** Fired once the current user's key has been accepted for every hold — carries any references released as a direct result. */
  onEntered: (releasedReferences: string[]) => void
}

export default function VaultKeyEnterOnPayoutDialog({
  holdIds,
  amount,
  dates,
  onClose,
  onEntered,
}: VaultKeyEnterOnPayoutDialogProps) {
  const [key, setKey] = useState("")
  const [useOtta, setUseOtta] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dayLabel = dates.length === 1 ? dates[0] : `${dates.length} days (${dates.join(", ")})`

  async function handleSubmit() {
    if (!key) return
    setSubmitting(true)
    setError(null)
    const releasedReferences: string[] = []
    try {
      for (const holdId of holdIds) {
        const res = await fetch("/api/payout/vault", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(useOtta ? { holdId, ottaKey: key } : { holdId, vaultKey: key }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || (useOtta ? "Invalid OTTA key" : "Incorrect Vault Key"))
        if (data.released && data.reference) releasedReferences.push(data.reference)
      }
      onEntered(releasedReferences)
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
      size="md"
      zIndex={70}
      title="Payout request sent"
      icon={
        <div className="p-2 bg-purple-100 rounded-lg">
          <ShieldCheck size={16} className="text-[#6b2fa5]" />
        </div>
      }
      footer={
        <div className="flex flex-col-reverse sm:flex-row gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            I&apos;ll do it later
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !key}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-[#6b2fa5] text-white hover:bg-[#5a2589] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={14} />}
            {submitting ? "Verifying..." : "Submit Key"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600 leading-relaxed">
          Your payout request for{" "}
          <span className="font-semibold text-gray-900">{dayLabel}</span> (₦
          {Number(amount).toLocaleString()}) has been submitted.
        </p>

        {/* What happens next — other participants */}
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-3.5 flex gap-2.5">
          <Users size={16} className="text-[#6b2fa5] flex-shrink-0 mt-0.5" />
          <p className="text-xs text-purple-800 leading-relaxed">
            Every other Vault participant will now be asked to acknowledge this request by
            entering their own Vault Key before it can clear.
          </p>
        </div>

        <p className="text-sm text-gray-700 leading-relaxed font-medium">
          You still need to enter your own Vault Key to sign off on your own request.
        </p>

        <button
          type="button"
          onClick={() => { setUseOtta((v) => !v); setKey("") }}
          className="flex items-center gap-1.5 text-xs font-semibold text-[#6b2fa5] hover:underline"
        >
          <KeySquare size={12} />
          {useOtta ? "Use my own Vault Key instead" : "Sign off with an OTTA key instead"}
        </button>

        <input
          type="password"
          autoFocus
          placeholder={useOtta ? "OTTA key from another participant" : "Your Vault Key"}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && key) handleSubmit() }}
          disabled={submitting}
          className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] disabled:opacity-50"
        />
        {useOtta && (
          <p className="text-xs text-gray-400 -mt-2">
            Enter the 10-character key generated by another Vault participant. It signs off on their behalf and can only be used once.
          </p>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 flex gap-2">
            <AlertCircle size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        <p className="text-xs text-gray-400 text-center">
          You can also do this later from the Vault sign-off section at the top of this page.
        </p>
      </div>
    </ResponsiveSheet>
  )
}
