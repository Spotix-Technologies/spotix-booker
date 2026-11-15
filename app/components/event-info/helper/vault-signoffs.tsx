"use client"

import { useState, useEffect, useCallback } from "react"
import ResponsiveSheet from "@/components/ui/responsive-sheet"
import { Lock, KeyRound, Loader2, AlertCircle, ShieldCheck, XCircle, Ban, KeySquare } from "lucide-react"

interface VaultPendingPayout {
  id: string
  eventId: string
  userId: string
  date: string
  amount: number
  vaultParticipants: string[]
  vaultSubmissions: Record<string, boolean>
}

interface VaultSignoffsProps {
  eventId: string
  currentUserId: string
  /** Called after a key is successfully submitted so the parent can refresh statuses. If THIS submission was the one that released the payout, releasedReference carries the new Supabase reference so the parent can open the live payout dialog. */
  onResolved?: (releasedReference?: string) => void
}

function KeyEntryModal({
  payout,
  onCancel,
  onSubmit,
  submitting,
  error,
}: {
  payout: VaultPendingPayout
  onCancel: () => void
  onSubmit: (key: string, isOtta: boolean) => void
  submitting: boolean
  error: string | null
}) {
  const [key, setKey] = useState("")
  const [useOtta, setUseOtta] = useState(false)

  return (
    <ResponsiveSheet
      open
      onClose={onCancel}
      dismissible={!submitting}
      size="sm"
      zIndex={70}
      title="Vault Sign-off"
      icon={
        <div className="p-2 bg-purple-100 rounded-lg">
          <Lock size={16} className="text-[#6b2fa5]" />
        </div>
      }
      footer={
        <button
          onClick={() => onSubmit(key, useOtta)}
          disabled={submitting || !key}
          className="w-full py-2.5 rounded-xl text-sm font-semibold bg-[#6b2fa5] text-white hover:bg-[#5a2589] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={14} />}
          {submitting ? "Verifying..." : "Submit Key"}
        </button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Enter your Vault Key to sign off on the payout for{" "}
          <span className="font-semibold text-gray-900">{payout.date}</span> (₦
          {Number(payout.amount).toLocaleString()}).
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
          onKeyDown={(e) => { if (e.key === "Enter" && key) onSubmit(key, useOtta) }}
          className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#6b2fa5]"
        />

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 flex gap-2">
            <AlertCircle size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}
      </div>
    </ResponsiveSheet>
  )
}

function RejectConfirmModal({
  payout,
  onCancel,
  onConfirm,
  submitting,
  error,
}: {
  payout: VaultPendingPayout
  onCancel: () => void
  onConfirm: () => void
  submitting: boolean
  error: string | null
}) {
  return (
    <ResponsiveSheet
      open
      onClose={onCancel}
      dismissible={!submitting}
      role="alertdialog"
      size="sm"
      zIndex={70}
      title="Reject this payout?"
      icon={
        <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
          <XCircle size={20} className="text-red-600" />
        </div>
      }
      footer={
        <div className="flex flex-col-reverse sm:flex-row gap-3">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Keep it
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={14} />}
            Reject Payout
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600 leading-relaxed">
          Rejecting the payout for{" "}
          <span className="font-semibold text-gray-900">{payout.date}</span> (₦
          {Number(payout.amount).toLocaleString()}) permanently kills it. It can no longer be
          released — no other Vault participant will be able to submit their key against it,
          and this can't be undone.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 flex gap-2">
            <AlertCircle size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}
      </div>
    </ResponsiveSheet>
  )
}

