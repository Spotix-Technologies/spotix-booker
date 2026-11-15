"use client"

import { useState, useEffect, useCallback } from "react"
import ResponsiveSheet from "@/components/ui/responsive-sheet"
import {
  Lock, ShieldCheck, ShieldAlert, Loader2, AlertCircle, Check,
  UserPlus, KeyRound, X, ChevronRight, Crown, Shield,
} from "lucide-react"

// TODO(Drexx): swap in the real Vault help-article URL once it's published.
const VAULT_INFO_URL = "https://spotix.africa/help/the-vault"

interface VaultParticipant {
  uid: string
  email: string
  isCreator: boolean
  hasSetKey: boolean
  addedAt: string | null
}

interface VaultConfig {
  eventId: string
  enabledVault: boolean
  enabledAt?: string | null
  participants: VaultParticipant[]
}

interface AdminCandidate {
  collaboratorId: string
  collaboratorEmail: string
  displayName: string
  role: string
}

interface VaultPanelProps {
  eventId: string
  isOwner: boolean
  currentUserId: string
  /** Reports vault readiness up so the parent can gate the Withdraw buttons */
  onStatusChange?: (status: { enabledVault: boolean; ready: boolean; missing: { uid: string; email: string }[] }) => void
}

// ─── "What is this?" link — used in every Vault surface ─────────────────────
function WhatIsThisLink({ align = "right" }: { align?: "left" | "right" }) {
  return (
    <a
      href={VAULT_INFO_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`text-xs text-gray-400 hover:text-[#6b2fa5] underline underline-offset-2 transition-colors ${
        align === "right" ? "ml-auto" : ""
      }`}
    >
      What is this?
    </a>
  )
}

