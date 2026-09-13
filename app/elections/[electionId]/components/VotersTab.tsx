"use client"

/**
 * app/elections/[electionId]/components/VotersTab.tsx
 *
 * Two-stage flow, enforced by the API itself (not just the UI):
 *   1. Configure the custom fields this voter list needs (once — see
 *      /api/elections/[id]/voter-fields, blocked after any voter exists)
 *   2. Upload voters — CSV (which must contain those fields as columns,
 *      plus email/name) or manual entry (same fields required per row)
 *
 * The "Add manually" mode lets the organiser stage several rows — each
 * with the same custom fields the CSV template asks for — before saving
 * them all in one POST (mode: "manual", same /voters endpoint the CSV
 * path uses, same per-election field-spec validation server-side).
 *
 * CSV uploads go through a raw XMLHttpRequest instead of fetch so we can
 * read real upload-progress events (xhr.upload.onprogress) and drive an
 * actual percentage meter — fetch has no upload-progress hook for a
 * same-origin POST like this.
 */

import { useEffect, useMemo, useState } from "react"
import { UploadCloud, FileDown, Plus, Trash2, Users2, Check, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "../../components/Skeleton"

interface FieldSpec {
  key: string
  label: string
  required: boolean
}

type EntryMode = "csv" | "manual"

/** POSTs JSON to `url` via XHR so upload progress (0-100) can be reported as the body streams out. */
function postWithProgress(url: string, body: unknown, onProgress: (pct: number) => void): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", url)
    xhr.setRequestHeader("Content-Type", "application/json")
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      let data: any = null
      try {
        data = JSON.parse(xhr.responseText)
      } catch {
        // leave data null — caller treats a non-OK status with no body as a generic failure
      }
      resolve({ status: xhr.status, data })
    }
    xhr.onerror = () => reject(new Error("Network error during upload"))
    xhr.send(JSON.stringify(body))
  })
}

