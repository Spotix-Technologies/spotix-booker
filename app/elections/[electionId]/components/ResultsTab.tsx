"use client"

/**
 * app/elections/[electionId]/components/ResultsTab.tsx
 *
 * This is the organiser-facing live counter the spec asked for — polls
 * /api/elections/[id]/tally every 4s and renders a recharts bar per
 * office. Always shows real numbers to the organiser, published or
 * not (see the note in the tally route on why this is intentionally
 * different from the public-facing one in spotix-vote).
 *
 * "Publish Results" is a two-step confirm: click → warning dialog
 * explaining it's irreversible and public → explicit second click.
 */

import { useEffect, useState } from "react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Button } from "@/components/ui/button"
import { useChartReady } from "@/hooks/useChartReady"
import { ResponsiveSheet } from "@/components/ui/responsive-sheet"

interface OfficeTally {
  officeId: string
  officeName: string
  candidates: { candidateId: string; fullName: string; voteCount: number }[]
}

export function ResultsTab({ electionId, offices, election, onPublished }: { electionId: string; offices: any[]; election: any; onPublished: () => void }) {
  // This tab only mounts once selected on the election page, so on
  // first paint the office cards' bar charts can measure a 0-width
  // parent and recharts logs the width(-1)/height(-1) warning. Wait
  // one tick after mount so ResponsiveContainer measures a laid-out DOM.
  const chartReady = useChartReady()
  const [tally, setTally] = useState<OfficeTally[]>([])
  const [tallyError, setTallyError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function poll() {
      try {
        const res = await fetch(`/api/elections/${electionId}/tally`)
        // A 500 (or any non-OK response) may not have a JSON body at all —
        // reading .json() unconditionally is what was throwing "Unexpected
        // end of JSON input" and crashing the poll loop outright.
        const data = await res.json().catch(() => null)
        if (cancelled) return
        if (!res.ok) {
          setTallyError(data?.error ?? "Couldn't refresh live results — retrying…")
          return
        }
        setTallyError(null)
        setTally(data?.tally ?? [])
      } catch {
        if (!cancelled) setTallyError("Couldn't refresh live results — retrying…")
      }
    }
    poll()
    const interval = setInterval(poll, 4000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [electionId])

  async function handlePublish() {
    setPublishing(true)
    setError(null)
    try {
      const res = await fetch(`/api/elections/${electionId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to publish")
      setConfirmOpen(false)
      onPublished()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div>
      {election.results_published ? (
        <p className="rounded-xl bg-purple-50 px-4 py-3 text-sm text-[#6b2fa5]">
          Results were published on {new Date(election.results_published_at).toLocaleString()}. All voters can now see them.
        </p>
      ) : (
        <div className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
          <p className="text-sm text-gray-600">Voters won't see any numbers until you publish.</p>
          <Button onClick={() => setConfirmOpen(true)}>Publish results</Button>
        </div>
      )}

      {tallyError && <p className="mt-3 text-xs text-amber-600">{tallyError}</p>}

      <div className="mt-6 flex flex-col gap-8">
        {tally.map((office) => (
          <div key={office.officeId} className="rounded-2xl border border-gray-200 p-4">
            <p className="font-medium text-gray-900">{office.officeName}</p>
            <div className="mt-3 h-56 w-full">
              {chartReady && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={office.candidates.map((c) => ({ name: c.fullName, votes: c.voteCount }))} layout="vertical" margin={{ left: 16, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={120} />
                    <Tooltip />
                    <Bar dataKey="votes" fill="#6b2fa5" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        ))}
      </div>

      <ResponsiveSheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        role="alertdialog"
        size="sm"
        dismissible={!publishing}
        title="Publish results?"
        footer={
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={publishing}>
              Cancel
            </Button>
            <Button onClick={handlePublish} disabled={publishing}>
              {publishing ? "Publishing…" : "Yes, publish results"}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-gray-600">
          This is <strong>irreversible</strong>. Once published, every voter and candidate will be able to see the final vote
          counts. There's no way to hide them again.
        </p>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </ResponsiveSheet>
    </div>
  )
}
