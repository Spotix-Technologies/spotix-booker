"use client"

/**
 * app/components/event-info/create-event-slug.tsx
 *
 * Bottom-sheet dialog offered from EventLinkTab for an event that predates
 * the eventSlug short-link feature (see app/components/create-event/
 * create-one-time-event.tsx and app/lib/slug.ts for how slugs are created
 * at event-creation time — this is the same flow, just retrofitted onto an
 * existing event that has none yet).
 *
 * Unlike the create-event form, typing here is left alone (spaces and all)
 * so it feels like typing a normal name — a live preview line underneath
 * shows what it'll actually turn into via the shared slugify() helper
 * (spaces → hyphens, anything else URL-unsafe stripped). That preview is
 * also what gets checked/submitted, not the raw text.
 */

import { useState, useEffect } from "react"
import { Link2, Loader2, CheckCircle, AlertCircle, Pencil } from "lucide-react"
import { authFetch } from "@/lib/auth-client"
import { slugify, isValidSlug, SLUG_RULES_HINT } from "@/lib/slug"
import { useSlugAvailability } from "@/hooks/useSlugAvailability"
import { ResponsiveSheet } from "@/components/ui/responsive-sheet"

interface CreateEventSlugProps {
  open: boolean
  eventId: string
  /** e.g. "https://spotix.com.ng" — from NEXT_PUBLIC_SPOTIX_USER, shown as the
   *  read-only prefix in front of the editable slug segment. */
  spotixUserBase?: string
  onClose: () => void
  /** Fired once the slug is actually saved server-side. */
  onCreated: (eventSlug: string) => void
}

export default function CreateEventSlug({
  open,
  eventId,
  spotixUserBase = "",
  onClose,
  onCreated,
}: CreateEventSlugProps) {
  // What the organizer is actually typing — spaces allowed, untouched.
  const [rawInput, setRawInput] = useState("")
  // What it turns into — this is what's previewed, checked, and submitted.
  const preview = slugify(rawInput)
  // Server is only asked 5s after the last keystroke (hooks/useSlugAvailability.ts).
  const { status: slugStatus, checkNow: checkSlugNow } = useSlugAvailability(preview, { enabled: open })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset to a blank slate each time it's reopened.
  useEffect(() => {
    if (open) {
      setRawInput("")
      setError(null)
      setSubmitting(false)
    }
  }, [open])

  function handleDismiss() {
    if (submitting) return
    onClose()
  }

  async function handleCreate() {
    if (!preview || !isValidSlug(preview)) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await authFetch(`/api/event/list/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setSlug", eventSlug: preview }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to create your event link")
      onCreated(data.eventSlug || preview)
    } catch (err: any) {
      setError(err.message || "Failed to create your event link")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ResponsiveSheet
      open={open}
      onClose={handleDismiss}
      size="md"
      dismissible={!submitting}
      icon={
        <div className="p-2 bg-[#6b2fa5]/10 rounded-lg">
          <Link2 size={16} className="text-[#6b2fa5]" />
        </div>
      }
      title="Create your event link"
      footer={
        <div className="flex flex-col-reverse sm:flex-row gap-3">
          <button
            onClick={handleDismiss}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Maybe later
          </button>
          <button
            onClick={handleCreate}
            disabled={submitting || !preview || slugStatus !== "available"}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-[#6b2fa5] text-white hover:bg-[#5a2589] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={14} />}
            {submitting ? "Creating..." : "Create link"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/shortLink.svg" alt="" className="h-28 w-auto" />
        </div>

        <p className="text-sm text-gray-600 leading-relaxed text-center">
          Spotix now supports short links for easier link sharing. Looks like your event
          doesn&apos;t have one yet. No biggie, create one now.
        </p>

        <div>
          <div className="flex items-stretch rounded-lg border-2 border-slate-200 focus-within:ring-2 focus-within:ring-[#6b2fa5] focus-within:border-[#6b2fa5] overflow-hidden bg-white">
            <span className="hidden sm:flex items-center px-3 bg-slate-50 border-r border-slate-200 text-xs text-slate-500 whitespace-nowrap">
              {(spotixUserBase || "spotix.com").replace(/^https?:\/\//, "")}/event/
            </span>
            <div className="relative flex-1">
              <Pencil className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                autoFocus
                placeholder="your event name"
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { if (slugStatus === "available") handleCreate(); else checkSlugNow() } }}
                disabled={submitting}
                className="w-full pl-9 pr-9 py-3 text-slate-900 placeholder:text-slate-400 outline-none disabled:opacity-50"
              />
              {slugStatus === "checking" && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
              )}
              {slugStatus === "available" && (
                <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
              )}
              {(slugStatus === "taken" || slugStatus === "invalid") && (
                <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />
              )}
            </div>
          </div>

          {/* Live preview — type freely, spaces and all; this is what it
              actually turns into (and what gets checked/submitted). */}
          {rawInput && (
            <p className="text-xs mt-1.5 text-slate-500">
              Your link will look like:{" "}
              <span className="font-mono font-semibold text-[#6b2fa5]">
                {(spotixUserBase || "spotix.com").replace(/^https?:\/\//, "")}/event/{preview || "…"}
              </span>
            </p>
          )}

          <p className={`text-xs mt-1.5 ${slugStatus === "taken" || slugStatus === "invalid" ? "text-red-600" : "text-slate-500"}`}>
            {slugStatus === "taken" && "That link is already in use. Try something else."}
            {slugStatus === "invalid" && SLUG_RULES_HINT}
            {slugStatus === "pending" && "We'll check if it's available once you stop typing. "}
            {slugStatus === "checking" && "Checking availability… "}
            {(slugStatus === "idle" || slugStatus === "available") &&
              "Slugs may not even be the exact name of your event, just make sure it’s something you’ll remember and easy to share."}
            {slugStatus === "pending" && (
              <button type="button" onClick={checkSlugNow} className="font-semibold text-[#6b2fa5] hover:underline">
                Check now
              </button>
            )}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 flex gap-2">
            <AlertCircle size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}
      </div>
    </ResponsiveSheet>
  )
}
