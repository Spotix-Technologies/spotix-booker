// app/components/event-info/checkin-tab.tsx
//
// Event-day check-in: QR / manual ticketId / email lookup AND the actual
// check-in write all go to the Supabase online registry only
// (app/lib/checkin-db.ts) — never Firestore directly, that's the whole
// cost-saving point of this tab. Firestore only ever hears about a
// check-in via an explicit Pull/Push (or the scheduled auto sync), never
// as a side effect of scanning someone in.

"use client"

import { useState, useEffect, useCallback } from "react"
import type React from "react"
import {
  QrCode, Hash, Mail, Loader2, Info, CheckCircle2, Sparkles, Search, RotateCw,
  ArrowDownToLine, ArrowUpFromLine,
} from "lucide-react"
import { authFetch } from "@/lib/auth-client"
import { toast } from "@/lib/toast"
import Que from "./helper/ques"
import CheckinQrScanner from "./helper/checkin-qr-scanner"

interface CheckinTabProps {
  eventId: string
  eventName: string
  /** From the Firestore event doc — the ONLY Firestore-sourced number this
   *  tab needs; it's already loaded by the parent page for the header, so
   *  no extra read happens getting it here. */
  ticketsSold: number
}

interface CheckinStatus {
  hasRegistry: boolean
  registryCount: number
  ticketsSold: number
  hasSyncKey: boolean
  pendingPushCount: number
  /** ISO string of the scheduled one-off push, or null if none pending. */
  autoSyncAt: string | null
  /** Whether THIS viewer is allowed to schedule/cancel it — false for the
   *  built-in "checkin" role even when they can see an existing schedule. */
  canManageAutoSync: boolean
}

interface LookupResult {
  ticket_id: string
  full_name: string | null
  email: string | null
  ticket_type: string | null
  verified: boolean
  checked_in_at: string | null
  checked_in_by_name: string | null
  checked_in_via: string | null
}