export function VotersTab({ electionId }: { electionId: string }) {
  const [fields, setFields] = useState<FieldSpec[] | null>(null)
  const [loadingFields, setLoadingFields] = useState(true)
  const [voters, setVoters] = useState<any[]>([])
  const [mode, setMode] = useState<EntryMode>("csv")

  // CSV upload state
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [uploadResult, setUploadResult] = useState<string | null>(null)
  const [errorDetails, setErrorDetails] = useState<string[] | null>(null)
  const [rejectedRowsCsv, setRejectedRowsCsv] = useState<string | null>(null)

  function loadFields() {
    setLoadingFields(true)
    fetch(`/api/elections/${electionId}/voter-fields`)
      .then((r) => r.json())
      .then((d) => setFields(d.fields))
      .finally(() => setLoadingFields(false))
  }
  function loadVoters() {
    fetch(`/api/elections/${electionId}/voters`)
      .then((r) => r.json())
      .then((d) => setVoters(d.voters ?? []))
  }

  useEffect(() => {
    loadFields()
    loadVoters()
  }, [electionId])

  if (loadingFields) {
    return (
      <div>
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="mt-4 h-10 w-40 rounded-2xl" />
      </div>
    )
  }

  if (fields === null) {
    return <FieldSpecSetup electionId={electionId} onSaved={loadFields} />
  }

  async function handleCsvUpload(file: File) {
    const csvText = await file.text()
    setUploadResult(null)
    setErrorDetails(null)
    setRejectedRowsCsv(null)
    setUploadProgress(0)
    try {
      const { status, data } = await postWithProgress(
        `/api/elections/${electionId}/voters`,
        { mode: "csv", csvText },
        setUploadProgress
      )
      if (status < 200 || status >= 300) {
        setErrorDetails(data?.details ?? [data?.error ?? "Upload failed"])
        return
      }
      const skippedNote = data.skipped.length > 0 ? `, ${data.skipped.length} already existed` : ""
      const rejectedNote =
        data.rejectedCount > 0 ? `, ${data.rejectedCount} row(s) had problems — download them below to fix and re-upload` : ""
      setUploadResult(`${data.inserted} voter(s) added${skippedNote}${rejectedNote}.`)
      if (data.rejectedRowsCsv) setRejectedRowsCsv(data.rejectedRowsCsv)
      loadVoters()
    } catch (err: any) {
      setErrorDetails([err.message ?? "Upload failed"])
    } finally {
      // Briefly leave the completed bar on screen instead of snapping it away.
      setTimeout(() => setUploadProgress(null), 600)
    }
  }

  function csvCell(value: string) {
    // Quote any cell that needs it (comma, quote, or newline), doubling internal quotes.
    return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
  }

  function downloadTemplate() {
    const columns = ["email", "name", ...(fields ?? []).map((f) => f.key)]
    const exampleRow = ["voter@example.com", "Jane Doe", ...(fields ?? []).map((f) => (f.required ? `example ${f.label || f.key}` : ""))]
    const csv = [columns.map(csvCell).join(","), exampleRow.map(csvCell).join(",")].join("\n")

    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "voters-template.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  function downloadRejectedRows() {
    if (!rejectedRowsCsv) return
    const blob = new Blob([rejectedRowsCsv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "rejected-voter-rows.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="rounded-2xl border border-gray-200 p-4">
        <p className="text-sm font-medium text-gray-700">Required fields for this election's voter list</p>
        <p className="mt-1 text-xs text-gray-500">
          email, name{fields.length > 0 && `, ${fields.map((f) => f.key).join(", ")}`} — every voter, whether uploaded or typed in, must
          include these.
        </p>
      </div>

      {/* Mode switch */}
      <div className="mt-4 inline-flex rounded-xl bg-gray-100 p-1">
        <button
          onClick={() => setMode("csv")}
          className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
            mode === "csv" ? "bg-white text-[#6b2fa5] shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Upload CSV
        </button>
        <button
          onClick={() => setMode("manual")}
          className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
            mode === "manual" ? "bg-white text-[#6b2fa5] shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Add manually
        </button>
      </div>

      {mode === "csv" && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-3">
            <label
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-2xl bg-[#6b2fa5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5b2490] ${
                uploadProgress !== null ? "pointer-events-none opacity-60" : ""
              }`}
            >
              <UploadCloud size={15} />
              Upload CSV
              <input
                type="file"
                accept=".csv"
                className="hidden"
                disabled={uploadProgress !== null}
                onChange={(e) => e.target.files?.[0] && handleCsvUpload(e.target.files[0])}
              />
            </label>
            <button
              onClick={downloadTemplate}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:border-[#6b2fa5] hover:text-[#6b2fa5]"
            >
              <FileDown size={15} />
              Download CSV template
            </button>
            <span className="text-xs text-gray-500">
              Columns: email, name{fields.length > 0 && `, ${fields.map((f) => f.key).join(", ")}`}
            </span>
          </div>

          {uploadProgress !== null && (
            <div className="mt-3">
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-[#6b2fa5] transition-all duration-150 ease-out"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {uploadProgress >= 100 ? "Processing…" : `Uploading… ${uploadProgress}%`}
              </p>
            </div>
          )}

          {uploadResult && <p className="mt-3 text-sm text-green-700">{uploadResult}</p>}
          {rejectedRowsCsv && (
            <button onClick={downloadRejectedRows} className="mt-1 text-sm text-[#6b2fa5] underline">
              Download rejected rows CSV
            </button>
          )}
          {errorDetails && (
            <ul className="mt-3 list-disc pl-5 text-sm text-red-600">
              {errorDetails.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {mode === "manual" && (
        <ManualEntryForm
          electionId={electionId}
          fields={fields}
          onSaved={() => {
            loadVoters()
          }}
        />
      )}

      <VoterListSection voters={voters} fields={fields} />
    </div>
  )
}

const VOTERS_PAGE_SIZE = 20

/**
 * Search + paginated table for the uploaded voter list. Search runs
 * against the full in-memory `voters` array (name, email, phone, and
 * every custom-field value) — the /voters endpoint already returns the
 * whole list in one GET, so this filters client-side rather than
 * round-tripping to the server per keystroke. Pagination (20/page) is
 * applied AFTER the search filter, so searching always looks across
 * every voter, not just the current page, and resets back to page 1
 * whenever the query changes.
 */
function VoterListSection({ voters, fields }: { voters: any[]; fields: FieldSpec[] }) {
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return voters
    return voters.filter((v) => {
      const haystack = [v.name, v.email, v.phone, ...Object.values(v.meta ?? {})]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [voters, query])

  useEffect(() => {
    setPage(1)
  }, [query])

  const totalPages = Math.max(1, Math.ceil(filtered.length / VOTERS_PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = filtered.slice((currentPage - 1) * VOTERS_PAGE_SIZE, currentPage * VOTERS_PAGE_SIZE)

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
          <Users2 size={15} className="text-gray-400" />
          {voters.length} voter(s) uploaded
        </p>
        <div className="relative w-full sm:w-64">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, phone…"
            className="w-full rounded-xl border border-gray-300 py-2 pl-8 pr-3 text-sm outline-none focus:border-[#6b2fa5]"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">{voters.length === 0 ? "No voters yet." : "No voters match your search."}</p>
      ) : (
        <>
          <div className="mt-3 overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Email</th>
                  <th className="px-4 py-2.5">Phone</th>
                  {fields.map((f) => (
                    <th key={f.key} className="px-4 py-2.5">
                      {f.label || f.key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pageItems.map((v) => (
                  <tr key={v.id}>
                    <td className="px-4 py-2.5 font-medium text-gray-900">{v.name}</td>
                    <td className="px-4 py-2.5 text-gray-600">{v.email}</td>
                    <td className="px-4 py-2.5 text-gray-600">{v.phone || "—"}</td>
                    {fields.map((f) => (
                      <td key={f.key} className="px-4 py-2.5 text-gray-600">
                        {v.meta?.[f.key] || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
            <span>
              Showing {(currentPage - 1) * VOTERS_PAGE_SIZE + 1}–{Math.min(currentPage * VOTERS_PAGE_SIZE, filtered.length)} of{" "}
              {filtered.length}
              {query && ` (filtered from ${voters.length})`}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="rounded-lg border border-gray-300 px-2.5 py-1 font-medium text-gray-600 hover:border-[#6b2fa5] hover:text-[#6b2fa5] disabled:opacity-40 disabled:hover:border-gray-300 disabled:hover:text-gray-600"
              >
                Previous
              </button>
              <span>
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="rounded-lg border border-gray-300 px-2.5 py-1 font-medium text-gray-600 hover:border-[#6b2fa5] hover:text-[#6b2fa5] disabled:opacity-40 disabled:hover:border-gray-300 disabled:hover:text-gray-600"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

interface ManualRow {
  email: string
  name: string
  phone: string
  meta: Record<string, string>
}

function blankRow(fields: FieldSpec[]): ManualRow {
  return { email: "", name: "", phone: "", meta: Object.fromEntries(fields.map((f) => [f.key, ""])) }
}

function ManualEntryForm({ electionId, fields, onSaved }: { electionId: string; fields: FieldSpec[]; onSaved: () => void }) {
  const [rows, setRows] = useState<ManualRow[]>([blankRow(fields)])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string[] | null>(null)
  const [savedCount, setSavedCount] = useState<number | null>(null)

  function updateRow(i: number, patch: Partial<ManualRow>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)))
  }
  function updateMeta(i: number, key: string, value: string) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, meta: { ...row.meta, [key]: value } } : row)))
  }
  function addRow() {
    setRows((r) => [...r, blankRow(fields)])
  }
  function removeRow(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i))
  }

  async function handleSave() {
    setError(null)
    setSavedCount(null)

    const nonEmptyRows = rows.filter((r) => r.email.trim() || r.name.trim())
    if (nonEmptyRows.length === 0) {
      setError(["Add at least one voter"])
      return
    }

    const clientErrors: string[] = []
    nonEmptyRows.forEach((r, i) => {
      if (!r.email.trim()) clientErrors.push(`Row ${i + 1}: email is required`)
      if (!r.name.trim()) clientErrors.push(`Row ${i + 1}: name is required`)
      fields.forEach((f) => {
        if (f.required && !r.meta[f.key]?.trim()) clientErrors.push(`Row ${i + 1}: "${f.label}" is required`)
      })
    })
    if (clientErrors.length > 0) {
      setError(clientErrors)
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/elections/${electionId}/voters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "manual", voters: nonEmptyRows }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.details?.join(", ") ?? data.error ?? "Failed to add voters")
      setSavedCount(data.inserted)
      setRows([blankRow(fields)])
      onSaved()
    } catch (err: any) {
      setError([err.message])
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4">
      <div className="flex flex-col gap-3">
        {rows.map((row, i) => (
          <div key={i} className="rounded-xl border border-gray-200 p-3">
            <div className="flex items-start gap-2">
              <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  placeholder="Email"
                  value={row.email}
                  onChange={(e) => updateRow(i, { email: e.target.value })}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#6b2fa5]"
                />
                <input
                  placeholder="Full name"
                  value={row.name}
                  onChange={(e) => updateRow(i, { name: e.target.value })}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#6b2fa5]"
                />
                <input
                  placeholder="Phone (optional)"
                  value={row.phone}
                  onChange={(e) => updateRow(i, { phone: e.target.value })}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#6b2fa5]"
                />
                {fields.map((f) => (
                  <input
                    key={f.key}
                    placeholder={f.required ? `${f.label} *` : `${f.label} (optional)`}
                    value={row.meta[f.key] ?? ""}
                    onChange={(e) => updateMeta(i, f.key, e.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#6b2fa5]"
                  />
                ))}
              </div>
              {rows.length > 1 && (
                <button onClick={() => removeRow(i)} className="mt-1 shrink-0 text-gray-400 hover:text-red-500" title="Remove row">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button onClick={addRow} className="inline-flex items-center gap-1 text-sm font-medium text-[#6b2fa5]">
          <Plus size={15} />
          Add another row
        </button>
        <Button onClick={handleSave} disabled={saving}>
          {saving
            ? "Saving…"
            : `Save ${rows.filter((r) => r.email.trim() || r.name.trim()).length} voter(s)`}
        </Button>
      </div>

      {savedCount !== null && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-green-700">
          <Check size={15} />
          {savedCount} voter(s) added.
        </p>
      )}
      {error && (
        <ul className="mt-3 list-disc pl-5 text-sm text-red-600">
          {error.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FieldSpecSetup({ electionId, onSaved }: { electionId: string; onSaved: () => void }) {
  const [fields, setFields] = useState<FieldSpec[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addField() {
    setFields((f) => [...f, { key: "", label: "", required: true }])
  }
  function updateField(i: number, patch: Partial<FieldSpec>) {
    setFields((f) => f.map((item, idx) => (idx === i ? { ...item, ...patch } : item)))
  }
  function removeField(i: number) {
    setFields((f) => f.filter((_, idx) => idx !== i))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/elections/${electionId}/voter-fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to save")
      onSaved()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 p-5">
      <p className="text-sm font-medium text-gray-900">Before uploading any voters, specify the extra fields you'll need</p>
      <p className="mt-1 text-xs text-gray-500">Every voter list already includes email and name — add any extras (e.g. matric number, department).</p>

      <div className="mt-4 flex flex-col gap-2">
        {fields.map((f, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              placeholder="key (e.g. matric_no)"
              value={f.key}
              onChange={(e) => updateField(i, { key: e.target.value })}
              className="w-32 rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#6b2fa5]"
            />
            <input
              placeholder="Label shown on CSV"
              value={f.label}
              onChange={(e) => updateField(i, { label: e.target.value })}
              className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#6b2fa5]"
            />
            <label className="flex items-center gap-1 text-xs text-gray-500">
              <input type="checkbox" checked={f.required} onChange={(e) => updateField(i, { required: e.target.checked })} />
              Required
            </label>
            <button onClick={() => removeField(i)} className="text-xs text-red-500">
              Remove
            </button>
          </div>
        ))}
        <button onClick={addField} className="self-start text-xs text-[#6b2fa5]">
          + Add field
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-4">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : fields.length === 0 ? "No extra fields needed — continue" : "Save fields & continue"}
        </Button>
      </div>
    </div>
  )
}