// ─── Enable confirmation dialog ──────────────────────────────────────────────
function EnableVaultDialog({
  onConfirm,
  onCancel,
  submitting,
}: {
  onConfirm: () => void
  onCancel: () => void
  submitting: boolean
}) {
  return (
    <ResponsiveSheet
      open
      onClose={onCancel}
      dismissible={!submitting}
      role="alertdialog"
      size="md"
      zIndex={70}
      title="Enable The Vault?"
      icon={
        <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
          <Lock size={18} className="text-[#6b2fa5]" />
        </div>
      }
      footer={
        <div className="flex flex-col-reverse sm:flex-row gap-3">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-[#6b2fa5] text-white hover:bg-[#5a2589] transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Lock size={14} />}
            {submitting ? "Enabling..." : "Enable Vault"}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <p className="text-sm text-gray-600 leading-relaxed">
          The Vault requires you and any Admins you choose to enter a personal Vault Key
          before any payout on this event can clear.
        </p>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
          <ShieldAlert size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 leading-relaxed">
            <strong>This cannot be turned off once enabled.</strong> Any Admin you add to the
            Vault also cannot be removed afterward. Only proceed if you're sure.
          </p>
        </div>

        <div className="flex justify-center">
          <WhatIsThisLink align="left" />
        </div>
      </div>
    </ResponsiveSheet>
  )
}

// ─── Add-participant confirmation dialog ─────────────────────────────────────
function AddParticipantDialog({
  candidate,
  onConfirm,
  onCancel,
  submitting,
}: {
  candidate: AdminCandidate
  onConfirm: () => void
  onCancel: () => void
  submitting: boolean
}) {
  return (
    <ResponsiveSheet
      open
      onClose={onCancel}
      dismissible={!submitting}
      role="alertdialog"
      size="md"
      zIndex={70}
      title="Add to the Vault?"
      icon={
        <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
          <UserPlus size={18} className="text-[#6b2fa5]" />
        </div>
      }
      footer={
        <div className="flex flex-col-reverse sm:flex-row gap-3">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-[#6b2fa5] text-white hover:bg-[#5a2589] transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={14} />}
            {submitting ? "Adding..." : "Add Permanently"}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <p className="text-sm text-gray-600 leading-relaxed">
          <span className="font-semibold text-gray-900 break-all">
            {candidate.displayName || candidate.collaboratorEmail}
          </span>{" "}
          will need to enter their own Vault Key on every withdrawal from this event.
        </p>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
          <ShieldAlert size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 leading-relaxed">
            <strong>This is permanent.</strong> Once added, they cannot be removed from the Vault.
          </p>
        </div>
      </div>
    </ResponsiveSheet>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────
export default function VaultPanel({ eventId, isOwner, currentUserId, onStatusChange }: VaultPanelProps) {
  const [vault, setVault] = useState<VaultConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showEnableDialog, setShowEnableDialog] = useState(false)
  const [enabling, setEnabling] = useState(false)

  const [adminCandidates, setAdminCandidates] = useState<AdminCandidate[]>([])
  const [showAddPicker, setShowAddPicker] = useState(false)
  const [pendingCandidate, setPendingCandidate] = useState<AdminCandidate | null>(null)
  const [addingParticipant, setAddingParticipant] = useState(false)

  const fetchVault = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`/api/payout/vault?eventId=${eventId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to load Vault status")
      setVault(data.vault)

      const enabledVault = Boolean(data.vault?.enabledVault)
      const participants: VaultParticipant[] = data.vault?.participants ?? []
      const missing = participants.filter((p) => !p.hasSetKey)
      onStatusChange?.({
        enabledVault,
        ready: !enabledVault || missing.length === 0,
        missing: missing.map((p) => ({ uid: p.uid, email: p.email || p.uid })),
      })
    } catch (err: any) {
      setError(err.message || "Failed to load Vault status")
    } finally {
      setLoading(false)
    }
  }, [eventId, onStatusChange])

  useEffect(() => {
    fetchVault()
  }, [fetchVault])

  async function handleEnable() {
    setEnabling(true)
    try {
      const res = await fetch("/api/payout/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, action: "enable" }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to enable Vault")
      setShowEnableDialog(false)
      await fetchVault()
    } catch (err: any) {
      setError(err.message || "Failed to enable Vault")
      setShowEnableDialog(false)
    } finally {
      setEnabling(false)
    }
  }

  async function openAddPicker() {
    setShowAddPicker(true)
    try {
      const res = await fetch(`/api/teams?eventId=${eventId}&action=list`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to load team members")
      const existingUids = new Set((vault?.participants ?? []).map((p) => p.uid))
      const admins: AdminCandidate[] = (data.collaborators ?? [])
        .filter((c: any) => c.role === "admin" && !existingUids.has(c.collaboratorId))
        .map((c: any) => ({
          collaboratorId: c.collaboratorId,
          collaboratorEmail: c.collaboratorEmail,
          displayName: c.displayName,
          role: c.role,
        }))
      setAdminCandidates(admins)
    } catch (err: any) {
      setError(err.message || "Failed to load team members")
    }
  }

  async function handleAddParticipant() {
    if (!pendingCandidate) return
    setAddingParticipant(true)
    try {
      const res = await fetch("/api/payout/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          action: "addParticipant",
          collaboratorId: pendingCandidate.collaboratorId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to add participant")
      setPendingCandidate(null)
      setShowAddPicker(false)
      await fetchVault()
    } catch (err: any) {
      setError(err.message || "Failed to add participant")
    } finally {
      setAddingParticipant(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-2 text-sm text-gray-400">
        <Loader2 size={16} className="animate-spin" />
        Loading Vault status...
      </div>
    )
  }

  // Not enabled and not the owner — nothing relevant to show.
  if (!vault?.enabledVault && !isOwner) return null

  const myParticipant = vault?.participants.find((p) => p.uid === currentUserId) ?? null

  return (
    <div className="bg-white border border-purple-200 rounded-xl p-5 space-y-4">
      {showEnableDialog && (
        <EnableVaultDialog
          onConfirm={handleEnable}
          onCancel={() => setShowEnableDialog(false)}
          submitting={enabling}
        />
      )}

      {pendingCandidate && (
        <AddParticipantDialog
          candidate={pendingCandidate}
          onConfirm={handleAddParticipant}
          onCancel={() => setPendingCandidate(null)}
          submitting={addingParticipant}
        />
      )}

      <div className="flex items-center gap-2">
        <div className="p-2 bg-purple-100 rounded-lg">
          <Lock size={16} className="text-[#6b2fa5]" />
        </div>
        <p className="text-sm font-bold text-gray-900">The Vault</p>
        {vault?.enabledVault ? (
          <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">
            <ShieldCheck size={11} /> Enabled
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-semibold">
            Not enabled
          </span>
        )}
        <WhatIsThisLink />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2">
          <AlertCircle size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* Not enabled yet — Creator-only setup card */}
      {!vault?.enabledVault && isOwner && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600 leading-relaxed">
            Require multi-party sign-off before any payout on this event can clear. You and any
            Admins you choose will each need to enter a personal Vault Key.
          </p>
          <button
            onClick={() => setShowEnableDialog(true)}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-[#6b2fa5] text-white hover:bg-[#5a2589] transition-colors flex items-center gap-2"
          >
            <Lock size={14} /> Enable The Vault
          </button>
        </div>
      )}

      {/* Enabled — participants + key setup */}
      {vault?.enabledVault && (
        <div className="space-y-4">
          <div className="space-y-2">
            {vault.participants.map((p) => (
              <div
                key={p.uid}
                className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {p.isCreator ? (
                    <Crown size={14} className="text-amber-500 flex-shrink-0" />
                  ) : (
                    <Shield size={14} className="text-purple-500 flex-shrink-0" />
                  )}
                  <span className="text-sm text-gray-800 truncate">
                    {p.uid === currentUserId ? "You" : p.email || p.uid}
                  </span>
                  {p.isCreator && (
                    <span className="text-[10px] uppercase tracking-wide text-amber-600 font-semibold">
                      Creator
                    </span>
                  )}
                </div>
                {p.hasSetKey ? (
                  <span className="inline-flex items-center gap-1 text-xs text-green-600 font-semibold flex-shrink-0">
                    <Check size={12} /> Key set
                  </span>
                ) : (
                  <span className="text-xs text-amber-600 font-semibold flex-shrink-0">
                    Key pending
                  </span>
                )}
              </div>
            ))}
          </div>

          {myParticipant && !myParticipant.hasSetKey && (
            <SetVaultKeyFormBound eventId={eventId} onSet={fetchVault} />
          )}

          {isOwner && (
            <div className="space-y-2">
              <button
                onClick={openAddPicker}
                className="text-sm font-semibold text-[#6b2fa5] hover:text-[#5a2589] flex items-center gap-1.5"
              >
                <UserPlus size={14} /> Add an Admin to the Vault
              </button>

              {showAddPicker && (
                <div className="border border-gray-200 rounded-lg p-3 space-y-2">
                  {adminCandidates.length === 0 ? (
                    <p className="text-xs text-gray-400">
                      No eligible Admins to add — either there are none, or all Admins are already
                      in the Vault.
                    </p>
                  ) : (
                    adminCandidates.map((c) => (
                      <button
                        key={c.collaboratorId}
                        onClick={() => setPendingCandidate(c)}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg hover:bg-purple-50 transition-colors text-left"
                      >
                        <span className="text-sm text-gray-800 truncate">
                          {c.displayName || c.collaboratorEmail}
                        </span>
                        <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />
                      </button>
                    ))
                  )}
                  <button
                    onClick={() => setShowAddPicker(false)}
                    className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                  >
                    <X size={12} /> Close
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Small wrapper so SetVaultKeyForm (which posts eventId via closure) gets the
// real eventId instead of the placeholder used in its standalone definition.
function SetVaultKeyFormBound({ eventId, onSet }: { eventId: string; onSet: () => void }) {
  const [key, setKey] = useState("")
  const [confirmKey, setConfirmKey] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    setError(null)
    if (key.length < 6) return setError("Vault Key must be at least 6 characters")
    if (key !== confirmKey) return setError("Keys do not match")

    setSubmitting(true)
    try {
      const res = await fetch("/api/payout/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, action: "setKey", vaultKey: key }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to set Vault Key")
      setKey("")
      setConfirmKey("")
      onSet()
    } catch (err: any) {
      setError(err.message || "Failed to set Vault Key")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <KeyRound size={16} className="text-[#6b2fa5]" />
        <p className="text-sm font-semibold text-purple-900">Set your Vault Key</p>
      </div>
      <p className="text-xs text-purple-700">
        You'll need to enter this key every time a payout on this event awaits Vault sign-off.
        Choose something only you know — it can't be recovered if lost.
      </p>
      <div className="grid sm:grid-cols-2 gap-2">
        <input
          type="password"
          placeholder="Vault Key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="px-3 py-2 rounded-lg border border-purple-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6b2fa5]"
        />
        <input
          type="password"
          placeholder="Confirm Vault Key"
          value={confirmKey}
          onChange={(e) => setConfirmKey(e.target.value)}
          className="px-3 py-2 rounded-lg border border-purple-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6b2fa5]"
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        onClick={handleSubmit}
        disabled={submitting || !key || !confirmKey}
        className="w-full py-2 rounded-lg text-sm font-semibold bg-[#6b2fa5] text-white hover:bg-[#5a2589] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {submitting ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
        {submitting ? "Saving..." : "Set Vault Key"}
      </button>
    </div>
  )
}
