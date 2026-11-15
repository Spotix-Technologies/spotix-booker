"use client"

/**
 * app/campaign/sms/create/page.tsx
 *
 * Bulk SMS wizard: Details → Audience → Message → Review.
 *
 * Audience sources (merged + deduped on the normalised number):
 *   • the current event   — phone numbers on its successful ticket payment references
 *   • previous events     — same, for other events this booker owns
 *   • manual              — typed / pasted
 *   • spreadsheet         — CSV import
 *
 * Every value from every source goes through lib/sms-phone.ts: 11 digits,
 * +234 followed by 7/8/9, any letter flagged. Flagged contacts must be fixed
 * or removed before the booker can upload (the backend re-checks all of it).
 *
 * "Upload" on the review step sends the combined list to the backend, which
 * writes ONE .txt file (a number per line) to Supabase Storage, stores its url
 * on the sms_campaign row and reserves the SMS credits. An admin then approves
 * or rejects it; a rejected one can be reopened here with ?resendFrom=<id>.
 */

import { useEffect, useMemo, useRef, useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import {
  Loader2, ChevronLeft, ChevronRight, ArrowLeft, Check, Upload, Plus, X, AlertTriangle, Users, RotateCcw,
} from "lucide-react"
import { authFetch } from "@/lib/auth-client"
import { classifyNumbers, MAX_RECIPIENTS, MAX_SMS_MESSAGE_LENGTH, type SourcedNumber } from "@/lib/sms-phone"
import { parseSmsAudienceCsv } from "@/lib/sms-audience-csv"
import { formatCount } from "@/lib/naira"
import { BuySmsCreditsModal } from "@/components/campaigns/buy-sms-credits-modal"
import { PurchaseReceiptModal } from "@/components/campaigns/purchase-receipt"
import { clearRefFromUrl } from "@/lib/campaign-payment"

interface EventOption { id: string; eventName: string }

const STEPS = ["Details", "Audience", "Message", "Review"]
const SRC_CURRENT = "Current event"
const SRC_PREVIOUS = "Previous events"
const SRC_MANUAL = "Added manually"
const SRC_IMPORT = "Spreadsheet"

function splitNumbers(text: string): string[] {
  return text.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean)
}