function formatCheckinTime(iso: string | null): string {
  if (!iso) return ""
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

type ScanMode = "qr" | "manual" | "email"

const MODES: { id: ScanMode; label: string; icon: React.ReactNode }[] = [
  { id: "qr", label: "QR Scan", icon: <QrCode size={15} /> },
  { id: "manual", label: "Ticket ID", icon: <Hash size={15} /> },
  { id: "email", label: "Email", icon: <Mail size={15} /> },
]

//  Offline scanner tooltip ─
// Hover handlers live on the WRAPPER (not just the button) so moving the
// cursor down into the popover to reach "Learn more" never triggers a
// mouseleave — the popover is a sibling inside the same hover boundary.
// Positioning: anchored left with a viewport-clamped width on small
// screens (so it can't spill off the left edge of a narrow phone), right-
// anchored at a fixed width from `sm:` up.
function OfflineScannerTooltip() {
  const [open, setOpen] = useState(false)
  return (
    <div
      className="relative flex-shrink-0"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700 transition-colors text-xs font-semibold"
      >
        <Info size={14} /> Network spotty?
      </button>
      {open && (
        <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-2 w-[min(18rem,calc(100vw-2.5rem))] bg-slate-900 text-white text-xs leading-relaxed rounded-xl p-4 shadow-2xl z-20">
          Do you feel network may be spotty? Spotix has an offline scanning desktop application.{" "}
          <a href="#" className="underline underline-offset-2 font-semibold">Learn more</a>
        </div>
      )}
    </div>
  )
}

//  Empty state 
function CheckinEmptyState({ onStart, starting }: { onStart: () => void; starting: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 px-6 bg-white border-2 border-dashed border-slate-200 rounded-2xl text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/no-online.svg" alt="No online registry yet" className="w-40 h-40 object-contain" />
      <div className="space-y-1.5 max-w-sm">
        <p className="font-semibold text-slate-700">
          Nothing but vibes and tumbleweeds in your online registry. Wanna add?
        </p>
        <a href="#" className="text-xs text-[#6b2fa5] font-semibold underline underline-offset-2">
          What is online registry?
        </a>
      </div>
      <button
        onClick={onStart}
        disabled={starting}
        className="mt-2 flex items-center gap-2 px-6 py-3 bg-[#6b2fa5] text-white font-semibold rounded-xl shadow-lg shadow-[#6b2fa5]/25 hover:bg-[#5a2690] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100"
      >
         Build Online Registry
      </button>
    </div>
  )
}

//  Main 
export default function CheckinTab({ eventId, eventName, ticketsSold }: CheckinTabProps) {
  const [status, setStatus] = useState<CheckinStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)

  const [building, setBuilding] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [scheduleBusy, setScheduleBusy] = useState(false)
  const [scheduleInput, setScheduleInput] = useState("")

  const [scanMode, setScanMode] = useState<ScanMode>("qr")
  const [manualValue, setManualValue] = useState("")
  const [lookupResults, setLookupResults] = useState<LookupResult[]>([])
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [checkinLoading, setCheckinLoading] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    try {
      const res = await authFetch(`/api/event/list/${eventId}/checkin?action=status`)
      const data = await res.json()
      if (res.ok && data.success) {
        setStatus({
          hasRegistry: data.hasRegistry,
          registryCount: data.registryCount,
          ticketsSold: data.ticketsSold,
          hasSyncKey: data.hasSyncKey,
          pendingPushCount: data.pendingPushCount ?? 0,
          autoSyncAt: data.autoSyncAt ?? null,
          canManageAutoSync: Boolean(data.canManageAutoSync),
        })
      }
    } catch {
      // non-fatal — tab falls back to the empty state, booker can retry via Start
    } finally {
      setStatusLoading(false)
    }
  }, [eventId])

  useEffect(() => { loadStatus() }, [loadStatus])

  const handleStartRegistry = async () => {
    setBuilding(true)
    try {
      const res = await authFetch(`/api/event/list/${eventId}/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "build" }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to build registry")
      toast.success("Checkin may now start.", {
        description: `${data.imported} attendee${data.imported !== 1 ? "s" : ""} imported.`,
      })
      await loadStatus()
    } catch (e: any) {
      toast.error("Couldn't build the virtual registry", { description: e?.message })
    } finally {
      setBuilding(false)
    }
  }

  const handlePull = async () => {
    setPulling(true)
    try {
      const res = await authFetch(`/api/event/list/${eventId}/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pull" }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error ?? "Pull failed")
      toast.success(
        data.imported > 0 ? `Pulled ${data.imported} new ticket${data.imported !== 1 ? "s" : ""} from Firestore.` : "Already up to date."
      )
      await loadStatus()
    } catch (e: any) {
      toast.error("Pull failed", { description: e?.message })
    } finally {
      setPulling(false)
    }
  }

  const handlePush = async () => {
    setPushing(true)
    try {
      const res = await authFetch(`/api/event/list/${eventId}/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "push" }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error ?? "Push failed")
      toast.success(
        data.pushed > 0 ? `Pushed ${data.pushed} check-in${data.pushed !== 1 ? "s" : ""} back to Firestore.` : "Already up to date."
      )
      await loadStatus()
    } catch (e: any) {
      toast.error("Push failed", { description: e?.message })
    } finally {
      setPushing(false)
    }
  }

  const handleScheduleAutoSync = async () => {
    if (!scheduleInput) return
    const runAt = new Date(scheduleInput)
    if (isNaN(runAt.getTime())) { toast.error("Pick a valid date and time"); return }
    if (runAt.getTime() <= Date.now()) { toast.error("Pick a time in the future"); return }

    setScheduleBusy(true)
    try {
      const res = await authFetch(`/api/event/list/${eventId}/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "scheduleAutoSync", runAt: runAt.toISOString() }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to schedule auto sync")
      toast.success(`Auto sync scheduled for ${formatCheckinTime(runAt.toISOString())}.`)
      setScheduleInput("")
      await loadStatus()
    } catch (e: any) {
      toast.error("Couldn't schedule auto sync", { description: e?.message })
    } finally {
      setScheduleBusy(false)
    }
  }

  const handleCancelAutoSync = async () => {
    setScheduleBusy(true)
    try {
      const res = await authFetch(`/api/event/list/${eventId}/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancelAutoSync" }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to cancel auto sync")
      toast.success("Auto sync schedule cancelled.")
      await loadStatus()
    } catch (e: any) {
      toast.error("Couldn't cancel auto sync", { description: e?.message })
    } finally {
      setScheduleBusy(false)
    }
  }

  const runLookup = useCallback(async (opts: { ticketId?: string; email?: string }) => {
    setLookupLoading(true)
    setLookupError(null)
    setLookupResults([])
    try {
      const params = new URLSearchParams({ action: "lookup" })
      if (opts.ticketId) params.set("ticketId", opts.ticketId)
      if (opts.email) params.set("email", opts.email)
      const res = await authFetch(`/api/event/list/${eventId}/checkin?${params.toString()}`)
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error ?? "Lookup failed")
      let results: LookupResult[] = data.results ?? []

      // Email lookups can return more than one ticket (a guest bought
      // several under the same email). Surface the next un-checked-in
      // ticket first, so whoever's at the door doesn't have to hunt
      // through already-checked-in entries to find the next one in line.
      if (opts.email && results.length > 1) {
        results = [...results].sort((a, b) => Number(a.verified) - Number(b.verified))
      }

      setLookupResults(results)
      if (results.length === 0) setLookupError("No matching ticket in the online registry.")
      return results
    } catch (e: any) {
      setLookupError(e?.message ?? "Lookup failed")
      return null
    } finally {
      setLookupLoading(false)
    }
  }, [eventId])

  const handleQrScan = useCallback((value: string) => {
    if (lookupLoading) return
    runLookup({ ticketId: value.trim() }).then((results) => {
      // A QR scan is unattended (no one's reading the card before acting
      // on it the way they would with a manual/email lookup) — flag an
      // already-checked-in ticket immediately so it isn't missed.
      const ticket = results?.[0]
      if (ticket?.verified) {
        toast.error(
          `Already checked in${ticket.checked_in_by_name ? ` by ${ticket.checked_in_by_name}` : ""}`,
          { description: ticket.checked_in_at ? formatCheckinTime(ticket.checked_in_at) : undefined }
        )
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runLookup])

  const handleManualSubmit = () => {
    if (!manualValue.trim()) return
    if (scanMode === "email") runLookup({ email: manualValue.trim() })
    else runLookup({ ticketId: manualValue.trim() })
  }

  const handleCheckIn = async (ticketId: string) => {
    setCheckinLoading(ticketId)
    try {
      const res = await authFetch(`/api/event/list/${eventId}/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "checkin", ticketId, via: scanMode }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error ?? "Check-in failed")
      setLookupResults((prev) => prev.map((r) => (r.ticket_id === ticketId ? data.ticket : r)))
      toast.success(`${data.ticket.full_name ?? "Guest"} checked in`)
    } catch (e: any) {
      toast.error("Check-in failed", { description: e?.message })
    } finally {
      setCheckinLoading(null)
    }
  }

  // Offline scanner already set up AND Firestore's ticketsSold has moved
  // past what's mirrored in Supabase — i.e. new sales since the registry
  // was built/last synced.
  const needsSync = Boolean(status?.hasRegistry && ticketsSold > status.registryCount)

  if (statusLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400 gap-2">
        <Loader2 size={22} className="animate-spin" /> Loading check-in…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Check-in</h2>
          <p className="text-sm text-slate-500 mt-0.5">Scan or look up tickets for {eventName}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* The two directions, always available once a registry exists —
              deliberately separate buttons, not one "Sync": pulling new
              ticket sales in and pushing check-ins back out are different
              operations that go opposite ways. */}
          {status?.hasRegistry && (
            <>
              <button
                type="button"
                onClick={handlePull}
                disabled={pulling}
                title="Pull new ticket sales from Firestore into the online registry"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-800 transition-colors text-xs font-semibold disabled:opacity-50"
              >
                {pulling ? <Loader2 size={14} className="animate-spin" /> : <ArrowDownToLine size={14} />}
                Pull from Global Registry
              </button>
              <button
                type="button"
                onClick={handlePush}
                disabled={pushing}
                title="Push verified check-ins from the online registry back to Firestore"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-800 transition-colors text-xs font-semibold disabled:opacity-50"
              >
                {pushing ? <Loader2 size={14} className="animate-spin" /> : <ArrowUpFromLine size={14} />}
                Push to Global Registry
              </button>
            </>
          )}
          <OfflineScannerTooltip />
        </div>
      </div>

      {status?.hasSyncKey && (
        <Que tone="info" message="Offline check-in is already set up for this event via a sync key." />
      )}

      {/* Auto sync — a ONE-OFF scheduled push (Supabase → Firestore) at a
          specific date/time the admin picks, run by a real pg_cron job
          (see supabase/checkin-registry.sql). It's not a recurring
          "every few minutes" toggle, and it doesn't touch new ticket
          sales — pulling those stays manual ("Pull", below). Only the
          built-in "checkin" role is blocked from setting/cancelling it
          (canManageAutoSync) — they can still see an existing schedule. */}
      {status?.hasRegistry && (status.canManageAutoSync || status.autoSyncAt) && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 space-y-3">
          <div className="flex items-center gap-2 min-w-0">
            <RotateCw size={15} className="text-slate-400 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800">Auto sync</p>
              <p className="text-xs text-slate-500">
                Push check-ins back to Global Registry automatically at a scheduled date and time.
              </p>
            </div>
          </div>

          {status.autoSyncAt ? (
            <div className="flex items-center justify-between gap-3 flex-wrap pl-6">
              <p className="text-sm text-slate-700">
                Scheduled for <span className="font-semibold">{formatCheckinTime(status.autoSyncAt)}</span>
              </p>
              {status.canManageAutoSync && (
                <button
                  onClick={handleCancelAutoSync}
                  disabled={scheduleBusy}
                  className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
                >
                  Cancel
                </button>
              )}
            </div>
          ) : status.canManageAutoSync ? (
            <div className="flex items-center gap-2 flex-wrap pl-6">
              <input
                type="datetime-local"
                value={scheduleInput}
                onChange={(e) => setScheduleInput(e.target.value)}
                className="px-3 py-2 border-2 border-slate-200 rounded-lg text-sm focus:outline-none focus:border-[#6b2fa5] focus:ring-4 focus:ring-[#6b2fa5]/10"
              />
              <button
                onClick={handleScheduleAutoSync}
                disabled={scheduleBusy || !scheduleInput}
                className="px-3 py-2 bg-[#6b2fa5] text-white rounded-lg font-semibold text-xs hover:bg-[#5a2690] disabled:opacity-50 flex items-center gap-1.5"
              >
                {scheduleBusy && <Loader2 size={13} className="animate-spin" />}
                Schedule
              </button>
            </div>
          ) : null}
        </div>
      )}

      {/* Pull: new ticket sales in Firestore not yet in the registry. Only
          shown once there IS an online registry with attendees loaded — a
          fresh/empty event with nothing sold yet has nothing to pull.
          Purely informational — "Pull from Firestore" above is the action. */}
      {status?.hasRegistry && status.registryCount > 0 && needsSync && (
        <Que tone="warning" message="Looks like you had new ticket sale. Sync up?" />
      )}

      {/* Push: verified check-ins sitting in Supabase that haven't made it
          to Global Registry yet — this is the normal state between scans and a
          Push, not a failure indicator. "Push to Global Registry" above is the
          action, or auto sync will pick it up at its scheduled time. */}
      {status?.hasRegistry && status.pendingPushCount > 0 && (
        <Que
          tone="warning"
          message={`${status.pendingPushCount} check-in${status.pendingPushCount !== 1 ? "s haven't" : " hasn't"} synced back to Firestore yet.`}
        />
      )}

      {building && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 bg-white border-2 border-slate-200 rounded-2xl">
          <Loader2 size={28} className="animate-spin text-[#6b2fa5]" />
          <p className="text-sm font-medium text-slate-600">Please wait as we build the registry</p>
        </div>
      )}

      {!building && !status?.hasRegistry && (
        <CheckinEmptyState onStart={handleStartRegistry} starting={building} />
      )}

      {!building && status?.hasRegistry && (
        <div className="space-y-5">
          <div className="flex gap-2 flex-wrap">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => { setScanMode(m.id); setLookupResults([]); setLookupError(null) }}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 text-sm font-semibold transition-all ${
                  scanMode === m.id
                    ? "border-[#6b2fa5] bg-[#6b2fa5]/5 text-[#6b2fa5]"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                {m.icon} {m.label}
              </button>
            ))}
          </div>

          {scanMode === "qr" ? (
            <CheckinQrScanner active onScan={handleQrScan} />
          ) : (
            <div className="flex gap-2 max-w-md">
              <input
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
                placeholder={scanMode === "email" ? "attendee@email.com" : "Ticket ID"}
                className="flex-1 px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-[#6b2fa5] focus:ring-4 focus:ring-[#6b2fa5]/10"
              />
              <button
                onClick={handleManualSubmit}
                disabled={lookupLoading || !manualValue.trim()}
                className="px-4 py-2.5 bg-[#6b2fa5] text-white rounded-xl font-semibold text-sm hover:bg-[#5a2690] disabled:opacity-50 flex items-center gap-2"
              >
                {lookupLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                Look up
              </button>
            </div>
          )}

          {lookupError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 max-w-md">
              {lookupError}
            </div>
          )}

          {/* Multiple tickets under one email — the list above is already
              sorted un-checked-in first; this just names what's going on. */}
          {scanMode === "email" && lookupResults.length > 1 && (
            <p className="text-xs text-slate-500 max-w-md">
              {lookupResults.filter((r) => r.verified).length} of {lookupResults.length} tickets for this email are
              already checked in — showing the next one first.
            </p>
          )}

          {lookupResults.length > 0 && (
            <div className="space-y-2 max-w-md">
              {lookupResults.map((r) => (
                <div
                  key={r.ticket_id}
                  className={`flex items-center justify-between gap-3 p-4 bg-white border-2 rounded-xl ${
                    r.verified ? "border-slate-100" : "border-slate-200"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{r.full_name ?? "Unnamed guest"}</p>
                    <p className="text-xs text-slate-500 truncate">{r.email} · {r.ticket_type}</p>
                    {r.verified && (
                      <p className="text-xs text-[#6b2fa5] mt-1">
                        Already checked in
                        {r.checked_in_by_name ? ` by ${r.checked_in_by_name}` : r.checked_in_via === "offline-sync" ? " via the offline scanner" : ""}
                        {r.checked_in_at ? ` · ${formatCheckinTime(r.checked_in_at)}` : ""}
                      </p>
                    )}
                  </div>
                  {r.verified ? (
                    <span className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-500">
                      <CheckCircle2 size={12} /> Checked In
                    </span>
                  ) : (
                    <button
                      onClick={() => handleCheckIn(r.ticket_id)}
                      disabled={checkinLoading === r.ticket_id}
                      className="flex-shrink-0 px-4 py-2 bg-[#6b2fa5] text-white rounded-lg font-semibold text-xs hover:bg-[#5a2690] disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {checkinLoading === r.ticket_id
                        ? <Loader2 size={13} className="animate-spin" />
                        : <CheckCircle2 size={13} />}
                      Check In
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
