"use client"

/**
 * app/elections/[electionId]/components/OfficesTab.tsx
 *
 * Create/edit offices (e.g. "President", "Secretary") with an optional
 * form fee, the custom questions candidates for that office must
 * answer (short/long text, single choice, or multiple choice — with an
 * options editor for the two choice types), and an optional "Bio Data
 * Upload" requirement for a qualifying document. Also surfaces the
 * direct candidate-registration link for each office.
 *
 * Editing reuses the same dialog as creating (OfficeFormDialog) with an
 * `office` prop; deleting is blocked server-side once an office has any
 * registered candidates (see deleteOffice in lib/election-db.ts) — the
 * UI surfaces that as a disabled Delete button with an explanatory title.
 */

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { ResponsiveSheet } from "@/components/ui/responsive-sheet"

type QuestionType = "short_text" | "long_text" | "select" | "multi_select"

interface Question {
  /** Present for an existing question (its election_office_questions.id) so updateOffice can update it in place instead of recreating it — see that function's comment for why this matters. Absent for a question just added in this dialog. */
  id?: string
  questionText: string
  questionType: QuestionType
  options?: string[]
  required: boolean
}

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  short_text: "Short text",
  long_text: "Long text",
  select: "Single choice",
  multi_select: "Multiple choice",
}

const CHOICE_TYPES: QuestionType[] = ["select", "multi_select"]

export function OfficesTab({ electionId, offices, onChanged }: { electionId: string; offices: any[]; onChanged: () => void }) {
  const [showCreate, setShowCreate] = useState(false)
  const [editingOffice, setEditingOffice] = useState<any | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)

  const voteAppUrl = process.env.NEXT_PUBLIC_VOTE_APP_URL ?? ""
  const registrationHubUrl = voteAppUrl ? `${voteAppUrl}/election/${electionId}/office` : ""

  async function handleCopyLink() {
    if (!registrationHubUrl) return
    await navigator.clipboard.writeText(registrationHubUrl)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  async function handleDelete(officeId: string) {
    if (!confirm("Delete this office? This can't be undone.")) return
    setDeletingId(officeId)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/elections/${electionId}/offices/${officeId}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to delete office")
      onChanged()
    } catch (err: any) {
      setDeleteError(err.message)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div>
      {/*
        ONE link candidates use to enlist for ANY office in this election —
        auth-free (see spotix-vote's app/election/[electionId]/office/page.tsx
        header comment), so it can go straight into a WhatsApp broadcast,
        flyer, or campus noticeboard without anyone needing a Spotix Vote
        account first. Per-office deep links below still work too, for an
        organiser who wants to advertise one specific office directly.
      */}
      <div className="mb-4 rounded-2xl border border-purple-200 bg-purple-50/60 p-4">
        <p className="text-sm font-medium text-gray-900">Candidate registration link</p>
        <p className="mt-1 text-xs text-gray-500">
          Share this with anyone who wants to contest — no sign-in needed. They&apos;ll see every open office and can
          register straight from there.
        </p>
        {registrationHubUrl ? (
          <div className="mt-2 flex min-w-0 items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-3 py-2 text-xs text-gray-700">{registrationHubUrl}</code>
            <button
              onClick={handleCopyLink}
              className="shrink-0 rounded-lg bg-[#6b2fa5] px-3 py-2 text-xs font-medium text-white hover:bg-[#5b2490]"
            >
              {linkCopied ? "Copied!" : "Copy link"}
            </button>
          </div>
        ) : (
          <p className="mt-2 text-xs text-red-500">Set NEXT_PUBLIC_VOTE_APP_URL to enable this link.</p>
        )}
      </div>

      <div className="flex justify-end">
        <Button onClick={() => setShowCreate(true)}>Add office</Button>
      </div>

      {deleteError && <p className="mt-3 text-sm text-red-600">{deleteError}</p>}

      <ul className="mt-4 flex flex-col gap-3">
        {offices.map((o) => {
          const isPaid = o.form_fee > 0
          const candidateCount = o.candidate_count ?? null
          return (
            <li
              key={o.id}
              className={`min-w-0 overflow-hidden rounded-2xl border p-4 ${isPaid ? "border-amber-200 bg-amber-50/40" : "border-green-200 bg-green-50/40"}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <p className="font-medium text-gray-900">{o.name}</p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      isPaid ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
                    }`}
                  >
                    {isPaid ? "Paid" : "Free"}
                  </span>
                  {o.bio_data_required && (
                    <span className="shrink-0 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-[#6b2fa5]">
                      Bio data required
                    </span>
                  )}
                  {o.form_sale_ends_at && <FormSaleCountdown endsAt={o.form_sale_ends_at} />}
                </div>
                <span className="shrink-0 text-sm text-gray-500">{isPaid ? `₦${o.form_fee.toLocaleString()} form fee` : "Free to contest"}</span>
              </div>
              {o.election_office_questions?.length > 0 && (
                <p className="mt-1 text-xs text-gray-500">{o.election_office_questions.length} candidate question(s)</p>
              )}
              {voteAppUrl && (
                <p className="mt-2 truncate text-xs text-gray-400">
                  {voteAppUrl}/election/{electionId}/office/{o.id}
                </p>
              )}
              <div className="mt-3 flex gap-3">
                <button onClick={() => setEditingOffice(o)} className="text-xs font-medium text-[#6b2fa5]">
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(o.id)}
                  disabled={deletingId === o.id}
                  title={candidateCount ? "Offices with registered candidates can't be deleted — edit it instead." : undefined}
                  className="text-xs font-medium text-red-500 disabled:opacity-50"
                >
                  {deletingId === o.id ? "Deleting…" : "Delete"}
                </button>
              </div>
            </li>
          )
        })}
        {offices.length === 0 && <p className="text-sm text-gray-500">No offices yet — add one to open contesting.</p>}
      </ul>

      {showCreate && (
        <OfficeFormDialog
          electionId={electionId}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false)
            onChanged()
          }}
        />
      )}
      {editingOffice && (
        <OfficeFormDialog
          electionId={electionId}
          office={editingOffice}
          onClose={() => setEditingOffice(null)}
          onSaved={() => {
            setEditingOffice(null)
            onChanged()
          }}
        />
      )}
    </div>
  )
}

