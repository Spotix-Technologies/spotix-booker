"use client"

/**
 * app/elections/[electionId]/candidates/[candidateId]/page.tsx
 *
 * Full detail view for one candidate — the "View details" button on
 * CandidatesTab.tsx opens this in a new tab. Unlike the tab's inline
 * expand (a quick answers-only preview), this is the whole submission:
 * photo, contact info, every question answer, bio data document link,
 * and payment/status metadata — everything the organiser needs to
 * actually review a registration, in one page they can keep open
 * alongside the dashboard.
 */

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, FileText, Vote, Mail, Phone } from "lucide-react"
import { Skeleton } from "@/elections/components/Skeleton"

function fmtDate(iso?: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

function formatAnswer(value: unknown): string {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—"
  if (typeof value === "string" && value.trim()) return value
  return "—"
}

const EDIT_FIELD_LABELS: Record<string, string> = {
  fullName: "Full name",
  phone: "Phone",
  photo: "Photo",
  bioData: "Bio data document",
}

/** photo/bioData changes carry storage paths/URLs, not something worth dumping raw into the UI — just note that one was swapped in or removed. */
function formatEditValue(fieldKey: string, value: unknown): string {
  if (fieldKey === "photo" || fieldKey === "bioData") return value ? "Updated" : "Removed"
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—"
  if (typeof value === "string" && value.trim()) return value
  return "—"
}

export default function CandidateDetailPage() {
  const { electionId, candidateId } = useParams<{ electionId: string; candidateId: string }>()
  const [candidate, setCandidate] = useState<any>(null)
  const [office, setOffice] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [edits, setEdits] = useState<any[]>([])

  const [bioDataUrl, setBioDataUrl] = useState<string | null>(null)
  const [bioDataLoading, setBioDataLoading] = useState(false)
  const [bioDataError, setBioDataError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/elections/${electionId}/candidates/${candidateId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.error)
          return
        }
        setCandidate(d.candidate)
        setOffice(d.office)
      })
      .catch(() => setError("Failed to load this candidate."))
      .finally(() => setLoading(false))

    fetch(`/api/elections/${electionId}/candidates/${candidateId}/edits`)
      .then((r) => r.json())
      .then((d) => setEdits(d.edits ?? []))
      .catch(() => {
        // Non-critical — the rest of the page (the point of this route)
        // still works fine with no edit history shown.
      })
  }, [electionId, candidateId])

  async function viewBioData() {
    setBioDataLoading(true)
    setBioDataError(null)
    try {
      const res = await fetch(`/api/elections/${electionId}/candidates/${candidateId}/bio-data`)
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
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link href={`/elections/${electionId}`} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft size={15} /> Back to election
      </Link>

      {loading && <Skeleton className="mt-6 h-64 w-full" />}
      {!loading && error && <p className="mt-6 text-sm text-red-600">{error}</p>}

      {!loading && !error && candidate && (
        <div className="mt-6 flex flex-col gap-6">
          <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5">
            {candidate.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={candidate.photo_url} alt={candidate.full_name} className="h-16 w-16 rounded-full object-cover" />
            ) : (
              <div className="h-16 w-16 rounded-full bg-purple-100" />
            )}
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-semibold text-gray-900">{candidate.full_name}</h1>
              <p className="text-sm text-gray-500">{office?.name ?? "Unknown office"}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${candidate.form_reference ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                {candidate.form_reference ? "Paid" : "Free entry"}
              </span>
              <span className="flex items-center gap-1 text-sm font-medium text-gray-700">
                <Vote size={14} /> {candidate.vote_count ?? 0} votes
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <InfoRow icon={<Mail size={14} />} label="Email" value={candidate.email} />
            <InfoRow icon={<Phone size={14} />} label="Phone" value={candidate.phone} />
            <InfoRow label="Registered" value={fmtDate(candidate.created_at)} />
            <InfoRow label="Reference" value={candidate.form_reference ?? "—"} />
          </div>

          {office?.election_office_questions?.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-gray-900">Answers</h2>
              <dl className="mt-3 flex flex-col gap-3">
                {office.election_office_questions.map((q: any) => (
                  <div key={q.id}>
                    <dt className="text-xs font-medium text-gray-500">{q.question_text}</dt>
                    <dd className="mt-0.5 text-sm text-gray-800">{formatAnswer((candidate.answers ?? {})[q.id])}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {candidate.bio_data_path && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                <FileText size={15} /> Bio data document
              </h2>
              <button
                onClick={viewBioData}
                disabled={bioDataLoading}
                className="mt-2 rounded-lg bg-[#6b2fa5] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                {bioDataLoading ? "Generating link…" : "View document"}
              </button>
              <p className="mt-2 text-[11px] text-gray-500">
                Link expires in 10 minutes. This document is deleted from Spotix's systems once the election ends.
              </p>
              {bioDataError && <p className="mt-1 text-xs text-red-600">{bioDataError}</p>}
              {bioDataUrl && (
                <a href={bioDataUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block text-[11px] text-gray-400 underline">
                  Link didn&apos;t open automatically? Click here.
                </a>
              )}
            </div>
          )}

          {edits.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-gray-900">Edit history</h2>
              <div className="mt-3 flex flex-col gap-4">
                {edits.map((edit) => (
                  <div key={edit.id} className="border-l-2 border-purple-200 pl-3">
                    <p className="text-xs text-gray-500">{fmtDate(edit.edited_at)}</p>
                    <dl className="mt-1 flex flex-col gap-1">
                      {Object.entries(edit.changed_fields ?? {}).flatMap(([fieldKey, change]: [string, any]) => {
                        if (fieldKey === "answers") {
                          return Object.entries(change).map(([questionId, qChange]: [string, any]) => {
                            const question = office?.election_office_questions?.find((q: any) => q.id === questionId)
                            return (
                              <div key={questionId} className="text-sm">
                                <span className="font-medium text-gray-700">{question?.question_text ?? "A question"}: </span>
                                <span className="text-gray-400 line-through">{formatEditValue(fieldKey, qChange.from)}</span>
                                {" → "}
                                <span className="text-gray-800">{formatEditValue(fieldKey, qChange.to)}</span>
                              </div>
                            )
                          })
                        }
                        return (
                          <div key={fieldKey} className="text-sm">
                            <span className="font-medium text-gray-700">{EDIT_FIELD_LABELS[fieldKey] ?? fieldKey}: </span>
                            <span className="text-gray-400 line-through">{formatEditValue(fieldKey, change.from)}</span>
                            {" → "}
                            <span className="text-gray-800">{formatEditValue(fieldKey, change.to)}</span>
                          </div>
                        )
                      })}
                    </dl>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function InfoRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value?: string | null }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
        {icon} {label}
      </p>
      <p className="mt-0.5 truncate text-sm text-gray-800">{value || "—"}</p>
    </div>
  )
}