function SmsCreateFlow() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialEventId = searchParams.get("eventId") || ""
  const resendFrom = searchParams.get("resendFrom") || ""
  // ?ref=… is put in the URL when a credit purchase starts. If the page
  // reloads (buyer paid in another app), show their receipt.
  const paymentRef = searchParams.get("ref") || ""
  const fileInputRef = useRef<HTMLInputElement>(null)
  const resendAppliedRef = useRef(false)

  const [step, setStep] = useState(1)
  const [events, setEvents] = useState<EventOption[]>([])
  const [eventId, setEventId] = useState(initialEventId)
  const [name, setName] = useState("")
  const [message, setMessage] = useState("")

  // Raw audience sources
  const [useCurrent, setUseCurrent] = useState(true)
  const [currentValues, setCurrentValues] = useState<string[]>([])
  const [currentLoaded, setCurrentLoaded] = useState<string | null>(null) // eventId the values belong to
  const [previousEventIds, setPreviousEventIds] = useState<string[]>([])
  const [previousValues, setPreviousValues] = useState<string[]>([])
  const [manualValues, setManualValues] = useState<string[]>([])
  const [manualInput, setManualInput] = useState("")
  const [importValues, setImportValues] = useState<string[]>([])
  const [importInfo, setImportInfo] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [resendValues, setResendValues] = useState<string[]>([])
  const [audienceLoading, setAudienceLoading] = useState(false)
  const [audienceError, setAudienceError] = useState<string | null>(null)

  // Curation
  const [ignoredRaw, setIgnoredRaw] = useState<string[]>([])      // flagged raw values the booker removed
  const [removedNumbers, setRemovedNumbers] = useState<string[]>([]) // clean numbers the booker removed
  const [fixInputs, setFixInputs] = useState<Record<string, string>>({})
  const [search, setSearch] = useState("")

  const [credits, setCredits] = useState<{ available: number } | null>(null)
  const [showBuy, setShowBuy] = useState(false)
  const [resendLoading, setResendLoading] = useState(!!resendFrom)
  const [resendInfo, setResendInfo] = useState<{ name: string; reason: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    authFetch("/api/event/list?action=owned")
      .then((r) => r.json())
      .then((data) => {
        const list: EventOption[] = data.events || []
        setEvents(list)
        if (!eventId && list.length && !resendFrom) setEventId(list[0].id)
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function loadCredits() {
    authFetch("/api/sms/credits")
      .then((r) => r.json())
      .then((data) => { if (data.success) setCredits(data.credits) })
      .catch(() => {})
  }
  useEffect(loadCredits, [])

  // "Edit & resend" a rejected campaign: reload name/message/event + every
  // stored number. The whole thing is recomputed and uploaded fresh — the
  // rejected campaign's credits were already returned when it was rejected.
  useEffect(() => {
    if (!resendFrom || resendAppliedRef.current) return
    resendAppliedRef.current = true
    ;(async () => {
      try {
        const [cRes, nRes] = await Promise.all([
          authFetch(`/api/sms/campaigns/${resendFrom}`),
          authFetch(`/api/sms/campaigns/${resendFrom}/numbers`),
        ])
        const cData = await cRes.json()
        const nData = await nRes.json()
        if (!cRes.ok || !cData.success) throw new Error(cData.error || "Couldn't load that campaign")
        const c = cData.campaign
        setEventId(c.event_id)
        setName(c.name)
        setMessage(c.message_text || "")
        setUseCurrent(false)
        setResendValues(nData.success ? nData.numbers || [] : [])
        if (c.status === "rejected") {
          setResendInfo({ name: c.name, reason: c.rejection_reason || "No reason was provided." })
        }
        setStep(2)
      } catch (e: any) {
        setError(e.message || "Couldn't load that campaign")
      } finally {
        setResendLoading(false)
      }
    })()
  }, [resendFrom])

  // Load the current event's numbers whenever the event changes (and the source is on).
  useEffect(() => {
    if (!useCurrent || !eventId || currentLoaded === eventId) return
    let cancelled = false
    setAudienceLoading(true)
    setAudienceError(null)
    authFetch(`/api/sms/event-numbers?eventId=${encodeURIComponent(eventId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (data.success) { setCurrentValues(data.numbers || []); setCurrentLoaded(eventId) }
        else setAudienceError(data.error || "Couldn't load numbers for this event")
      })
      .catch(() => { if (!cancelled) setAudienceError("Couldn't load numbers for this event") })
      .finally(() => { if (!cancelled) setAudienceLoading(false) })
    return () => { cancelled = true }
  }, [useCurrent, eventId, currentLoaded])

  async function loadPrevious(ids: string[]) {
    if (!ids.length) { setPreviousValues([]); return }
    setAudienceLoading(true)
    setAudienceError(null)
    try {
      const lists = await Promise.all(
        ids.map((id) => authFetch(`/api/sms/event-numbers?eventId=${encodeURIComponent(id)}`).then((r) => r.json()))
      )
      if (lists.some((l) => !l.success)) setAudienceError("Some events' numbers couldn't be loaded")
      setPreviousValues(lists.flatMap((l) => (l.success ? l.numbers || [] : [])))
    } catch {
      setAudienceError("Couldn't load numbers for the selected events")
    } finally {
      setAudienceLoading(false)
    }
  }

  function togglePrevious(id: string) {
    const next = previousEventIds.includes(id) ? previousEventIds.filter((x) => x !== id) : [...previousEventIds, id]
    setPreviousEventIds(next)
    loadPrevious(next)
  }

  function addManual() {
    const values = splitNumbers(manualInput)
    if (!values.length) return
    setManualValues((prev) => [...prev, ...values])
    setManualInput("")
  }

  async function handleFileImport(file: File) {
    setImportError(null)
    setImportInfo(null)
    if (!/\.(csv|txt)$/i.test(file.name)) {
      setImportError("Please upload a .csv file — in Excel or Google Sheets use File → Save/Download as CSV.")
      return
    }
    const result = parseSmsAudienceCsv(await file.text())
    if (!result.ok) { setImportError(result.error || "Couldn't read that file"); return }
    setImportValues(result.values)
    setImportInfo(
      `Read ${formatCount(result.values.length)} contact${result.values.length === 1 ? "" : "s"}` +
      (result.usedHeader ? ` from the "${result.usedHeader}" column` : " from the first column")
    )
  }

  // Everything merged → classified.
  const ignoredSet = useMemo(() => new Set(ignoredRaw), [ignoredRaw])
  const { clean, flagged } = useMemo(() => {
    const items: SourcedNumber[] = [
      ...(useCurrent ? currentValues : []).map((value) => ({ value, source: SRC_CURRENT })),
      ...resendValues.map((value) => ({ value, source: "Rejected campaign" })),
      ...previousValues.map((value) => ({ value, source: SRC_PREVIOUS })),
      ...manualValues.map((value) => ({ value, source: SRC_MANUAL })),
      ...importValues.map((value) => ({ value, source: SRC_IMPORT })),
    ].filter((i) => !ignoredSet.has(i.value))
    return classifyNumbers(items)
  }, [useCurrent, currentValues, resendValues, previousValues, manualValues, importValues, ignoredSet])

  const removedSet = useMemo(() => new Set(removedNumbers), [removedNumbers])
  const numbers = useMemo(() => clean.filter((n) => !removedSet.has(n)), [clean, removedSet])
  const shown = search.trim() ? numbers.filter((n) => n.includes(search.trim().replace(/\D/g, ""))) : numbers

  const required = numbers.length
  const available = credits?.available ?? null
  const insufficient = available !== null && required > available
  const shortBy = insufficient && available !== null ? required - available : 0

  function fixFlagged(id: string, raw: string) {
    const replacement = (fixInputs[id] || "").trim()
    if (!replacement) return
    setIgnoredRaw((prev) => [...prev, raw])
    setManualValues((prev) => [...prev, replacement])
    setFixInputs((prev) => { const n = { ...prev }; delete n[id]; return n })
  }

  async function handleUpload() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await authFetch("/api/sms/campaigns", {
        method: "POST",
        body: JSON.stringify({ eventId, name: name.trim(), message: message.trim(), numbers }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 402 || data.error === "insufficient_credits") {
        setError(`You need ${formatCount(data.required ?? required)} SMS credits but only have ${formatCount(data.available ?? available ?? 0)}.`)
        loadCredits()
        return
      }
      if (!res.ok || !data.success) throw new Error(data.message || data.error || "Failed to upload bulk SMS")
      router.push(`/campaign?eventId=${encodeURIComponent(eventId)}&smsCreated=1`)
    } catch (e: any) {
      setError(e.message || "Something went wrong")
    } finally {
      setSubmitting(false)
    }
  }

  const selectedEvent = events.find((e) => e.id === eventId)
  const otherEvents = events.filter((e) => e.id !== eventId)

  const canNextDetails = !!eventId && name.trim().length > 0
  const canNextAudience = numbers.length > 0 && flagged.length === 0 && numbers.length <= MAX_RECIPIENTS
  const canNextMessage = message.trim().length > 0 && message.length <= MAX_SMS_MESSAGE_LENGTH

  const inputClass = "mt-1 w-full border border-slate-200 rounded-lg px-3 py-2.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#6b2fa5]/30 focus:border-[#6b2fa5]"
  const primaryBtn = "inline-flex items-center gap-2 rounded-xl bg-[#6b2fa5] text-white px-4 py-2.5 text-sm font-semibold hover:bg-[#5a1f8a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
  const secondaryBtn = "inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white text-slate-600 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
  const card = "bg-white rounded-2xl border border-slate-200 shadow-sm p-5 lg:p-6 space-y-4"

  const sourceBreakdown = [
    useCurrent && currentValues.length ? [SRC_CURRENT, currentValues.length] : null,
    resendValues.length ? ["Rejected campaign", resendValues.length] : null,
    previousValues.length ? [SRC_PREVIOUS, previousValues.length] : null,
    manualValues.length ? [SRC_MANUAL, manualValues.length] : null,
    importValues.length ? [SRC_IMPORT, importValues.length] : null,
  ].filter(Boolean) as [string, number][]

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Link
          href={eventId ? `/campaign?eventId=${eventId}` : "/campaign"}
          className="inline-flex items-center gap-2 text-[#6b2fa5] hover:text-[#5a1f8a] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">Back to Campaigns</span>
        </Link>

        <div>
          <h1 className="text-2xl font-bold text-slate-900">{resendFrom ? "Edit & resend bulk SMS" : "Create Bulk SMS"}</h1>
          <p className="text-sm text-slate-500 mt-0.5">Send a text message to your attendees and contacts. Billed per number sent.</p>
        </div>

        {resendLoading && (
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            <Loader2 className="w-4 h-4 animate-spin text-[#6b2fa5]" /> Loading your campaign…
          </div>
        )}
        {resendInfo && (
          <div className="rounded-xl border border-red-200 bg-red-50 text-red-900 text-sm p-4 space-y-1.5">
            <p className="font-semibold">&ldquo;{resendInfo.name}&rdquo; was rejected</p>
            <p><strong>Why:</strong> {resendInfo.reason}</p>
            <p className="text-red-800/80">Its credits were returned to you. Fix the message or audience below and send it again.</p>
          </div>
        )}

        {/* Stepper */}
        <div className="flex items-center">
          {STEPS.map((label, i) => {
            const n = i + 1
            const active = step === n
            const complete = step > n
            return (
              <div key={label} className={`flex items-center ${i < STEPS.length - 1 ? "flex-1" : ""}`}>
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    complete ? "bg-[#6b2fa5] text-white" : active ? "bg-[#6b2fa5]/10 text-[#6b2fa5] ring-2 ring-[#6b2fa5]" : "bg-slate-100 text-slate-400"
                  }`}>
                    {complete ? <Check className="w-3.5 h-3.5" /> : n}
                  </div>
                  <span className={`text-sm font-medium hidden sm:block ${active ? "text-slate-900" : "text-slate-400"}`}>{label}</span>
                </div>
                {i < STEPS.length - 1 && <div className={`flex-1 h-px mx-3 ${complete ? "bg-[#6b2fa5]" : "bg-slate-200"}`} />}
              </div>
            )
          })}
        </div>

        {/* STEP 1 — Details */}
        {step === 1 && (
          <div className={card}>
            <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-slate-700">Event</label>
              <select
                className={inputClass} value={eventId}
                onChange={(e) => { setEventId(e.target.value); setCurrentLoaded(null) }}
              >
                {!eventId && <option value="">Select an event</option>}
                {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.eventName}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Campaign name</label>
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Last call for tickets" maxLength={80} />
              <p className="text-xs text-slate-400 mt-1">Only for you and the review team — recipients don&apos;t see it.</p>
            </div>
            </div>
            <div className="flex justify-end">
              <button className={primaryBtn} disabled={!canNextDetails} onClick={() => setStep(2)}>Next <ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        {/* STEP 2 — Audience */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2 lg:gap-6 lg:items-start">
            <div className="space-y-4 min-w-0">
            <div className={card}>
              <p className="text-sm font-semibold text-slate-800">1. This event</p>
              <label className="flex items-start gap-2.5 text-sm text-slate-700">
                <input type="checkbox" checked={useCurrent} onChange={(e) => setUseCurrent(e.target.checked)} className="mt-0.5 rounded border-slate-300 text-[#6b2fa5] focus:ring-[#6b2fa5]" />
                <span>
                  Use phone numbers from <strong>{selectedEvent?.eventName || "this event"}</strong>&apos;s ticket buyers
                  {useCurrent && currentLoaded === eventId && <span className="text-slate-400"> · {formatCount(currentValues.length)} found</span>}
                </span>
              </label>
            </div>

            {otherEvents.length > 0 && (
              <div className={card}>
                <p className="text-sm font-semibold text-slate-800">2. Previous events</p>
                <div className="max-h-44 overflow-y-auto space-y-1.5">
                  {otherEvents.map((ev) => (
                    <label key={ev.id} className="flex items-center gap-2.5 text-sm text-slate-700">
                      <input type="checkbox" checked={previousEventIds.includes(ev.id)} onChange={() => togglePrevious(ev.id)} className="rounded border-slate-300 text-[#6b2fa5] focus:ring-[#6b2fa5]" />
                      {ev.eventName}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className={card}>
              <p className="text-sm font-semibold text-slate-800">{otherEvents.length > 0 ? "3" : "2"}. Add numbers manually</p>
              <textarea
                value={manualInput} onChange={(e) => setManualInput(e.target.value)} rows={3}
                placeholder="08012345678, +2348012345678 — one per line or comma-separated"
                className={`${inputClass} font-mono text-sm`}
              />
              <button className={secondaryBtn} onClick={addManual} disabled={!manualInput.trim()}><Plus className="w-4 h-4" /> Add numbers</button>
            </div>

            <div className={card}>
              <p className="text-sm font-semibold text-slate-800">{otherEvents.length > 0 ? "4" : "3"}. Import a spreadsheet</p>
              <p className="text-xs text-slate-500">
                Upload a <strong>.csv</strong> with a <code className="bg-slate-100 px-1 rounded">phone</code> column (or just numbers in the first column).
                Excel can drop the leading 0 from numbers so those get flagged below so you can fix them.
              </p>
              <input
                ref={fileInputRef} type="file" accept=".csv,.txt,text/csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileImport(f); e.target.value = "" }}
              />
              <div className="flex items-center gap-3 flex-wrap">
                <button className={secondaryBtn} onClick={() => fileInputRef.current?.click()}><Upload className="w-4 h-4" /> Choose file</button>
                {importValues.length > 0 && (
                  <button className="text-xs text-slate-500 underline" onClick={() => { setImportValues([]); setImportInfo(null) }}>Clear import</button>
                )}
              </div>
              {importInfo && <p className="text-xs text-green-700">{importInfo}</p>}
              {importError && <p className="text-xs text-red-600">{importError}</p>}
            </div>
            </div>

            <div className="space-y-4 min-w-0">
            {audienceLoading && (
              <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin text-[#6b2fa5]" /> Loading numbers…</div>
            )}
            {audienceError && <p className="text-sm text-red-600">{audienceError}</p>}

            {flagged.length > 0 && (
              <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 space-y-3">
                <p className="text-sm font-semibold text-amber-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> {formatCount(flagged.length)} contact{flagged.length === 1 ? "" : "s"} have issues. Fix them or remove to continue
                </p>
                <div className="max-h-72 overflow-y-auto space-y-2">
                  {flagged.map((f) => (
                    <div key={f.id} className="rounded-lg bg-white border border-amber-200 px-3 py-2 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-mono text-sm text-slate-900 break-all">{f.value || "(empty)"}</p>
                          <p className="text-xs text-amber-800">{f.reason} · {f.source}</p>
                        </div>
                        <button onClick={() => setIgnoredRaw((p) => [...p, f.value])} className="text-xs font-semibold text-red-600 hover:text-red-700 flex-shrink-0">Remove</button>
                      </div>
                      <div className="flex gap-2">
                        <input
                          value={fixInputs[f.id] ?? ""} onChange={(e) => setFixInputs((p) => ({ ...p, [f.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === "Enter") fixFlagged(f.id, f.value) }}
                          placeholder="Corrected number" className="flex-1 border border-slate-200 rounded-md px-2 py-1 text-sm font-mono"
                        />
                        <button onClick={() => fixFlagged(f.id, f.value)} disabled={!(fixInputs[f.id] || "").trim()} className="text-xs font-semibold text-[#6b2fa5] disabled:opacity-40">Fix</button>
                      </div>
                    </div>
                  ))}
                </div>
                <button className="text-xs font-semibold text-red-700 underline" onClick={() => setIgnoredRaw((p) => [...p, ...flagged.map((f) => f.value)])}>Remove all flagged</button>
              </div>
            )}

            <div className={card}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Users className="w-4 h-4 text-[#6b2fa5]" /> {formatCount(numbers.length)} valid number{numbers.length === 1 ? "" : "s"}</p>
                {removedNumbers.length > 0 && (
                  <button className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-[#6b2fa5]" onClick={() => setRemovedNumbers([])}><RotateCcw className="w-3 h-3" /> Restore {removedNumbers.length} removed</button>
                )}
              </div>
              {numbers.length > MAX_RECIPIENTS && (
                <p className="text-xs text-red-600">A single bulk SMS can have at most {formatCount(MAX_RECIPIENTS)} numbers.</p>
              )}
              {numbers.length > 0 && (
                <>
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search numbers…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                  <div className="max-h-56 lg:max-h-96 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-lg">
                    {shown.slice(0, 200).map((n) => (
                      <div key={n} className="flex items-center justify-between px-3 py-1.5">
                        <span className="font-mono text-sm text-slate-700">{n}</span>
                        <button onClick={() => setRemovedNumbers((p) => [...p, n])} className="text-slate-300 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                    {shown.length > 200 && <p className="px-3 py-2 text-xs text-slate-400">Showing the first 200 of {formatCount(shown.length)} — use search to find a specific number.</p>}
                    {shown.length === 0 && <p className="px-3 py-3 text-xs text-slate-400">No numbers match.</p>}
                  </div>
                </>
              )}
            </div>
            </div>
            </div>

            <div className="flex justify-between">
              <button className={secondaryBtn} onClick={() => setStep(1)} disabled={!!resendFrom}><ChevronLeft className="w-4 h-4" /> Back</button>
              <button className={primaryBtn} disabled={!canNextAudience} onClick={() => setStep(3)}>Next <ChevronRight className="w-4 h-4" /></button>
            </div>
            {flagged.length > 0 && <p className="text-xs text-amber-700 text-right -mt-2">Resolve the flagged contacts to continue.</p>}
          </div>
        )}

        {/* STEP 3 — Message */}
        {step === 3 && (
          <div className={card}>
            <div className="grid gap-6 lg:grid-cols-2 lg:gap-8 lg:items-start">
            <div className="min-w-0">
              <label className="text-sm font-medium text-slate-700">Message</label>
              <textarea
                value={message} onChange={(e) => setMessage(e.target.value)} rows={6}
                placeholder="Type the text message your contacts will receive…"
                className={inputClass}
              />
              <p className={`text-xs mt-1 text-right ${message.length > MAX_SMS_MESSAGE_LENGTH ? "text-red-600" : "text-slate-400"}`}>
                {message.length}/{MAX_SMS_MESSAGE_LENGTH}
              </p>
              <p className="text-xs text-slate-400">Plain text only. Include your event name and any link you want people to open.</p>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-700">Preview</p>
              <div className="mt-1 rounded-xl border border-slate-200 bg-slate-50 p-4 min-h-[11.5rem]">
                {message.trim() ? (
                  <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 whitespace-pre-wrap break-words shadow-sm">
                    {message}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">Your message will appear here as you type.</p>
                )}
              </div>
            </div>
            </div>
            <div className="flex justify-between">
              <button className={secondaryBtn} onClick={() => setStep(2)}><ChevronLeft className="w-4 h-4" /> Back</button>
              <button className={primaryBtn} disabled={!canNextMessage} onClick={() => setStep(4)}>Review <ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        {/* STEP 4 — Review */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2 lg:gap-6 lg:items-start">
            <div className={card}>
              <dl className="text-sm space-y-3">
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Event</dt><dd className="text-slate-900 font-medium text-right">{selectedEvent?.eventName}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Campaign</dt><dd className="text-slate-900 font-medium text-right">{name}</dd></div>
                <div>
                  <dt className="text-slate-500 mb-1">Message</dt>
                  <dd className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-slate-800 whitespace-pre-wrap">{message}</dd>
                </div>
              </dl>
            </div>

            <div className={card}>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-sm text-slate-500">Total numbers you&apos;re sending to</p>
                  <p className="text-3xl font-bold text-slate-900">{formatCount(numbers.length)}</p>
                </div>
                <button className="text-xs text-[#6b2fa5] font-semibold" onClick={() => setStep(2)}>Edit audience</button>
              </div>
              {sourceBreakdown.length > 0 && (
                <ul className="text-xs text-slate-500 space-y-0.5">
                  {sourceBreakdown.map(([label, count]) => <li key={label}>{label}: {formatCount(count)} entered</li>)}
                  <li className="text-slate-400">Duplicates across sources are counted once.</li>
                </ul>
              )}
              <div className="flex justify-between text-sm border-t border-slate-100 pt-3">
                <span className="text-slate-500">SMS credits needed</span>
                <span className="font-semibold text-slate-900">{formatCount(required)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Your SMS credits</span>
                <span className={`font-semibold ${insufficient ? "text-red-600" : "text-slate-900"}`}>{available === null ? "—" : formatCount(available)}</span>
              </div>
              {insufficient && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900 flex items-center justify-between gap-3">
                  <span>You need {formatCount(shortBy)} more credit{shortBy === 1 ? "" : "s"}.</span>
                  <button onClick={() => setShowBuy(true)} className="font-semibold underline flex-shrink-0">Buy credits</button>
                </div>
              )}
              <p className="text-xs text-slate-400">Credits are reserved when you upload. If an admin rejects the campaign they&apos;re returned to you.</p>
            </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-between">
              <button className={secondaryBtn} onClick={() => setStep(3)} disabled={submitting}><ChevronLeft className="w-4 h-4" /> Back</button>
              <button className={primaryBtn} disabled={submitting || insufficient || numbers.length === 0 || flagged.length > 0} onClick={handleUpload}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Upload
              </button>
            </div>
          </div>
        )}
      </div>

      {showBuy && (
        <BuySmsCreditsModal onClose={() => { setShowBuy(false); clearRefFromUrl() }} onPurchased={loadCredits} />
      )}
      {!showBuy && paymentRef && (
        <PurchaseReceiptModal reference={paymentRef} onClose={clearRefFromUrl} onSuccessful={loadCredits} />
      )}
    </div>
  )
}

export default function CreateSmsCampaignPage() {
  return (
    <Suspense fallback={null}>
      <SmsCreateFlow />
    </Suspense>
  )
}