/** ISO timestamp → the local "YYYY-MM-DDTHH:mm" value a datetime-local input wants (empty string if unset). */
function toDatetimeLocalValue(iso?: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Ticking "Sale of forms end in dd:hh:mm:ss" badge — updates every
 * second via setInterval. Same formatting spotix-vote's SaleCountdown
 * uses (see that file's header comment) so organisers and candidates
 * see identical wording, just on different sides of the same deadline.
 */
function FormSaleCountdown({ endsAt }: { endsAt: string }) {
  const [remainingMs, setRemainingMs] = useState(() => new Date(endsAt).getTime() - Date.now())

  useEffect(() => {
    const id = setInterval(() => setRemainingMs(new Date(endsAt).getTime() - Date.now()), 1000)
    return () => clearInterval(id)
  }, [endsAt])

  if (remainingMs <= 0) {
    return <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">Sale of forms ended</span>
  }

  const totalSeconds = Math.floor(remainingMs / 1000)
  const dd = Math.floor(totalSeconds / 86400)
  const hh = Math.floor((totalSeconds % 86400) / 3600)
  const mm = Math.floor((totalSeconds % 3600) / 60)
  const ss = totalSeconds % 60
  const pad = (n: number) => String(n).padStart(2, "0")

  return (
    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
      Sale of forms end in {pad(dd)}:{pad(hh)}:{pad(mm)}:{pad(ss)}
    </span>
  )
}

function questionsFromOffice(office: any | undefined): Question[] {
  if (!office?.election_office_questions) return []
  return [...office.election_office_questions]
    .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((q: any) => ({
      id: q.id,
      questionText: q.question_text,
      questionType: q.question_type,
      options: q.options ?? [],
      required: q.required,
    }))
}

function OfficeFormDialog({
  electionId,
  office,
  onClose,
  onSaved,
}: {
  electionId: string
  office?: any
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!office
  const [name, setName] = useState(office?.name ?? "")
  const [formFee, setFormFee] = useState(String(office?.form_fee ?? 0))
  const [seatsAvailable, setSeatsAvailable] = useState(String(office?.seats_available ?? 1))
  const [questions, setQuestions] = useState<Question[]>(questionsFromOffice(office))
  const [bioDataRequired, setBioDataRequired] = useState(!!office?.bio_data_required)
  const [bioDataLabel, setBioDataLabel] = useState(office?.bio_data_label ?? "")
  const [formSaleEndsAt, setFormSaleEndsAt] = useState(toDatetimeLocalValue(office?.form_sale_ends_at))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addQuestion() {
    setQuestions((q) => [...q, { questionText: "", questionType: "short_text", required: true, options: [] }])
  }
  function updateQuestion(i: number, patch: Partial<Question>) {
    setQuestions((q) => q.map((item, idx) => (idx === i ? { ...item, ...patch } : item)))
  }
  function removeQuestion(i: number) {
    setQuestions((q) => q.filter((_, idx) => idx !== i))
  }
  function addOption(i: number) {
    setQuestions((q) => q.map((item, idx) => (idx === i ? { ...item, options: [...(item.options ?? []), ""] } : item)))
  }
  function updateOption(i: number, optIdx: number, value: string) {
    setQuestions((q) =>
      q.map((item, idx) =>
        idx === i ? { ...item, options: (item.options ?? []).map((o, oi) => (oi === optIdx ? value : o)) } : item
      )
    )
  }
  function removeOption(i: number, optIdx: number) {
    setQuestions((q) =>
      q.map((item, idx) => (idx === i ? { ...item, options: (item.options ?? []).filter((_, oi) => oi !== optIdx) } : item))
    )
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const cleanQuestions = questions
        .filter((q) => q.questionText.trim())
        .map((q) => ({
          ...q,
          options: CHOICE_TYPES.includes(q.questionType) ? (q.options ?? []).map((o) => o.trim()).filter(Boolean) : undefined,
        }))

      for (const q of cleanQuestions) {
        if (CHOICE_TYPES.includes(q.questionType) && (q.options ?? []).length < 2) {
          throw new Error(`"${q.questionText}" needs at least 2 options`)
        }
      }
      if (bioDataRequired && !bioDataLabel.trim()) {
        throw new Error("Describe what candidates should upload as bio data")
      }

      const body = {
        name,
        formFee: Number(formFee) || 0,
        seatsAvailable: Number(seatsAvailable) || 1,
        questions: cleanQuestions,
        bioDataRequired,
        bioDataLabel: bioDataLabel.trim(),
        formSaleEndsAt: formSaleEndsAt ? new Date(formSaleEndsAt).toISOString() : null,
      }

      const res = await fetch(
        isEdit ? `/api/elections/${electionId}/offices/${office.id}` : `/api/elections/${electionId}/offices`,
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Failed to ${isEdit ? "update" : "create"} office`)
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
      title={isEdit ? "Edit office" : "Add office"}
      size="md"
      dismissible={!saving}
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create office"}
          </Button>
        </div>
      }
    >
    <div className="flex flex-col gap-3">
      <input
        placeholder="Office name, e.g. President"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#6b2fa5]"
      />
      <div className="flex flex-col sm:flex-row gap-3">
        <label className="flex-1 text-xs text-gray-500">
          Form fee (₦, 0 = free)
          <input
            type="number"
            min={0}
            value={formFee}
            onChange={(e) => setFormFee(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#6b2fa5]"
          />
        </label>
        <label className="flex-1 text-xs text-gray-500">
          Seats available
          <input
            type="number"
            min={1}
            value={seatsAvailable}
            onChange={(e) => setSeatsAvailable(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#6b2fa5]"
          />
        </label>
      </div>

      <div className="rounded-xl border border-gray-200 p-3">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input type="checkbox" checked={bioDataRequired} onChange={(e) => setBioDataRequired(e.target.checked)} />
          Require a bio data upload to contest
        </label>
        <p className="mt-1 text-xs text-gray-500">
          Candidates will upload a document to verify they qualify (e.g. a matric ID, admission letter). Spotix
          forwards it to you after the election ends and deletes it from our end.
        </p>
        {bioDataRequired && (
          <input
            placeholder='What should they upload? e.g. "Upload your matric ID card"'
            value={bioDataLabel}
            onChange={(e) => setBioDataLabel(e.target.value)}
            className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#6b2fa5]"
          />
        )}
      </div>

      <div className="rounded-xl border border-gray-200 p-3">
        <label className="text-sm font-medium text-gray-700">
          Form sale end date <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <p className="mt-1 text-xs text-gray-500">
          After this date and time, candidates can no longer register for this office. Leave blank to sell
          forms with no deadline.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="datetime-local"
            value={formSaleEndsAt}
            onChange={(e) => setFormSaleEndsAt(e.target.value)}
            className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#6b2fa5]"
          />
          {formSaleEndsAt && (
            <button type="button" onClick={() => setFormSaleEndsAt("")} className="text-xs text-red-500">
              Clear
            </button>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-gray-600">Candidate questions</p>
          <button onClick={addQuestion} className="text-xs text-[#6b2fa5]">
            + Add question
          </button>
        </div>
        <div className="mt-2 flex flex-col gap-3">
          {questions.map((q, i) => (
            <div key={i} className="rounded-xl border border-gray-200 p-3">
              <div className="flex items-center gap-2">
                <input
                  placeholder="Question text"
                  value={q.questionText}
                  onChange={(e) => updateQuestion(i, { questionText: e.target.value })}
                  className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#6b2fa5]"
                />
                <select
                  value={q.questionType}
                  onChange={(e) => updateQuestion(i, { questionType: e.target.value as QuestionType })}
                  className="rounded-xl border border-gray-300 px-2 py-2 text-xs"
                >
                  {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((t) => (
                    <option key={t} value={t}>
                      {QUESTION_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
                <button onClick={() => removeQuestion(i)} className="shrink-0 text-xs text-red-500">
                  Remove
                </button>
              </div>

              {CHOICE_TYPES.includes(q.questionType) && (
                <div className="mt-2 flex flex-col gap-1.5 pl-1">
                  {(q.options ?? []).map((opt, optIdx) => (
                    <div key={optIdx} className="flex items-center gap-2">
                      <input
                        placeholder={`Option ${optIdx + 1}`}
                        value={opt}
                        onChange={(e) => updateOption(i, optIdx, e.target.value)}
                        className="flex-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs outline-none focus:border-[#6b2fa5]"
                      />
                      <button onClick={() => removeOption(i, optIdx)} className="text-xs text-red-500">
                        ×
                      </button>
                    </div>
                  ))}
                  <button onClick={() => addOption(i)} className="self-start text-xs text-[#6b2fa5]">
                    + Add option
                  </button>
                </div>
              )}

              <label className="mt-2 flex items-center gap-1 text-xs text-gray-500">
                <input type="checkbox" checked={q.required} onChange={(e) => updateQuestion(i, { required: e.target.checked })} />
                Required
              </label>
            </div>
          ))}
        </div>
      </div>
    </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </ResponsiveSheet>
  )
}
