"use client"

/**
 * app/elections/[electionId]/components/EditElectionDialog.tsx
 *
 * Replaces the old EditGraceControl.tsx (delete that file — this is a
 * superset of it, same PATCH endpoint, same edit_grace_days behaviour).
 *
 * Lets the organiser edit this election's own details after creation:
 * name, description, the voting window (start/end), and the candidate
 * edit-grace window. Opened from a pencil icon next to the election
 * title on the dashboard shell (see ../page.tsx).
 *
 * Adjusting editGraceDays retroactively changes the deadline for every
 * candidate already registered — the deadline is always computed as
 * candidate.created_at + edit_grace_days (see spotix-vote's
 * lib/election/edit.ts), not frozen per-candidate at submission time.
 */

import { useState } from "react"
import { Pencil, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ResponsiveSheet } from "@/components/ui/responsive-sheet"

interface ElectionForEdit {
  name: string
  description?: string | null
  voting_starts_at?: string | null
  voting_ends_at?: string | null
  edit_grace_days?: number | null
}

/** ISO timestamp → the local "YYYY-MM-DDTHH:mm" value a datetime-local input wants (empty string if unset). */
function toDatetimeLocalValue(iso?: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function EditElectionButton({
  electionId,
  election,
  onSaved,
}: {
  electionId: string
  election: ElectionForEdit
  onSaved: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Edit election details"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition-colors hover:border-[#6b2fa5] hover:text-[#6b2fa5]"
      >
        <Pencil size={14} />
      </button>
      {open && (
        <EditElectionDialog
          electionId={electionId}
          election={election}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false)
            onSaved()
          }}
        />
      )}
    </>
  )
}

function EditElectionDialog({
  electionId,
  election,
  onClose,
  onSaved,
}: {
  electionId: string
  election: ElectionForEdit
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(election.name ?? "")
  const [description, setDescription] = useState(election.description ?? "")
  const [votingStartsAt, setVotingStartsAt] = useState(toDatetimeLocalValue(election.voting_starts_at))
  const [votingEndsAt, setVotingEndsAt] = useState(toDatetimeLocalValue(election.voting_ends_at))
  const [registrationStartsAt, setRegistrationStartsAt] = useState(toDatetimeLocalValue(election.registration_starts_at))
  const [registrationEndsAt, setRegistrationEndsAt] = useState(toDatetimeLocalValue(election.registration_ends_at))
  const [editGraceDays, setEditGraceDays] = useState(String(election.edit_grace_days ?? 0))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!name.trim()) {
      setError("Election name can't be empty")
      return
    }
    const graceValue = Number(editGraceDays)
    if (!Number.isInteger(graceValue) || graceValue < 0) {
      setError("Candidate edit window must be a whole number of days, 0 or more")
      return
    }

    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/elections/${electionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          votingStartsAt: votingStartsAt ? new Date(votingStartsAt).toISOString() : null,
          votingEndsAt: votingEndsAt ? new Date(votingEndsAt).toISOString() : null,
          registrationStartsAt: registrationStartsAt ? new Date(registrationStartsAt).toISOString() : null,
          registrationEndsAt: registrationEndsAt ? new Date(registrationEndsAt).toISOString() : null,
          editGraceDays: graceValue,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to update election")
      onSaved()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ResponsiveSheet
      open
      onClose={onClose}
      title="Edit election details"
      size="md"
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      }
    >
    <div className="flex flex-col gap-3">
      <label className="text-xs font-medium text-gray-500">
        Election name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#6b2fa5]"
        />
      </label>

      <label className="text-xs font-medium text-gray-500">
        Description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Optional"
          className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#6b2fa5]"
        />
      </label>

      <div className="flex flex-col sm:flex-row gap-3">
        <label className="flex-1 text-xs font-medium text-gray-500">
          Voting starts
          <input
            type="datetime-local"
            value={votingStartsAt}
            onChange={(e) => setVotingStartsAt(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#6b2fa5]"
          />
        </label>
        <label className="flex-1 text-xs font-medium text-gray-500">
          Voting ends
          <input
            type="datetime-local"
            value={votingEndsAt}
            onChange={(e) => setVotingEndsAt(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#6b2fa5]"
          />
        </label>
      </div>
      {(votingStartsAt || votingEndsAt) && (
        <button
          type="button"
          onClick={() => {
            setVotingStartsAt("")
            setVotingEndsAt("")
          }}
          className="self-start text-xs text-red-500"
        >
          Clear voting window
        </button>
      )}

      <div className="mt-1 flex flex-col sm:flex-row gap-3">
        <label className="flex-1 text-xs font-medium text-gray-500">
          Registration opens
          <input
            type="datetime-local"
            value={registrationStartsAt}
            onChange={(e) => setRegistrationStartsAt(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#6b2fa5]"
          />
        </label>
        <label className="flex-1 text-xs font-medium text-gray-500">
          Registration closes
          <input
            type="datetime-local"
            value={registrationEndsAt}
            onChange={(e) => setRegistrationEndsAt(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#6b2fa5]"
          />
        </label>
      </div>
      <p className="text-[11px] text-gray-400">
        Leave either blank for no limit on that end. Candidate registration always closes once voting starts,
        even with no closing date set here.
      </p>
      {(registrationStartsAt || registrationEndsAt) && (
        <button
          type="button"
          onClick={() => {
            setRegistrationStartsAt("")
            setRegistrationEndsAt("")
          }}
          className="self-start text-xs text-red-500"
        >
          Clear registration window
        </button>
      )}

      <label className="text-xs font-medium text-gray-500">
        Candidate edit window (days after submitting, 0 = no edits allowed)
        <input
          type="number"
          min={0}
          value={editGraceDays}
          onChange={(e) => setEditGraceDays(e.target.value)}
          className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#6b2fa5]"
        />
      </label>
    </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </ResponsiveSheet>
  )
}
