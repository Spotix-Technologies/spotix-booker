"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { FileBarChart2, Loader2, Mail, Download, AlertCircle, CheckCircle2, Clock, RotateCcw } from "lucide-react"
import { authFetch } from "@/lib/auth-client"
import { ResponsiveSheet } from "@/components/ui/responsive-sheet"

type Phase = "checking" | "not-ended" | "intro" | "processing" | "ready" | "failed"

interface AttendeePostMortemDialogProps {
  open: boolean
  onClose: () => void
  eventId: string
  eventName: string
  eventHasEnded: boolean
  requesterEmail?: string
}

const POLL_INTERVAL_MS = 5000

export default function AttendeePostMortemDialog({
  open,
  onClose,
  eventId,
  eventName,
  eventHasEnded,
  requesterEmail,
}: AttendeePostMortemDialogProps) {
  const [phase, setPhase] = useState<Phase>("checking")
  const [error, setError] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [generatedByName, setGeneratedByName] = useState<string | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const baseUrl = `/api/event/list/${eventId}/post-mortem`

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const applyStatus = useCallback(
    (data: {
      status: string
      downloadUrl?: string | null
      error?: string
      generatedAt?: string | null
      requestedByName?: string | null
    }) => {
      if (data.status === "ready") {
        setDownloadUrl(data.downloadUrl ?? null)
        setGeneratedByName(data.requestedByName ?? null)
        setGeneratedAt(data.generatedAt ?? null)
        setPhase("ready")
        clearPoll()
      } else if (data.status === "processing") {
        setPhase("processing")
      } else if (data.status === "failed") {
        setError(data.error ?? "Something went wrong while building the report.")
        setPhase("failed")
        clearPoll()
      } else {
        setPhase("intro")
        clearPoll()
      }
    },
    [clearPoll]
  )

  const checkStatus = useCallback(async () => {
    try {
      const res = await authFetch(baseUrl)
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to check status")
      applyStatus(data)
    } catch (e: any) {
      setError(e?.message ?? "Failed to check post mortem status")
      setPhase("failed")
      clearPoll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, applyStatus])

  // ── On open: check current status, and immediately flag if the event
  // hasn't ended (dropdown already prevents this, but the dialog stays
  // safe on its own). ──
  useEffect(() => {
    if (!open) {
      clearPoll()
      return
    }
    if (!eventHasEnded) {
      setPhase("not-ended")
      return
    }
    setPhase("checking")
    setError(null)
    checkStatus()
    return () => clearPoll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, eventId])

  // ── Poll while processing ──
  useEffect(() => {
    if (phase === "processing" && open) {
      pollRef.current = setInterval(checkStatus, POLL_INTERVAL_MS)
    } else {
      clearPoll()
    }
    return () => clearPoll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, open])

  const handleGenerate = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await authFetch(baseUrl, { method: "POST" })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to start generation")
      applyStatus(data)
    } catch (e: any) {
      setError(e?.message ?? "Failed to start post mortem generation")
      setPhase("failed")
    } finally {
      setSubmitting(false)
    }
  }

  const handleDownload = () => {
    // downloadUrl is our own /post-mortem/download proxy route, not a raw
    // Supabase signed URL — it mints a fresh short-lived one server-side on
    // every request, so there's nothing to pre-refresh here anymore.
    if (downloadUrl) window.open(downloadUrl, "_blank", "noopener,noreferrer")
  }

  const handleClose = () => {
    clearPoll()
    onClose()
  }

  return (
    <ResponsiveSheet
      open={open}
      onClose={handleClose}
      size="md"
      dismissible={!submitting}
      icon={
        <div className="w-10 h-10 rounded-xl bg-[#6b2fa5]/10 flex items-center justify-center">
          <FileBarChart2 size={20} className="text-[#6b2fa5]" />
        </div>
      }
      title="Attendee Post Mortem"
      description={<span className="block truncate">{eventName}</span>}
      footer={
        <div className="flex flex-col-reverse sm:flex-row items-stretch gap-3">
          {phase === "intro" && (
            <>
              <button
                onClick={handleClose}
                className="flex-1 py-2.5 px-4 rounded-xl border-2 border-slate-200 text-slate-700 font-semibold text-sm hover:bg-white transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={submitting}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-semibold text-sm bg-[#6b2fa5] text-white hover:bg-[#5a2690] shadow-lg shadow-[#6b2fa5]/30 transition-all disabled:opacity-50"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <FileBarChart2 size={16} />}
                Generate Report
              </button>
            </>
          )}

          {(phase === "processing" || phase === "checking") && (
            <button
              onClick={handleClose}
              className="flex-1 py-2.5 px-4 rounded-xl border-2 border-slate-200 text-slate-700 font-semibold text-sm hover:bg-white transition-all"
            >
              Close — I'll wait for the email
            </button>
          )}

          {phase === "not-ended" && (
            <button
              onClick={handleClose}
              className="flex-1 py-2.5 px-4 rounded-xl bg-[#6b2fa5] text-white font-semibold text-sm hover:bg-[#5a2690] transition-all"
            >
              Got it
            </button>
          )}

          {phase === "ready" && (
            <>
              <button
                onClick={handleClose}
                className="flex-1 py-2.5 px-4 rounded-xl border-2 border-slate-200 text-slate-700 font-semibold text-sm hover:bg-white transition-all"
              >
                Close
              </button>
              <button
                onClick={handleDownload}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-semibold text-sm bg-[#6b2fa5] text-white hover:bg-[#5a2690] shadow-lg shadow-[#6b2fa5]/30 transition-all"
              >
                <Download size={16} />
                Download PDF
              </button>
            </>
          )}

          {phase === "failed" && (
            <>
              <button
                onClick={handleClose}
                className="flex-1 py-2.5 px-4 rounded-xl border-2 border-slate-200 text-slate-700 font-semibold text-sm hover:bg-white transition-all"
              >
                Close
              </button>
              <button
                onClick={handleGenerate}
                disabled={submitting}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-semibold text-sm bg-[#6b2fa5] text-white hover:bg-[#5a2690] shadow-lg shadow-[#6b2fa5]/30 transition-all disabled:opacity-50"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                Try Again
              </button>
            </>
          )}
        </div>
      }
    >
      {phase === "checking" && (
        <div className="flex flex-col items-center gap-3 py-8 text-slate-400">
          <Loader2 size={24} className="animate-spin" />
          <p className="text-sm">Checking report status…</p>
        </div>
      )}

      {phase === "not-ended" && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
            <Clock size={22} className="text-amber-600" />
          </div>
          <p className="text-sm font-semibold text-slate-800">This event hasn't ended yet</p>
          <p className="text-sm text-slate-500">
            The post mortem report becomes available once the event's end date and time have passed.
          </p>
        </div>
      )}

      {phase === "intro" && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600 leading-relaxed">
            We'll build a detailed attendee behaviour report for this event.
          </p>
          <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3.5">
            <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 leading-relaxed">
              This report is only ever computed <strong>once</strong> per event. Once generated, you'll always
              download the same report. It can't be regenerated.
            </p>
          </div>
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
              <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}
        </div>
      )}

      {phase === "processing" && (
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <Loader2 size={30} className="animate-spin text-[#6b2fa5]" />
          <div>
            <p className="text-sm font-semibold text-slate-800">Please hold, we are computing the post mortem…</p>
            <p className="text-sm text-slate-500 mt-2 leading-relaxed">
              This can take a little while for larger events. Feel free to close this and carry on —
              we'll email you{requesterEmail ? <> at <strong>{requesterEmail}</strong></> : ""} as soon as it's
              ready.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Mail size={14} /> You'll get an email when the report is ready
          </div>
        </div>
      )}

      {phase === "ready" && (
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle2 size={24} className="text-green-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Your post mortem is ready</p>
            <p className="text-sm text-slate-500 mt-1">
              This report was generated once and won't change. Download it whenever you like.
            </p>
            {(generatedByName || generatedAt) && (
              <p className="text-xs text-slate-400 mt-2">
                Generated{generatedByName ? <> by <strong className="text-slate-500">{generatedByName}</strong></> : ""}
                {generatedAt ? <> on {new Date(generatedAt).toLocaleString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}</> : ""}
              </p>
            )}
          </div>
        </div>
      )}

      {phase === "failed" && (
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
            <AlertCircle size={24} className="text-red-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Report generation failed</p>
            <p className="text-sm text-slate-500 mt-1">{error ?? "Something went wrong."}</p>
          </div>
        </div>
      )}
    </ResponsiveSheet>
  )
}
