"use client"

/**
 * app/elections/page.tsx
 *
 * Elections list + create dialog. Matches the purple/white styling
 * used across Booker (see components/ui/button.tsx).
 */

import { useEffect, useState, type MouseEvent } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ResponsiveSheet } from "@/components/ui/responsive-sheet"
import { Skeleton } from "./components/Skeleton"
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning"
import { UnsavedChangesDialog } from "@/components/ui/unsaved-changes-dialog"

interface Election {
  id: string
  name: string
  status: "draft" | "scheduled" | "active" | "ended"
  results_published: boolean
  voting_starts_at: string | null
  voting_ends_at: string | null
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  scheduled: "bg-blue-100 text-blue-700",
  active: "bg-green-100 text-green-700",
  ended: "bg-gray-200 text-gray-500",
}

export default function ElectionsPage() {
  const [elections, setElections] = useState<Election[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const voteAppUrl = process.env.NEXT_PUBLIC_VOTE_APP_URL ?? ""

  function reload() {
    setLoading(true)
    fetch("/api/elections")
      .then((r) => r.json())
      .then((d) => setElections(d.elections ?? []))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  async function handleCopyCandidateLink(e: MouseEvent, electionId: string) {
    e.preventDefault()
    e.stopPropagation()
    if (!voteAppUrl) return
    await navigator.clipboard.writeText(`${voteAppUrl}/election/${electionId}/office`)
    setCopiedId(electionId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Elections</h1>
        <Button onClick={() => setShowCreate(true)}>New election</Button>
      </div>

      {loading && (
        <div className="mt-6 flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="mt-2 h-3 w-56" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && elections.length === 0 && (
        <div className="mt-10 rounded-2xl border border-dashed border-gray-300 p-8 text-center text-gray-500">
          No elections yet. Create one to let candidates contest and voters cast ballots.
        </div>
      )}

      <ul className="mt-6 flex flex-col gap-3">
        {!loading &&
          elections.map((e) => (
          <li key={e.id}>
            <Link
              href={`/elections/${e.id}`}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-2xl border border-gray-200 p-4 hover:border-[#6b2fa5]"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-gray-900">{e.name}</p>
                {e.voting_starts_at && (
                  <p className="text-xs text-gray-500">
                    Voting: {new Date(e.voting_starts_at).toLocaleString()}
                    {e.voting_ends_at && ` – ${new Date(e.voting_ends_at).toLocaleString()}`}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {e.results_published && (
                  <span className="shrink-0 rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-[#6b2fa5]">Published</span>
                )}
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium capitalize ${STATUS_STYLES[e.status]}`}>{e.status}</span>
                {voteAppUrl && (
                  <button
                    onClick={(ev) => handleCopyCandidateLink(ev, e.id)}
                    title="Copy the auth-free candidate registration link"
                    className="shrink-0 rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:border-[#6b2fa5] hover:text-[#6b2fa5]"
                  >
                    {copiedId === e.id ? "Copied!" : "Copy candidate link"}
                  </button>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {showCreate && (
        <CreateElectionDialog
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            reload()
          }}
        />
      )}
    </main>
  )
}

function CreateElectionDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [votingStartsAt, setVotingStartsAt] = useState("")
  const [votingEndsAt, setVotingEndsAt] = useState("")
  const [editGraceDays, setEditGraceDays] = useState("0")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Same "leave without saving?" protection as create-event and poll
  // create/edit — see item 8 of the UI renovation.
  const isDirty = Boolean(
    name.trim() || description.trim() || votingStartsAt || votingEndsAt || editGraceDays !== "0"
  )
  const { showConfirmDialog, confirmLeave, cancelLeave, guardNavigation } = useUnsavedChangesWarning(isDirty)

  async function handleCreate() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/elections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          votingStartsAt: votingStartsAt ? new Date(votingStartsAt).toISOString() : null,
          votingEndsAt: votingEndsAt ? new Date(votingEndsAt).toISOString() : null,
          editGraceDays: Number(editGraceDays) || 0,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to create election")
      onCreated()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <UnsavedChangesDialog open={showConfirmDialog} onConfirm={confirmLeave} onCancel={cancelLeave} />
      <ResponsiveSheet
        open
        onClose={() => guardNavigation(onClose)()}
        title="New election"
        size="md"
        footer={
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="ghost" onClick={() => guardNavigation(onClose)()}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={saving || !name.trim()}>
              {saving ? "Creating…" : "Create"}
            </Button>
          </div>
        }
      >
    <div className="flex flex-col gap-3">
      <input
        placeholder="Election name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#6b2fa5]"
      />
      <textarea
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#6b2fa5]"
      />
      <label className="text-xs text-gray-500">
        Voting starts
        <input
          type="datetime-local"
          value={votingStartsAt}
          onChange={(e) => setVotingStartsAt(e.target.value)}
          className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#6b2fa5]"
        />
      </label>
      <label className="text-xs text-gray-500">
        Voting ends
        <input
          type="datetime-local"
          value={votingEndsAt}
          onChange={(e) => setVotingEndsAt(e.target.value)}
          className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#6b2fa5]"
        />
      </label>
      <label className="text-xs text-gray-500">
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

    {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </ResponsiveSheet>
    </>
  )
}