export default function VaultSignoffs({ eventId, currentUserId, onResolved }: VaultSignoffsProps) {
  const [payouts, setPayouts] = useState<VaultPendingPayout[]>([])
  const [loading, setLoading] = useState(true)
  const [activePayout, setActivePayout] = useState<VaultPendingPayout | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [rejectPayout, setRejectPayout] = useState<VaultPendingPayout | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [rejectError, setRejectError] = useState<string | null>(null)

  const fetchPending = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/payout?eventId=${eventId}&action=vaultPending`)
      const data = await res.json()
      if (res.ok) setPayouts(data.payouts ?? [])
    } catch {
      // Non-critical — the section just stays empty
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    fetchPending()
  }, [fetchPending])

  async function handleSubmitKey(key: string, isOtta: boolean) {
    if (!activePayout) return
    setSubmitting(true)
    setModalError(null)
    try {
      const res = await fetch("/api/payout/vault", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isOtta ? { holdId: activePayout.id, ottaKey: key } : { holdId: activePayout.id, vaultKey: key }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || (isOtta ? "Invalid OTTA key" : "Incorrect Vault Key"))
      setActivePayout(null)
      await fetchPending()
      onResolved?.(data.released && data.reference ? data.reference : undefined)
    } catch (err: any) {
      setModalError(err.message || (isOtta ? "Invalid OTTA key" : "Incorrect Vault Key"))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReject() {
    if (!rejectPayout) return
    setRejecting(true)
    setRejectError(null)
    try {
      const res = await fetch("/api/payout", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdId: rejectPayout.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to reject payout")
      setRejectPayout(null)
      // A rejected payout drops out of the vault_pending query on the next
      // fetch — this instantly removes it from this panel so no other Vault
      // participant can act on it again.
      await fetchPending()
      onResolved?.()
    } catch (err: any) {
      setRejectError(err.message || "Failed to reject payout")
    } finally {
      setRejecting(false)
    }
  }

  // Only show payouts where the current user actually needs to act
  const actionable = payouts.filter(
    (p) => p.vaultParticipants?.includes(currentUserId) && !p.vaultSubmissions?.[currentUserId]
  )

  if (loading || actionable.length === 0) return null

  return (
    <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-3">
      {activePayout && (
        <KeyEntryModal
          payout={activePayout}
          onCancel={() => { setActivePayout(null); setModalError(null) }}
          onSubmit={handleSubmitKey}
          submitting={submitting}
          error={modalError}
        />
      )}

      {rejectPayout && (
        <RejectConfirmModal
          payout={rejectPayout}
          onCancel={() => { setRejectPayout(null); setRejectError(null) }}
          onConfirm={handleReject}
          submitting={rejecting}
          error={rejectError}
        />
      )}

      <div className="flex items-center gap-2">
        <ShieldCheck size={16} className="text-[#6b2fa5]" />
        <p className="text-sm font-bold text-purple-900">
          {actionable.length} payout{actionable.length !== 1 ? "s" : ""} awaiting your Vault sign-off
        </p>
      </div>

      <div className="space-y-2">
        {actionable.map((p) => {
          const submittedCount = Object.values(p.vaultSubmissions ?? {}).filter(Boolean).length
          const totalCount = p.vaultParticipants?.length ?? 0
          // The initiator rejects their own request as a "Cancel" from the
          // Payout Log page, not a "Reject" here — only offer Reject to
          // participants who didn't initiate this specific payout.
          const canReject = p.userId !== currentUserId
          return (
            <div
              key={p.id}
              className="flex items-center justify-between gap-3 bg-white border border-purple-200 rounded-lg px-3 py-2.5"
            >
              <div>
                <p className="text-sm font-semibold text-gray-900">{p.date}</p>
                <p className="text-xs text-gray-500">
                  ₦{Number(p.amount).toLocaleString()} · {submittedCount}/{totalCount} signed off
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {canReject && (
                  <button
                    onClick={() => setRejectPayout(p)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors flex items-center gap-1.5"
                  >
                    <Ban size={12} /> Reject
                  </button>
                )}
                <button
                  onClick={() => setActivePayout(p)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#6b2fa5] text-white hover:bg-[#5a2589] transition-colors flex items-center gap-1.5"
                >
                  <KeyRound size={12} /> Enter Key
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
