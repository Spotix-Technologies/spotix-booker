"use client"

/**
 * app/elections/[electionId]/components/AllowVoterPrefillCard.tsx
 *
 * "Allow Voters Pre-fill" — when the organiser turns this on, voters can
 * add themselves to this election's voter list from spotix-vote's
 * public /election/{electionId}/open page, filling in the same
 * email/name/phone + custom-field spec the organiser configured for
 * CSV/manual uploads (see FieldSpecSetup / VoterFieldSpec) — instead of
 * only ever being added by the organiser's own CSV upload or manual
 * entry above.
 *
 * PATCHes the same /api/elections/{electionId} endpoint
 * EditElectionDialog uses (allowVoterPrefill is in that route's
 * EDITABLE_FIELDS) — lives here in VotersTab rather than the edit
 * dialog since it's specifically about the voter list, not the
 * election's own name/dates/etc.
 */

import { useState } from "react"
import { UserPlus2, TriangleAlert, Loader2 } from "lucide-react"

const WARNING_TEXT =
  "This means voters can enter their own details by themselves. Ensure you set up policies to ensure only appropriate individuals vote. Spotix is not responsible for unauthorized voting as a result of doing this."

export function AllowVoterPrefillCard({
  electionId,
  allowVoterPrefill,
  onChanged,
}: {
  electionId: string
  allowVoterPrefill: boolean
  onChanged: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle(next: boolean) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/elections/${electionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowVoterPrefill: next }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to update")
      onChanged()
    } catch (e: any) {
      setError(e.message ?? "Failed to update")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mb-4 rounded-2xl border border-gray-200 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-2.5">
          <UserPlus2 size={16} className="mt-0.5 shrink-0 text-[#6b2fa5]" />
          <div>
            <p className="text-sm font-medium text-gray-700">Allow Voters Pre-fill</p>
            <p className="mt-0.5 text-xs text-gray-500">
              Let voters add themselves to this election's voter list instead of only
              via CSV or manual entry.
            </p>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={allowVoterPrefill}
          disabled={saving}
          onClick={() => toggle(!allowVoterPrefill)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
            allowVoterPrefill ? "bg-[#6b2fa5]" : "bg-gray-200"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
              allowVoterPrefill ? "translate-x-5" : "translate-x-0"
            }`}
          />
          {saving && <Loader2 size={12} className="absolute inset-0 m-auto animate-spin text-white" />}
        </button>
      </div>

      {allowVoterPrefill && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          <p>{WARNING_TEXT}</p>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}
