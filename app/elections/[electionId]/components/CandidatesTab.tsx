"use client"

/**
 * app/elections/[electionId]/components/CandidatesTab.tsx
 *
 * Read-only review of every registered candidate, grouped by office.
 * form_reference being present means they paid; null means the office
 * was free to contest.
 *
 * Each candidate row expands to show their answers to that office's
 * custom questions (multi_select rendered as a comma list) and, when
 * present, a "View bio data" button that exchanges the candidate's
 * stored storage path for a short-lived signed URL — the document
 * itself is never fetched or displayed inline here, just linked to,
 * since it's a private bucket and may not even be an image (PDFs are
 * allowed).
 */

import { useEffect, useState } from "react"
import Link from "next/link"

export function CandidatesTab({ electionId, offices }: { electionId: string; offices: any[] }) {
  const [candidates, setCandidates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/elections/${electionId}/candidates`)
      .then((r) => r.json())
      .then((d) => setCandidates(d.candidates ?? []))
      .finally(() => setLoading(false))
  }, [electionId])

  if (loading) return <p className="text-sm text-gray-500">Loading…</p>

  return (
    <div className="flex flex-col gap-6">
      {offices.map((office) => {
        const officeCandidates = candidates.filter((c) => c.office_id === office.id)
        const questions: any[] = office.election_office_questions ?? []
        return (
          <div key={office.id}>
            <div className="flex items-center gap-2">
              <p className="font-medium text-gray-900">{office.name}</p>
              {office.bio_data_required && (
                <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-[#6b2fa5]">
                  Bio data required
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500">{officeCandidates.length} candidate(s)</p>
            <ul className="mt-2 flex flex-col gap-2">
              {officeCandidates.map((c) => (
                <li key={c.id} className="rounded-xl border border-gray-200 p-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                      className="flex flex-1 items-center gap-3 text-left"
                    >
                      {c.photo_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.photo_url} alt={c.full_name} className="h-10 w-10 rounded-full object-cover" />
                      )}
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{c.full_name}</p>
                        <p className="text-xs text-gray-500">
                          {c.email} · {c.phone}
                        </p>
                      </div>
                      <span className="text-xs text-gray-400">{c.form_reference ? "Paid" : "Free"}</span>
                      <span className="text-sm font-medium text-gray-700">{c.vote_count} votes</span>
                    </button>
                    <Link
                      href={`/elections/${electionId}/candidates/${c.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:border-[#6b2fa5] hover:text-[#6b2fa5]"
                    >
                      View details
                    </Link>
                  </div>

                  {expanded === c.id && (
                    <CandidateDetail electionId={electionId} candidate={c} questions={questions} />
                  )}
                </li>
              ))}
              {officeCandidates.length === 0 && <p className="text-xs text-gray-400">No candidates yet.</p>}
            </ul>
          </div>
        )
      })}
      {offices.length === 0 && <p className="text-sm text-gray-500">Add offices first, then candidates will appear here as they register.</p>}
    </div>
  )
}

function formatAnswer(value: unknown): string {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—"
  if (typeof value === "string" && value.trim()) return value
  return "—"
}

function CandidateDetail({ electionId, candidate, questions }: { electionId: string; candidate: any; questions: any[] }) {
  const [bioDataUrl, setBioDataUrl] = useState<string | null>(null)
  const [bioDataLoading, setBioDataLoading] = useState(false)
  const [bioDataError, setBioDataError] = useState<string | null>(null)
  const answers: Record<string, unknown> = candidate.answers ?? {}

  async function viewBioData() {
    setBioDataLoading(true)
    setBioDataError(null)
    try {
      const res = await fetch(`/api/elections/${electionId}/candidates/${candidate.id}/bio-data`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Couldn't load the document")
      setBioDataUrl(data.url)
      window.open(data.url, "_blank", "noopener,noreferrer")
    } catch (err: any) {
      setBioDataError(err.message)
    } finally {
      setBioDataLoading(false)
    }
  }

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      {questions.length > 0 && (
        <dl className="flex flex-col gap-2">
          {questions.map((q) => (
            <div key={q.id}>
              <dt className="text-xs font-medium text-gray-500">{q.question_text}</dt>
              <dd className="text-sm text-gray-800">{formatAnswer(answers[q.id])}</dd>
            </div>
          ))}
        </dl>
      )}

      {candidate.bio_data_path && (
        <div className="mt-3 rounded-lg bg-purple-50 p-2.5">
          <button
            onClick={viewBioData}
            disabled={bioDataLoading}
            className="text-xs font-medium text-[#6b2fa5] disabled:opacity-50"
          >
            {bioDataLoading ? "Generating link…" : "View bio data document"}
          </button>
          <p className="mt-1 text-[11px] text-gray-500">
            Link expires in 10 minutes. Remember: this document is shared with you and deleted from Spotix's
            systems once the election ends.
          </p>
          {bioDataError && <p className="mt-1 text-xs text-red-600">{bioDataError}</p>}
          {bioDataUrl && (
            <a href={bioDataUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block text-[11px] text-gray-400 underline">
              Link didn&apos;t open automatically? Click here.
            </a>
          )}
        </div>
      )}

      {questions.length === 0 && !candidate.bio_data_path && (
        <p className="text-xs text-gray-400">No custom questions or bio data for this office.</p>
      )}
    </div>
  )
}
