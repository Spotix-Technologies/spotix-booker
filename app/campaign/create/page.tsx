"use client"

/**
 * app/campaign/create/page.tsx
 *
 * Create Campaign flow (spec §22–29). Step 2 now covers all three
 * audience modes (event attendees, previous-event attendees, CSV
 * import — spec §24) merged/deduped into one recipient list, and a new
 * Step 3 "Email Design" (spec §26) picks one of the 3 templates plus a
 * plain-text message and accent color — the backend renders the actual
 * HTML server-side (v1/lib/campaigns/templates.js); nothing here ever
 * builds or submits raw email HTML.
 *
 * Draft state persists to sessionStorage per event (spec §22).
 *
 * Styled to match the rest of the dashboard: slate-50 page bg, a
 * back-to-Campaigns link (was missing entirely before), white/
 * slate-200 cards, #6b2fa5 brand purple for the stepper + primary
 * actions.
 */

import { useEffect, useState, useRef, useMemo, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import {
  Loader2, ChevronLeft, ChevronRight, ArrowLeft, Users, CheckCircle2,
  Upload, Download, Check, Plus, X, Search, Copy,
} from "lucide-react"
import { authFetch } from "@/lib/auth-client"
import { renderCampaignPreviewHtml } from "@/lib/campaign-email-render"
import { ResponsiveSheet } from "@/components/ui/responsive-sheet"
import RichTextEditor from "@/components/campaigns/rich-text-editor"
import { parseAndValidateAudienceCsv, type ImportResult } from "@/lib/campaign-audience-csv"

interface EventOption { id: string; eventName: string; eventSlug: string }
interface Recipient { name: string | null; email: string }
type AudienceMode = "attendees" | "previous" | "import"

const TEMPLATES = [
  { id: "classic", label: "Classic" },
  { id: "bold", label: "Bold" },
  { id: "minimal", label: "Minimal" },
] as const

const STEPS = ["Details", "Audience", "Design", "Review"]

// Mirrors v1/lib/campaigns/sender.js — a single fixed technical address
// shared by every event now, not derived from the event name. The REAL
// sender address is always the one the backend returns on the created
// campaign; this is never submitted.
const SENDER_EMAIL = "notification@booker.spotix.com.ng"

function mergeRecipients(...lists: Recipient[][]): Recipient[] {
  const seen = new Map<string, Recipient>()
  for (const list of lists) {
    for (const r of list) {
      const email = r.email.trim().toLowerCase()
      if (!email || seen.has(email)) continue
      seen.set(email, { email, name: r.name })
    }
  }
  return Array.from(seen.values())
}

function CreateCampaignFlow() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialEventId = searchParams.get("eventId") || ""
  const cloneFrom = searchParams.get("cloneFrom") || ""
  // ?resume={campaignId} — reopens a campaign that moderation flagged,
  // locked to the Design step (audience and details can't change).
  const resumeId = searchParams.get("resume") || ""
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cloneAppliedRef = useRef(false)

  const [step, setStep] = useState(1)
  const [events, setEvents] = useState<EventOption[]>([])
  const [eventId, setEventId] = useState(initialEventId)
  const [name, setName] = useState("")

  // Audience — three independent sources, merged for the final list.
  const [attendeeRecipients, setAttendeeRecipients] = useState<Recipient[]>([])
  const [previousEventIds, setPreviousEventIds] = useState<string[]>([])
  const [previousRecipients, setPreviousRecipients] = useState<Recipient[]>([])
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importStage, setImportStage] = useState<string | null>(null)
  const [audienceMode, setAudienceMode] = useState<AudienceMode>("attendees")
  const [audienceLoading, setAudienceLoading] = useState(false)

  // Manual curation of the merged audience (spec ask: add specific emails
  // by hand, and remove specific emails from whatever the three sources
  // above produced). `removedEmails` is a blocklist applied on top of the
  // merge so removal works uniformly regardless of which source a given
  // recipient came from.
  const [manualRecipients, setManualRecipients] = useState<Recipient[]>([])
  const [manualEmailInput, setManualEmailInput] = useState("")
  const [manualNameInput, setManualNameInput] = useState("")
  const [removedEmails, setRemovedEmails] = useState<string[]>([])
  const [recipientSearch, setRecipientSearch] = useState("")

  // Clone-an-existing-campaign source (spec ask: same recipients, new
  // subject/content/event). `clonedRecipients` is just a fourth
  // audience source folded into the same merge/curate flow as
  // attendees/previous/import below — nothing else needs to know it
  // came from a clone.
  const [clonedRecipients, setClonedRecipients] = useState<Recipient[]>([])
  const [cloneSource, setCloneSource] = useState<{ id: string; name: string } | null>(null)
  const [cloneLoading, setCloneLoading] = useState(!!cloneFrom)
  const [cloneError, setCloneError] = useState<string | null>(null)

  // Email design
  const [templateId, setTemplateId] = useState<(typeof TEMPLATES)[number]["id"]>("classic")
  const [message, setMessage] = useState("")
  const [ctaText, setCtaText] = useState("View Event")
  const [brandColor, setBrandColor] = useState("#6D28D9")
  const [replyToAddress, setReplyToAddress] = useState("")

  // Preview (Design step) — rendered entirely client-side (see
  // lib/campaign-email-render.ts), so there's no fetch/loading/error
  // state here at all: just whether the mobile modal is open.
  const [previewOpen, setPreviewOpen] = useState(false)

  const [credits, setCredits] = useState<{ available: number } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [resubmitting, setResubmitting] = useState(false)
  const [resume, setResume] = useState<{ name: string; reason: string; suggestion: string } | null>(null)
  const [resumeLoading, setResumeLoading] = useState(!!resumeId)
  const [resumeError, setResumeError] = useState<string | null>(null)
  const activeStep = resumeId ? 3 : step
  // True when the backend has isValidationAllowed on — campaigns are then
  // checked by moderation on start, and we show "Our system is reviewing
  // the campaign" instead of a plain spinner while that happens.
  const [validationRequired, setValidationRequired] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const draftKey = eventId ? `spotix-campaign-draft-${eventId}` : null
  const removedSet = new Set(removedEmails)
  const recipients = mergeRecipients(clonedRecipients, attendeeRecipients, previousRecipients, importResult?.recipients || [], manualRecipients)
    .filter((r) => !removedSet.has(r.email))

  useEffect(() => {
    authFetch("/api/campaigns/config")
      .then((r) => r.json())
      .then((data) => setValidationRequired(!!data.validationRequired))
      .catch(() => {})
  }, [])

  useEffect(() => {
    authFetch("/api/event/list?action=owned")
      .then((r) => r.json())
      .then((data) => {
        const list: EventOption[] = data.events || []
        setEvents(list)
        // Skip auto-selecting the first event while a clone is still
        // loading — it'll set the source campaign's own event in a
        // moment, and picking one here first just flashes the dropdown.
        if (!eventId && list.length && !cloneFrom && !resumeId) setEventId(list[0].id)
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Loads the source campaign's recipients/template/message/event once,
  // on arrival via "Clone" (app/campaign/[campaignId]/page.tsx). Runs
  // before the sessionStorage draft-load effect below is allowed to
  // touch anything (that effect bails out early while cloneFrom is set)
  // so a pre-existing draft for the same event can't clobber the clone.
  useEffect(() => {
    if (!cloneFrom || cloneAppliedRef.current) return
    cloneAppliedRef.current = true
    setCloneLoading(true)
    setCloneError(null)
    ;(async () => {
      try {
        const [campaignRes, recipientsRes] = await Promise.all([
          authFetch(`/api/campaigns/${cloneFrom}`),
          authFetch(`/api/campaigns/${cloneFrom}/recipients?all=1`),
        ])
        const campaignData = await campaignRes.json()
        const recipientsData = await recipientsRes.json()
        if (!campaignRes.ok || !campaignData.success) {
          throw new Error(campaignData.error || "Couldn't load that campaign")
        }

        const source = campaignData.campaign
        setCloneSource({ id: source.id, name: source.name })
        setName(`${source.name} (Copy)`)
        if (source.event_id) setEventId(source.event_id)
        if (source.template_id) setTemplateId(source.template_id)
        setMessage(source.message_text || "")
        setCtaText(source.cta_text || "View Event")
        setBrandColor(source.brand_color || "#6D28D9")
        setReplyToAddress(source.reply_to_address || "")

        const rows: Array<{ name?: string | null; email: string }> = recipientsData.recipients || []
        setClonedRecipients(mergeRecipients(
          rows.map((r) => ({ email: (r.email || "").trim().toLowerCase(), name: r.name || null }))
        ))

        // Drop ?cloneFrom= now that it's applied — a refresh or back-nav
        // from here on should resume the normal per-event sessionStorage
        // draft, not re-fetch and re-apply the clone over the user's edits.
        const params = new URLSearchParams(searchParams.toString())
        params.delete("cloneFrom")
        router.replace(`/campaign/create${params.toString() ? `?${params.toString()}` : ""}`)
      } catch (e: any) {
        setCloneError(e.message || "Couldn't load that campaign to clone")
      } finally {
        setCloneLoading(false)
      }
    })()
  }, [cloneFrom]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!resumeId) return
    ;(async () => {
      try {
        const res = await authFetch(`/api/campaigns/${resumeId}`)
        const data = await res.json()
        if (!res.ok || !data.success) throw new Error(data.error || "Couldn't load that campaign")
        const c = data.campaign
        if (c.status !== "flagged") {
          router.replace(`/campaign/${resumeId}`)
          return
        }
        setEventId(c.event_id)
        setName(c.name)
        setTemplateId(c.template_id || "classic")
        setMessage(c.message_text || "")
        setCtaText(c.cta_text || "View Event")
        setBrandColor(c.brand_color || "#6D28D9")
        setReplyToAddress(c.reply_to_address || "")
        setResume({
          name: c.name,
          reason: c.moderation_reason || "Our review found an issue with this message.",
          suggestion: c.moderation_suggestion || "",
        })
      } catch (e: any) {
        setResumeError(e.message || "Couldn't load that campaign")
      } finally {
        setResumeLoading(false)
      }
    })()
  }, [resumeId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!draftKey || cloneFrom || resumeId) return
    try {
      const raw = sessionStorage.getItem(draftKey)
      if (raw) {
        const draft = JSON.parse(raw)
        if (draft.name) setName(draft.name)
        if (draft.attendeeRecipients) setAttendeeRecipients(draft.attendeeRecipients)
        if (draft.previousRecipients) setPreviousRecipients(draft.previousRecipients)
        if (draft.previousEventIds) setPreviousEventIds(draft.previousEventIds)
        if (draft.importResult) setImportResult(draft.importResult)
        if (draft.manualRecipients) setManualRecipients(draft.manualRecipients)
        if (draft.removedEmails) setRemovedEmails(draft.removedEmails)
        if (draft.templateId) setTemplateId(draft.templateId)
        if (draft.message) setMessage(draft.message)
        if (draft.ctaText) setCtaText(draft.ctaText)
        if (draft.brandColor) setBrandColor(draft.brandColor)
        if (draft.replyToAddress) setReplyToAddress(draft.replyToAddress)
        if (draft.clonedRecipients) setClonedRecipients(draft.clonedRecipients)
        if (draft.cloneSource) setCloneSource(draft.cloneSource)
        if (draft.step) setStep(draft.step)
      }
    } catch {}
  }, [draftKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!draftKey || resumeId) return
    sessionStorage.setItem(draftKey, JSON.stringify({
      name, attendeeRecipients, previousRecipients, previousEventIds, importResult,
      manualRecipients, removedEmails, templateId, message, ctaText, brandColor, replyToAddress, step,
      clonedRecipients, cloneSource,
    }))
  }, [draftKey, name, attendeeRecipients, previousRecipients, previousEventIds, importResult, manualRecipients, removedEmails, templateId, message, ctaText, brandColor, replyToAddress, step, clonedRecipients, cloneSource])

  // Email credits belong to the account, not the event — load once.
  useEffect(() => {
    authFetch("/api/campaign-credits")
      .then((r) => r.json())
      .then((data) => { if (data.success) setCredits(data.credits) })
      .catch(() => {})
  }, [])

  const selectedEvent = events.find((e) => e.id === eventId)
  const otherEvents = events.filter((e) => e.id !== eventId)
  const filteredForManage = recipientSearch.trim()
    ? recipients.filter((r) => {
        const q = recipientSearch.trim().toLowerCase()
        return r.email.includes(q) || (r.name || "").toLowerCase().includes(q)
      })
    : recipients

  async function fetchAttendees(targetEventId: string): Promise<Recipient[]> {
    const res = await authFetch(`/api/event/list/${targetEventId}/attendees?all=true`)
    const data = await res.json()
    const raw: Array<{ name?: string; email?: string }> = data.attendees || []
    return raw
      .map((a) => ({ email: (a.email || "").trim().toLowerCase(), name: a.name || null }))
      .filter((r) => r.email.includes("@"))
  }

  async function loadAttendeesAudience() {
    if (!eventId) return
    setAudienceLoading(true)
    try {
      setAttendeeRecipients(mergeRecipients(await fetchAttendees(eventId)))
    } finally {
      setAudienceLoading(false)
    }
  }

  async function loadPreviousEventsAudience() {
    if (!previousEventIds.length) { setPreviousRecipients([]); return }
    setAudienceLoading(true)
    try {
      const lists = await Promise.all(previousEventIds.map(fetchAttendees))
      setPreviousRecipients(mergeRecipients(...lists))
    } finally {
      setAudienceLoading(false)
    }
  }

  function addManualEmail() {
    const email = manualEmailInput.trim().toLowerCase()
    if (!email || !email.includes("@")) return
    setManualRecipients((prev) => mergeRecipients(prev, [{ email, name: manualNameInput.trim() || null }]))
    setRemovedEmails((prev) => prev.filter((e) => e !== email)) // re-adding un-removes it
    setManualEmailInput("")
    setManualNameInput("")
  }

  function removeRecipient(email: string) {
    setRemovedEmails((prev) => (prev.includes(email) ? prev : [...prev, email]))
  }

  async function handleFileImport(file: File) {
    setImportStage("Reading file…")
    const text = await file.text()
    setImportStage("Validating rows…")
    await new Promise((r) => setTimeout(r, 150)) // let the stage render — real work is synchronous
    setImportStage("Removing duplicates…")
    const result = parseAndValidateAudienceCsv(text)
    setImportStage(null)
    setImportResult(result)
  }

  // Computed locally, instantly — no backend round trip. See
  // lib/campaign-email-render.ts for why this is safe to do client-side.
  const liveRawPreviewHtml = useMemo(() => {
    if (!selectedEvent) return null
    return renderCampaignPreviewHtml({
      eventName: selectedEvent.eventName,
      eventSlug: selectedEvent.eventSlug,
      templateId,
      messageText: message,
      brandColor,
      ctaText,
    })
  }, [selectedEvent, templateId, message, brandColor, ctaText])

  // A small debounce purely for smoothness — an iframe's srcDoc reloads
  // the whole document on every change, which flickers if it's tied
  // directly to every keystroke in the message textarea.
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  useEffect(() => {
    const t = setTimeout(() => setPreviewHtml(liveRawPreviewHtml), 200)
    return () => clearTimeout(t)
  }, [liveRawPreviewHtml])

  async function handleStart() {
    setSubmitting(true)
    setError(null)
    try {
      const createRes = await authFetch("/api/campaigns", {
        method: "POST",
        body: JSON.stringify({ eventId, name, recipients, templateId, message, ctaText: ctaText.trim() || "View Event", brandColor, replyToAddress: replyToAddress.trim() || undefined }),
      })
      const createData = await createRes.json()
      if (!createRes.ok || !createData.success) {
        throw new Error(createData.error || "Failed to create campaign")
      }

      const startRes = await authFetch(`/api/campaigns/${createData.campaign.id}/start`, { method: "POST" })
      const startData = await startRes.json()
      if (!startRes.ok || !startData.success) {
        // Flagged by moderation: the campaign row exists with status
        // "flagged" and the reason stored, so the detail page is the
        // right place to show it (with a Clone option to fix and resend).
        if (startData.error === "flagged_by_moderation") {
          if (draftKey) sessionStorage.removeItem(draftKey)
          router.push(`/campaign/${createData.campaign.id}`)
          return
        }
        if (startData.error === "insufficient_credits") {
          setError(`You need ${startData.required.toLocaleString()} credits but only have ${startData.available.toLocaleString()}.`)
          return
        }
        throw new Error(startData.error || "Failed to start campaign")
      }

      if (draftKey) sessionStorage.removeItem(draftKey)
      router.push(`/campaign/${createData.campaign.id}?justCreated=1${startData.pendingReview ? "&review=1" : ""}`)
    } catch (e: any) {
      setError(e.message || "Something went wrong")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResubmit() {
    setResubmitting(true)
    setError(null)
    try {
      const res = await authFetch(`/api/campaigns/${resumeId}/resubmit`, {
        method: "POST",
        body: JSON.stringify({ templateId, message, ctaText: ctaText.trim() || "View Event", brandColor }),
      })
      const data = await res.json()
      if (data.error === "flagged_by_moderation") {
        // Still not clean — show the new reason + fix right here.
        setResume((r) => ({
          name: r?.name || name,
          reason: data.message || "Our review found an issue with this message.",
          suggestion: data.suggestion || "",
        }))
        window.scrollTo({ top: 0, behavior: "smooth" })
        return
      }
      if (data.error === "insufficient_credits") {
        setError(`You need ${data.required.toLocaleString()} credits but only have ${data.available.toLocaleString()}.`)
        return
      }
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to resubmit campaign")
      router.push(`/campaign/${resumeId}?justCreated=1${data.pendingReview ? "&review=1" : ""}`)
    } catch (e: any) {
      setError(e.message || "Something went wrong")
    } finally {
      setResubmitting(false)
    }
  }

  const requiredCredits = recipients.length
  const availableCredits = credits?.available ?? null
  const insufficientCredits = availableCredits !== null && requiredCredits > availableCredits

  const inputClass = "mt-1 w-full border border-slate-200 rounded-lg px-3 py-2.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#6b2fa5]/30 focus:border-[#6b2fa5]"
  const primaryBtn = "inline-flex items-center gap-2 rounded-xl bg-[#6b2fa5] text-white px-4 py-2.5 text-sm font-semibold hover:bg-[#5a1f8a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
  const secondaryBtn = "inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white text-slate-600 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
  const backLink = "inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-[#6b2fa5] transition-colors"

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
          <h1 className="text-2xl font-bold text-slate-900">{resumeId ? "Fix your campaign" : "Create Campaign"}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{resumeId ? "Update the design and message, then resubmit. Your audience and details are locked." : "Reach your attendees with a new email campaign"}</p>
        </div>

        {cloneLoading && (
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            <Loader2 className="w-4 h-4 animate-spin text-[#6b2fa5]" /> Loading recipients and design from the original campaign…
          </div>
        )}
        {cloneError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{cloneError}</div>
        )}
        {cloneSource && !cloneLoading && (
          <div className="flex items-center gap-2 rounded-xl border border-[#6b2fa5]/20 bg-[#6b2fa5]/5 px-4 py-3 text-sm text-slate-700">
            <Copy className="w-4 h-4 text-[#6b2fa5] shrink-0" />
            Recipients, template and message carried over from <strong>{cloneSource.name}</strong> — change the subject, content, or event below as needed.
          </div>
        )}

        {resumeLoading && (
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            <Loader2 className="w-4 h-4 animate-spin text-[#6b2fa5]" /> Loading your campaign…
          </div>
        )}
        {resumeError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{resumeError}</div>
        )}
        {resume && (
          <div className="rounded-xl border border-red-200 bg-red-50 text-red-900 text-sm p-4 space-y-1.5">
            <p className="font-semibold">&ldquo;{resume.name}&rdquo; wasn&apos;t sent</p>
            <p><strong>Why:</strong> {resume.reason}</p>
            {resume.suggestion && <p><strong>How to fix it:</strong> {resume.suggestion}</p>}
          </div>
        )}

        {/* Stepper */}
        {!resumeId && (
        <div className="flex items-center">
          {STEPS.map((label, i) => {
            const n = i + 1
            const active = step === n
            const complete = step > n
            return (
              <div key={label} className={`flex items-center ${i < STEPS.length - 1 ? "flex-1" : ""}`}>
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      complete
                        ? "bg-[#6b2fa5] text-white"
                        : active
                        ? "bg-[#6b2fa5]/10 text-[#6b2fa5] ring-2 ring-[#6b2fa5]"
                        : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {complete ? <Check className="w-3.5 h-3.5" /> : n}
                  </div>
                  <span className={`text-sm font-medium hidden sm:inline ${active ? "text-slate-900" : "text-slate-400"}`}>
                    {label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 ${complete ? "bg-[#6b2fa5]" : "bg-slate-200"}`} />
                )}
              </div>
            )
          })}
        </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 lg:p-8">
          {activeStep === 1 && (
            <div className="space-y-6">
              <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
              <div>
                <label className="text-sm font-semibold text-slate-700">Event</label>
                <select
                  className={inputClass}
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value)}
                >
                  {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.eventName}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700">Campaign name</label>
                <input
                  className={inputClass}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Early Bird Tickets Are Now Live!"
                />
                <p className="text-xs text-slate-400 mt-1">This becomes the email subject line.</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700">Sender address</label>
                <input
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2.5 bg-slate-50 text-slate-500"
                  value={SENDER_EMAIL}
                  readOnly
                />
                <p className="text-xs text-slate-400 mt-1">Fixed system address — this can't be edited.</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700">Reply-to address <span className="font-normal text-slate-400">(optional)</span></label>
                <input
                  className={inputClass}
                  type="email"
                  value={replyToAddress}
                  onChange={(e) => setReplyToAddress(e.target.value)}
                  placeholder="you@yourevent.com"
                />
                <p className="text-xs text-slate-400 mt-1">Replies will be sent to this email.</p>
              </div>
              </div>
              <div className="flex justify-end pt-2">
                <button
                  disabled={!eventId || !name.trim()}
                  onClick={() => setStep(2)}
                  className={primaryBtn}
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {activeStep === 2 && (
            <div className="space-y-6">
              <div className="lg:grid lg:grid-cols-2 lg:gap-8 lg:items-start space-y-4 lg:space-y-0">
              <div className="space-y-4 min-w-0">
              <div className="flex gap-1 border-b border-slate-200 text-sm">
                {([
                  ["attendees", "Event attendees"],
                  ["previous", "Previous events"],
                  ["import", "Import list"],
                ] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => setAudienceMode(mode)}
                    className={`px-3 py-2.5 -mb-px border-b-2 font-medium transition-colors ${
                      audienceMode === mode
                        ? "border-[#6b2fa5] text-[#6b2fa5]"
                        : "border-transparent text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {audienceMode === "attendees" && (
                <div className="rounded-xl border border-slate-200 p-5">
                  <p className="font-semibold text-slate-800 flex items-center gap-2"><Users className="w-4 h-4 text-[#6b2fa5]" /> Event attendees</p>
                  <p className="text-sm text-slate-500 mt-1">Everyone with a ticket to this event.</p>
                  <button
                    onClick={loadAttendeesAudience}
                    disabled={audienceLoading}
                    className={`${secondaryBtn} mt-3`}
                  >
                    {audienceLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    {attendeeRecipients.length > 0 ? "Reload attendees" : "Load attendees"}
                  </button>
                  {attendeeRecipients.length > 0 && (
                    <p className="text-sm text-slate-600 mt-3">{attendeeRecipients.length.toLocaleString()} unique recipients loaded.</p>
                  )}
                </div>
              )}

              {audienceMode === "previous" && (
                <div className="rounded-xl border border-slate-200 p-5 space-y-3">
                  <p className="font-semibold text-slate-800 flex items-center gap-2"><Users className="w-4 h-4 text-[#6b2fa5]" /> Previous event attendees</p>
                  <p className="text-sm text-slate-500">Select any of your other events — attendees are deduped by email.</p>
                  {otherEvents.length === 0 ? (
                    <p className="text-sm text-slate-400">You don't have any other events yet.</p>
                  ) : (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {otherEvents.map((ev) => (
                        <label key={ev.id} className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            className="rounded border-slate-300 text-[#6b2fa5] focus:ring-[#6b2fa5]"
                            checked={previousEventIds.includes(ev.id)}
                            onChange={(e) => setPreviousEventIds((prev) =>
                              e.target.checked ? [...prev, ev.id] : prev.filter((id) => id !== ev.id)
                            )}
                          />
                          {ev.eventName}
                        </label>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={loadPreviousEventsAudience}
                    disabled={audienceLoading || previousEventIds.length === 0}
                    className={secondaryBtn}
                  >
                    {audienceLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Load selected events
                  </button>
                  {previousRecipients.length > 0 && (
                    <p className="text-sm text-slate-600">{previousRecipients.length.toLocaleString()} unique recipients loaded.</p>
                  )}
                </div>
              )}

              {audienceMode === "import" && (
                <div className="rounded-xl border border-slate-200 p-5 space-y-3">
                  <p className="font-semibold text-slate-800 flex items-center gap-2"><Upload className="w-4 h-4 text-[#6b2fa5]" /> Import a mailing list</p>
                  <p className="text-sm text-slate-500">CSV with "name" and "email" columns.</p>
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className={secondaryBtn}
                    >
                      <Upload className="w-4 h-4" /> Choose CSV
                    </button>
                    <a href="/campaign-sample-audience.csv" download className="inline-flex items-center gap-1 text-sm font-medium text-[#6b2fa5] hover:text-[#5a1f8a] transition-colors">
                      <Download className="w-3.5 h-3.5" /> Sample file
                    </a>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileImport(f) }}
                    />
                  </div>
                  {importStage && (
                    <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {importStage}</p>
                  )}
                  {importResult && !importResult.ok && (
                    <p className="text-sm text-red-600">{importResult.errors.join(", ")}</p>
                  )}
                  {importResult?.ok && (
                    <div className="text-sm rounded-lg bg-slate-50 p-3 space-y-1 text-slate-600">
                      <p>Total rows: {importResult.totalRows.toLocaleString()}</p>
                      <p>Valid emails: {importResult.recipients.length.toLocaleString()}</p>
                      <p>Invalid rows: {importResult.invalidRows.toLocaleString()}</p>
                      <p>Duplicates removed: {importResult.duplicatesRemoved.toLocaleString()}</p>
                    </div>
                  )}
                </div>
              )}

              </div>

              <div className="space-y-4 min-w-0">
              <div className="rounded-xl border border-slate-200 p-5 space-y-3">
                <p className="font-semibold text-slate-800 flex items-center gap-2"><Users className="w-4 h-4 text-[#6b2fa5]" /> Manage recipients</p>
                <p className="text-sm text-slate-500">Add specific emails by hand, or search the curated list to remove anyone you don't want to include.</p>
                {clonedRecipients.length > 0 && (
                  <p className="text-sm text-slate-500 flex items-center gap-1.5">
                    <Copy className="w-3.5 h-3.5 text-[#6b2fa5]" /> {clonedRecipients.length.toLocaleString()} carried over from {cloneSource?.name || "the original campaign"}.
                  </p>
                )}

                <div className="flex gap-2 flex-wrap">
                  <input
                    value={manualEmailInput}
                    onChange={(e) => setManualEmailInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addManualEmail()}
                    placeholder="name@example.com"
                    className={`${inputClass} mt-0 flex-1 min-w-[180px]`}
                  />
                  <input
                    value={manualNameInput}
                    onChange={(e) => setManualNameInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addManualEmail()}
                    placeholder="Name (optional)"
                    className={`${inputClass} mt-0 flex-1 min-w-[140px]`}
                  />
                  <button onClick={addManualEmail} className={secondaryBtn}>
                    <Plus className="w-4 h-4" /> Add
                  </button>
                </div>

                {recipients.length > 0 && (
                  <>
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        value={recipientSearch}
                        onChange={(e) => setRecipientSearch(e.target.value)}
                        placeholder="Search curated list by name or email…"
                        className={`${inputClass} mt-0 pl-9`}
                      />
                    </div>

                    <div className="rounded-lg border border-slate-200 max-h-56 lg:max-h-80 overflow-y-auto divide-y divide-slate-100 text-sm">
                      {filteredForManage.slice(0, 200).map((r) => (
                        <div key={r.email} className="flex items-center justify-between gap-2 px-3 py-2">
                          <div className="min-w-0">
                            <p className="text-slate-800 truncate">{r.name || r.email}</p>
                            {r.name && <p className="text-xs text-slate-400 truncate">{r.email}</p>}
                          </div>
                          <button
                            onClick={() => removeRecipient(r.email)}
                            className="text-slate-400 hover:text-red-600 transition-colors shrink-0"
                            title="Remove from audience"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      {filteredForManage.length === 0 && (
                        <p className="px-3 py-6 text-center text-slate-400">No recipients match your search.</p>
                      )}
                    </div>
                    {filteredForManage.length > 200 && (
                      <p className="text-xs text-slate-400">
                        Showing first 200 of {filteredForManage.length.toLocaleString()} matches — refine your search to see more.
                      </p>
                    )}
                  </>
                )}
              </div>

              <div className="rounded-lg bg-[#6b2fa5]/5 border border-[#6b2fa5]/10 p-3 text-sm text-slate-700">
                <strong className="text-slate-900">{recipients.length.toLocaleString()}</strong> total unique recipients across all sources.
              </div>
              </div>
              </div>

              <div className="flex justify-between pt-2">
                <button onClick={() => setStep(1)} className={backLink}>
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button
                  disabled={recipients.length === 0}
                  onClick={() => setStep(3)}
                  className={primaryBtn}
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {activeStep === 3 && !(resumeId && !resume) && (
            <div className="lg:grid lg:grid-cols-2 lg:gap-8 lg:items-start">
              <div className="space-y-4 min-w-0">
                <div>
                  <label className="text-sm font-semibold text-slate-700">Template</label>
                  <div className="grid grid-cols-3 gap-3 mt-1">
                    {TEMPLATES.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setTemplateId(t.id)}
                        className={`rounded-xl border overflow-hidden text-left transition-colors ${
                          templateId === t.id ? "border-[#6b2fa5] ring-2 ring-[#6b2fa5]" : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <iframe src={`/campaign-templates/${t.id}.html`} className="w-full h-32 pointer-events-none" title={t.label} />
                        <p className="text-xs font-semibold text-center py-1.5 text-slate-700">{t.label}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Accent color</label>
                  <input
                    type="color"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="mt-1 h-10 w-16 border border-slate-200 rounded-lg cursor-pointer"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Message</label>
                  <RichTextEditor
                    className="mt-1"
                    value={message}
                    onChange={setMessage}
                    ctaText={ctaText}
                    onCtaTextChange={setCtaText}
                    placeholder="Tell your attendees what's new… (use **text** for bold)"
                  />
                  <p className="text-xs text-slate-400 mt-1">The footer is added automatically. Messages that ask for payments outside Spotix are not allowed.</p>
                </div>

                {/* The panel on the right already keeps itself live on
                    lg+ — this is just the mobile entry point to the
                    same, already-computed preview. */}
                <div className="lg:hidden">
                  <button onClick={() => setPreviewOpen(true)} className={secondaryBtn}>
                    <Search className="w-4 h-4" />
                    Preview email
                  </button>
                </div>

                {error && resumeId && <div className="rounded-lg border border-red-200 bg-red-50 text-red-900 text-sm p-4">{error}</div>}
                {resumeId ? (
                  <div className="flex justify-end pt-2">
                    <button
                      disabled={resubmitting || !message.trim()}
                      onClick={handleResubmit}
                      className={primaryBtn}
                    >
                      {resubmitting && <Loader2 className="w-4 h-4 animate-spin" />} Resubmit for review
                    </button>
                  </div>
                ) : (
                  <div className="flex justify-between pt-2">
                    <button onClick={() => setStep(2)} className={backLink}>
                      <ChevronLeft className="w-4 h-4" /> Back
                    </button>
                    <button
                      onClick={() => setStep(4)}
                      className={primaryBtn}
                    >
                      Next <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Live side-by-side preview, desktop only — the mobile
                  equivalent is the full-screen modal below. */}
              <div className="hidden lg:block lg:sticky lg:top-8">
                <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                    <p className="text-sm font-semibold text-slate-800">Live preview</p>
                  </div>
                  {previewHtml ? (
                    <iframe
                      srcDoc={previewHtml}
                      title="Live email preview"
                      className="w-full bg-slate-50"
                      style={{ height: "70vh" }}
                    />
                  ) : (
                    <div className="flex items-center justify-center text-sm text-slate-400 bg-slate-50" style={{ height: "70vh" }}>
                      Preview will appear here
                    </div>
                  )}
                </div>
              </div>

              {previewOpen && (
                <ResponsiveSheet
                  open
                  onClose={() => setPreviewOpen(false)}
                  size="lg"
                  fullHeightOnMobile
                  title="Email preview"
                  bodyClassName="p-0"
                >
                  <iframe srcDoc={previewHtml || ""} title="Email preview" className="block w-full h-full min-h-[60dvh] bg-slate-50" />
                </ResponsiveSheet>
              )}
            </div>
          )}

          {activeStep === 4 && (
            <div className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
                <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 text-sm overflow-hidden">
                  <p className="px-4 py-2.5 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">Details</p>
                  <div className="flex justify-between gap-4 px-4 py-3"><span className="text-slate-500">Campaign</span><span className="font-medium text-slate-900 text-right">{name}</span></div>
                  <div className="flex justify-between gap-4 px-4 py-3"><span className="text-slate-500">Event</span><span className="font-medium text-slate-900 text-right">{selectedEvent?.eventName}</span></div>
                  <div className="flex justify-between gap-4 px-4 py-3"><span className="text-slate-500">Template</span><span className="font-medium text-slate-900 capitalize">{templateId}</span></div>
                  <div className="flex justify-between gap-4 px-4 py-3"><span className="text-slate-500">Reply-to</span><span className="font-medium text-slate-900 text-right break-all">{replyToAddress.trim() || "Not set"}</span></div>
                </div>
                <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 text-sm overflow-hidden">
                  <p className="px-4 py-2.5 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">Sending</p>
                  <div className="flex justify-between gap-4 px-4 py-3"><span className="text-slate-500">Recipients</span><span className="font-medium text-slate-900">{requiredCredits.toLocaleString()}</span></div>
                  <div className="flex justify-between gap-4 px-4 py-3"><span className="text-slate-500">Credits required</span><span className="font-medium text-slate-900">{requiredCredits.toLocaleString()}</span></div>
                  <div className="flex justify-between gap-4 px-4 py-3"><span className="text-slate-500">Available credits</span><span className="font-medium text-slate-900">{availableCredits?.toLocaleString() ?? "—"}</span></div>
                  <div className="flex justify-between gap-4 px-4 py-3"><span className="text-slate-500">Remaining after send</span><span className="font-medium text-slate-900">{availableCredits !== null ? Math.max(availableCredits - requiredCredits, 0).toLocaleString() : "—"}</span></div>
                </div>
              </div>

              {insufficientCredits && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-sm p-4">
                  You need {requiredCredits.toLocaleString()} credits but only have {availableCredits!.toLocaleString()}.{" "}
                  <a href={`/campaign?eventId=${eventId}&checkout=1`} className="underline font-semibold">Buy more credits</a>
                </div>
              )}
              {validationRequired && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 text-slate-600 text-sm p-4">
                  Our system will just check your mail for a quick audit before delivering the campaign. If we find anything, we&apos;ll shoot you an email — otherwise we&apos;ll start your campaign.
                </div>
              )}
              {error && <div className="rounded-lg border border-red-200 bg-red-50 text-red-900 text-sm p-4">{error}</div>}

              <div className="flex justify-between pt-2">
                <button onClick={() => setStep(3)} className={backLink}>
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button
                  disabled={submitting || insufficientCredits}
                  onClick={handleStart}
                  className={primaryBtn}
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Start Campaign
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function CreateCampaignPage() {
  return (
    <Suspense fallback={null}>
      <CreateCampaignFlow />
    </Suspense>
  )
}
