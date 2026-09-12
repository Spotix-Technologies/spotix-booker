"use client"

import { useState, useEffect } from "react"
import { X, FileJson, FileText, Download, Key, Loader2, CheckCircle, AlertCircle, Copy, Eye, EyeOff } from "lucide-react"
import { authFetch } from "@/lib/auth-client"
import Que from "./ques"

interface RegistryDialogProps {
  open: boolean
  onClose: () => void
  onExport: (format: "json" | "csv") => void
  attendeeCount: number
  eventId: string
  eventName: string
}

type Step = "format" | "generating" | "key-reveal" | "done"

export default function RegistryDialog({
  open,
  onClose,
  onExport,
  attendeeCount,
  eventId,
  eventName,
}: RegistryDialogProps) {
  const [selectedFormat, setSelectedFormat] = useState<"json" | "csv" | null>(null)
  const [step, setStep] = useState<Step>("format")
  const [secretKey, setSecretKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [keyVisible, setKeyVisible] = useState(false)

  // Does this event already have an online (Supabase) check-in registry?
  // Only matters for the JSON path — that's the one that also sets up
  // OFFLINE scanning via a sync key, so a booker who already has an online
  // registry running is likely about to double up on check-in setups.
  const [hasOnlineRegistry, setHasOnlineRegistry] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    authFetch(`/api/event/list/${eventId}/checkin?action=status`)
      .then((res) => res.json())
      .then((data) => { if (!cancelled && data?.success) setHasOnlineRegistry(Boolean(data.hasRegistry)) })
      .catch(() => { /* non-critical — just skip the que */ })
    return () => { cancelled = true }
  }, [open, eventId])

  if (!open) return null

  const handleExport = async () => {
    if (!selectedFormat) return

    // CSV export has no key ceremony — download directly
    if (selectedFormat === "csv") {
      onExport("csv")
      handleClose()
      return
    }

    // JSON export: generate sync key first
    setStep("generating")
    setError(null)

    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Unknown error" }))
        throw new Error(body.error ?? `Server returned ${res.status}`)
      }

      const data = await res.json() as { key: string }
      setSecretKey(data.key)
      setStep("key-reveal")
    } catch (e) {
      setError(String(e))
      setStep("format")
    }
  }

  const handleProceedDownload = () => {
    onExport("json")
    setStep("done")
  }

  const handleClose = () => {
    onClose()
    // Reset after animation
    setTimeout(() => {
      setSelectedFormat(null)
      setStep("format")
      setSecretKey(null)
      setError(null)
      setCopied(false)
      setKeyVisible(false)
    }, 200)
  }

  const handleCopy = () => {
    if (!secretKey) return
    navigator.clipboard.writeText(secretKey).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={step === "generating" ? undefined : handleClose} />

      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">

        {/* ── Step: format selection ── */}
        {(step === "format" || step === "generating") && (
          <>
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Download Attendees</h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  {attendeeCount} attendee{attendeeCount !== 1 ? "s" : ""} will be exported
                </p>
              </div>
              <button
                onClick={handleClose}
                disabled={step === "generating"}
                className="p-2 hover:bg-slate-100 rounded-xl transition-all duration-200 hover:scale-110 active:scale-95 disabled:opacity-40"
              >
                <X size={20} className="text-slate-500" />
              </button>
            </div>

            <div className="px-6 py-6">
              <p className="text-sm font-semibold text-slate-700 mb-4 uppercase tracking-wide">
                Choose Export Format
              </p>
              <div className="grid grid-cols-2 gap-4">
                {/* JSON */}
                <button
                  onClick={() => setSelectedFormat("json")}
                  disabled={step === "generating"}
                  className={`relative flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all duration-200 cursor-pointer group ${
                    selectedFormat === "json"
                      ? "border-[#6b2fa5] bg-[#6b2fa5]/5 shadow-md shadow-[#6b2fa5]/10"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {selectedFormat === "json" && (
                    <span className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-[#6b2fa5]" />
                  )}
                  <div className={`p-3 rounded-xl transition-all duration-200 ${
                    selectedFormat === "json"
                      ? "bg-[#6b2fa5] text-white shadow-lg shadow-[#6b2fa5]/30"
                      : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
                  }`}>
                    <FileJson size={28} />
                  </div>
                  <div className="text-center">
                    <p className={`text-sm font-bold ${selectedFormat === "json" ? "text-[#6b2fa5]" : "text-slate-700"}`}>
                      JSON
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">.json file</p>
                  </div>
                </button>

                {/* CSV */}
                <button
                  onClick={() => setSelectedFormat("csv")}
                  disabled={step === "generating"}
                  className={`relative flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all duration-200 cursor-pointer group ${
                    selectedFormat === "csv"
                      ? "border-[#6b2fa5] bg-[#6b2fa5]/5 shadow-md shadow-[#6b2fa5]/10"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {selectedFormat === "csv" && (
                    <span className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-[#6b2fa5]" />
                  )}
                  <div className={`p-3 rounded-xl transition-all duration-200 ${
                    selectedFormat === "csv"
                      ? "bg-[#6b2fa5] text-white shadow-lg shadow-[#6b2fa5]/30"
                      : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
                  }`}>
                    <FileText size={28} />
                  </div>
                  <div className="text-center">
                    <p className={`text-sm font-bold ${selectedFormat === "csv" ? "text-[#6b2fa5]" : "text-slate-700"}`}>
                      CSV
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">.csv file</p>
                  </div>
                </button>
              </div>

              {/* JSON sync key notice */}
              {selectedFormat === "json" && (
                <div className="mt-4 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <Key size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 leading-relaxed">
                    We will generate a <strong>secret sync key</strong> that you will use to sync check-ins back to Spotix Booker after the event.
                  </p>
                </div>
              )}

              {/* Que: already has an online registry — offer a nudge before
                  they also set up offline scanning */}
              {selectedFormat === "json" && hasOnlineRegistry && (
                <div className="mt-3">
                  <Que
                    tone="warning"
                    message="Looks like you have a digital registry for scanning online. You sure you wanna also scan offline?"
                  />
                </div>
              )}

              {/* Fields preview */}
              <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Exported Fields</p>
                <div className="flex flex-wrap gap-2">
                  {["eventId", "eventName", "fullName", "email", "ticketId", "ticketType", "faceEmbeddings"].map((field) => (
                    <span
                      key={field}
                      className={`inline-flex items-center px-2.5 py-1 border text-xs font-mono rounded-lg ${
                        ["eventId", "eventName"].includes(field)
                          ? "bg-[#6b2fa5]/5 border-[#6b2fa5]/20 text-[#6b2fa5]"
                          : "bg-white border-slate-200 text-slate-600"
                      }`}
                    >
                      {field}
                    </span>
                  ))}
                </div>
              </div>

              {error && (
                <div className="mt-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
                  <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{error}</p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
              <button
                onClick={handleClose}
                disabled={step === "generating"}
                className="flex-1 py-2.5 px-4 rounded-xl border-2 border-slate-200 text-slate-700 font-semibold text-sm hover:bg-white transition-all duration-200 hover:border-slate-300 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={!selectedFormat || step === "generating"}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-semibold text-sm transition-all duration-200 ${
                  selectedFormat && step !== "generating"
                    ? "bg-[#6b2fa5] text-white hover:bg-[#5a2690] shadow-lg shadow-[#6b2fa5]/30 hover:scale-[1.02] active:scale-[0.98]"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed"
                }`}
              >
                {step === "generating" ? (
                  <><Loader2 size={16} className="animate-spin" /> Generating key...</>
                ) : (
                  <><Download size={16} /> Export {selectedFormat ? selectedFormat.toUpperCase() : ""}</>
                )}
              </button>
            </div>
          </>
        )}

        {/* ── Step: key reveal ── */}
        {step === "key-reveal" && secretKey && (
          <>
            <div className="px-6 pt-6 pb-2">
              <div className="w-12 h-12 rounded-2xl bg-[#6b2fa5]/10 flex items-center justify-center mb-4">
                <Key size={24} className="text-[#6b2fa5]" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Your Sync Key</h3>
              <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                Save this key — you will need it to sync check-in results back to{" "}
                <span className="font-semibold text-slate-700">{eventName}</span> after the event.
                It will not be shown again.
              </p>
            </div>

            <div className="px-6 py-5">
              {/* Key display */}
              <div className="relative bg-slate-900 rounded-xl p-4 font-mono">
                <p className="text-xs text-slate-500 mb-2 uppercase tracking-wider">Sync Key</p>
                <div className="flex items-center gap-3">
                  <p className="text-lg font-bold tracking-[0.2em] text-white flex-1">
                    {keyVisible ? secretKey : "••••••••••••"}
                  </p>
                  <button
                    onClick={() => setKeyVisible(v => !v)}
                    className="p-1.5 text-slate-400 hover:text-white transition-colors"
                    title={keyVisible ? "Hide key" : "Reveal key"}
                  >
                    {keyVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                  <button
                    onClick={handleCopy}
                    className={`p-1.5 transition-colors ${copied ? "text-emerald-400" : "text-slate-400 hover:text-white"}`}
                    title="Copy to clipboard"
                  >
                    {copied ? <CheckCircle size={16} /> : <Copy size={16} />}
                  </button>
                </div>
              </div>

              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 leading-relaxed">
                ⚠️ <strong>Store this key securely.</strong> You will enter it in the Spotix Scanner sync page to push check-in data back to Booker. This key is tied to <strong>{eventName}</strong> and cannot be recovered.
              </div>
            </div>

            <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
              <button
                onClick={handleClose}
                className="flex-1 py-2.5 px-4 rounded-xl border-2 border-slate-200 text-slate-700 font-semibold text-sm hover:bg-white transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleProceedDownload}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-semibold text-sm bg-[#6b2fa5] text-white hover:bg-[#5a2690] shadow-lg shadow-[#6b2fa5]/30 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <Download size={16} />
                I've saved the key — Download
              </button>
            </div>
          </>
        )}

        {/* ── Step: done ── */}
        {step === "done" && (
          <div className="px-6 py-10 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle size={28} className="text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Guest list exported!</h3>
              <p className="text-sm text-slate-500 mt-1">Import the JSON file into Spotix Scanner to begin check-ins.</p>
            </div>
            <button
              onClick={handleClose}
              className="mt-2 px-8 py-2.5 rounded-xl bg-[#6b2fa5] text-white font-semibold text-sm hover:bg-[#5a2690] transition-all"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
