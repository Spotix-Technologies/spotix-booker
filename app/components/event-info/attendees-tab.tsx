"use client"

import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import {
  User, Mail, ShoppingCart, CheckCircle2, XCircle, ChevronDown,
  Search, Filter, Download, X, Ticket, Clock, Hash, Loader2, FileBarChart2, FileSpreadsheet,
} from "lucide-react"
import RegistryDialog from "./helper/registry-dialog"
import AttendeePostMortemDialog from "./helper/attendee-post-mortem-dialog"
import AttendeeFilterDialog, { EMPTY_ATTENDEE_FILTERS, type AttendeeFilters } from "./attendee-filter"
import Que from "./helper/ques"
import { dicebearAvatarUrl } from "@/lib/dicebear"
import { authFetch } from "@/lib/auth-client"
import { useAuth } from "@/hooks/useAuth"

interface AttendeeData {
  id: string
  fullName: string
  email: string
  ticketType: string
  verified: boolean
  purchaseDate: string
  purchaseDateISO: string
  purchaseTime: string
  ticketReference: string
  facialEnroll: "enrolled" | "unenrolled"
  faceEmbedding?: number[] | null
}

interface AttendeesTabProps {
  formatFirestoreTimestamp: (timestamp: any) => string
  eventId: string
  eventName: string
  eventEndDate: string
  eventEnd: string
  /** Ticket policy names configured on this event — powers the ticket-type
   *  filter dropdown. */
  ticketTypes: string[]
}

const PAGE_SIZE = 15

// ── Attendee Summary Dialog ───────────────────────────────────────────────────
// Shows just the one attendee's own ticket(s) — fetched on demand by email
// rather than filtered out of an already-loaded full roster, since the
// roster the tab holds is no longer the full attendee list.
function AttendeeDialog({
  attendee,
  emailTickets,
  loading,
  formatFirestoreTimestamp,
  onClose,
}: {
  attendee: AttendeeData
  emailTickets: AttendeeData[]
  loading: boolean
  formatFirestoreTimestamp: (ts: any) => string
  onClose: () => void
}) {
  const checkedInCount = emailTickets.filter((a) => a.verified).length

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-br from-[#6b2fa5] to-[#8b4fc5] p-6 text-white">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-white/20 overflow-hidden flex-shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={dicebearAvatarUrl(attendee.email)}
                alt={attendee.fullName}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold truncate">{attendee.fullName}</h3>
              <p className="text-purple-200 text-sm truncate">{attendee.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <div className="flex items-center gap-1.5 bg-white/15 rounded-lg px-3 py-1.5 text-sm font-semibold">
              <Ticket size={14} />
              {loading ? "…" : `${emailTickets.length} ticket${emailTickets.length !== 1 ? "s" : ""} purchased`}
            </div>
            <div className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${
              checkedInCount > 0 ? "bg-[#6b2fa5]/30 text-white" : "bg-white/10 text-white/70"
            }`}>
              <CheckCircle2 size={14} />
              {loading ? "…" : `${checkedInCount} checked in`}
            </div>
          </div>
        </div>

        <div className="p-5 space-y-3 max-h-72 overflow-y-auto">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ticket breakdown</p>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-slate-400 gap-2">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-sm">Loading tickets…</span>
            </div>
          ) : (
            emailTickets.map((t, i) => (
              <div
                key={t.id}
                className={`flex items-start gap-3 p-3.5 rounded-xl border transition-colors ${
                  t.verified ? "border-[#6b2fa5]/30 bg-[#6b2fa5]/5" : "border-slate-200 bg-slate-50"
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                  t.verified ? "bg-[#6b2fa5]/20 text-[#6b2fa5]" : "bg-slate-200 text-slate-600"
                }`}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900 truncate">{t.ticketType}</span>
                    {t.verified ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#6b2fa5] bg-[#6b2fa5]/10 border border-[#6b2fa5]/20 rounded-full px-2 py-0.5 flex-shrink-0">
                        <CheckCircle2 size={10} /> Checked In
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5 flex-shrink-0">
                        <XCircle size={10} /> Not Checked In
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Hash size={10} />{t.ticketReference}</span>
                    <span className="flex items-center gap-1"><Clock size={10} />{formatFirestoreTimestamp(t.purchaseDate)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="px-5 pb-5">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AttendeesTab({
  formatFirestoreTimestamp,
  eventId,
  eventName,
  eventEndDate,
  eventEnd,
  ticketTypes,
}: AttendeesTabProps) {
  const { user } = useAuth()

  // Paginated browse state — what's actually been read from the server so far.
  const [items, setItems] = useState<AttendeeData[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Aggregate stats from the server (cheap count() queries — accurate
  // regardless of how many rows are currently loaded on screen).
  const [totalCount, setTotalCount] = useState(0)
  const [checkedInCount, setCheckedInCount] = useState(0)
  const [notCheckedInCount, setNotCheckedInCount] = useState(0)

  // Search — searches the FULL roster, not just what's paginated in. The
  // full list is fetched once on first search and cached for the rest of
  // the tab's lifetime so repeated typing doesn't re-fetch every keystroke.
  const [searchTerm, setSearchTerm] = useState("")
  // Check-in / ticket-type / purchase-date-range filters, all combinable
  // with each other and with search. Applied via the AttendeeFilterDialog
  // (opened from the Filter button) rather than inline controls — the
  // dialog stages its own draft and only calls onApply (below) when the
  // admin clicks "Apply Filter". Pushed down to the server as query params
  // for the default paginated view (see buildFilterParams below); in
  // search mode they're applied client-side over the already-fetched full
  // roster instead, alongside the free-text match.
  const [filters, setFilters] = useState<AttendeeFilters>(EMPTY_ATTENDEE_FILTERS)
  const { checkInFilter, ticketTypeFilter, startDate, endDate } = filters
  const [filterDialogOpen, setFilterDialogOpen] = useState(false)
  // Count matching the CURRENT filter combo — distinct from totalCount
  // (always event-wide, powers the summary cards). Used for the "Load 15
  // more (x of y)" pager so it reads sensibly while filtered.
  const [matchingCount, setMatchingCount] = useState(0)
  const [fullRoster, setFullRoster] = useState<AttendeeData[] | null>(null)
  const [searchingFullRoster, setSearchingFullRoster] = useState(false)
  const rosterFetchStarted = useRef(false)

  // Targeted exact-match fast path for the search box: if what's typed
  // looks like a complete email or a ticket reference ("refId"), try a
  // real Firestore `where` query for just that one guest FIRST — that's
  // 1 read instead of reading the whole attendees collection. Only when
  // that comes back empty (a genuine partial/fuzzy name search, or a
  // still-being-typed email/ref) do we fall back to ensureFullRoster().
  const [targetedResults, setTargetedResults] = useState<AttendeeData[] | null>(null)
  const [targetedLookupLoading, setTargetedLookupLoading] = useState(false)

  const [selectedAttendee, setSelectedAttendee] = useState<AttendeeData | null>(null)
  const [selectedAttendeeTickets, setSelectedAttendeeTickets] = useState<AttendeeData[]>([])
  const [selectedAttendeeLoading, setSelectedAttendeeLoading] = useState(false)

  const [registryDialogOpen, setRegistryDialogOpen] = useState(false)
  const [postMortemDialogOpen, setPostMortemDialogOpen] = useState(false)
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const downloadMenuRef = useRef<HTMLDivElement>(null)

  // Online (Supabase) check-in registry status — fetched once, independent
  // of the paginated attendee load above, purely to power the "you're
  // scanning online" ques below the controls.
  const [checkinStatus, setCheckinStatus] = useState<{ hasRegistry: boolean; hasSyncKey: boolean } | null>(null)

  useEffect(() => {
    let cancelled = false
    authFetch(`/api/event/list/${eventId}/checkin?action=status`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data?.success) {
          setCheckinStatus({ hasRegistry: Boolean(data.hasRegistry), hasSyncKey: Boolean(data.hasSyncKey) })
        }
      })
      .catch(() => { /* non-critical — the ques just don't show */ })
    return () => { cancelled = true }
  }, [eventId])

  const baseUrl = `/api/event/list/${eventId}/attendees`

  // Event's end date+time have to have passed before a post mortem can be
  // generated — same "eventEndDate + eventEnd" combination used elsewhere
  // to know an event is over.
  const eventHasEnded = useMemo(() => {
    if (!eventEndDate || !eventEnd) return false
    const end = new Date(`${eventEndDate}T${eventEnd}`)
    return !isNaN(end.getTime()) && Date.now() > end.getTime()
  }, [eventEndDate, eventEnd])

  // ── Close the download dropdown on outside click ──
  useEffect(() => {
    if (!downloadMenuOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(e.target as Node)) {
        setDownloadMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [downloadMenuOpen])

  // ── Builds the combinable filter query params shared by the initial
  // page load and "load more" — server-side filtering so pagination only
  // ever returns matching rows, instead of filtering whatever happened to
  // already be loaded on screen. ──
  const buildFilterParams = useCallback(() => {
    const params = new URLSearchParams()
    if (checkInFilter === "checkedIn") params.set("checkedIn", "true")
    else if (checkInFilter === "notCheckedIn") params.set("checkedIn", "false")
    if (ticketTypeFilter.length > 0) params.set("ticketTypes", ticketTypeFilter.join(","))
    if (startDate) params.set("startDate", startDate)
    if (endDate) params.set("endDate", endDate)
    return params
  }, [checkInFilter, ticketTypeFilter, startDate, endDate])

  const hasActiveFilters =
    checkInFilter !== "all" || ticketTypeFilter.length > 0 || Boolean(startDate) || Boolean(endDate)
  const activeFilterCount =
    (checkInFilter !== "all" ? 1 : 0) +
    (ticketTypeFilter.length > 0 ? 1 : 0) +
    (startDate || endDate ? 1 : 0)

  // ── Initial page load: first 15 attendees only. Re-runs whenever a
  // filter changes too, so the paginated view resets to page 1 under the
  // new filter combo (search mode ignores this — it filters the already-
  // fetched full roster client-side instead, see filteredAttendees). ──
  useEffect(() => {
    let cancelled = false
    async function loadFirstPage() {
      setInitialLoading(true)
      setLoadError(null)
      try {
        const params = buildFilterParams()
        params.set("limit", String(PAGE_SIZE))
        const res = await authFetch(`${baseUrl}?${params.toString()}`)
        const data = await res.json()
        if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to load attendees")
        if (cancelled) return
        setItems(data.attendees ?? [])
        setCursor(data.nextCursor ?? null)
        setHasMore(Boolean(data.hasMore))
        setTotalCount(data.totalCount ?? 0)
        setCheckedInCount(data.checkedInCount ?? 0)
        setNotCheckedInCount(data.notCheckedInCount ?? 0)
        setMatchingCount(data.matchingCount ?? data.totalCount ?? 0)
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message ?? "Failed to load attendees")
      } finally {
        if (!cancelled) setInitialLoading(false)
      }
    }
    loadFirstPage()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, filters])

  // ── Load 15 more — carries the same filter params so the next page
  // keeps matching whatever's currently filtered. ──
  const handleLoadMore = useCallback(async () => {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const params = buildFilterParams()
      params.set("limit", String(PAGE_SIZE))
      params.set("cursor", cursor)
      const res = await authFetch(`${baseUrl}?${params.toString()}`)
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to load more attendees")
      setItems((prev) => [...prev, ...(data.attendees ?? [])])
      setCursor(data.nextCursor ?? null)
      setHasMore(Boolean(data.hasMore))
      setTotalCount(data.totalCount ?? totalCount)
      setCheckedInCount(data.checkedInCount ?? checkedInCount)
      setNotCheckedInCount(data.notCheckedInCount ?? notCheckedInCount)
      setMatchingCount(data.matchingCount ?? matchingCount)
    } catch (e: any) {
      setLoadError(e?.message ?? "Failed to load more attendees")
    } finally {
      setLoadingMore(false)
    }
  }, [cursor, loadingMore, baseUrl, totalCount, checkedInCount, notCheckedInCount, matchingCount, buildFilterParams])

  // ── Fetch the full roster — now only a FALLBACK, once the targeted
  // exact-match lookup below has come back empty. Still only ever fetched
  // once per tab session (guarded the same way as before). ──
  const ensureFullRoster = useCallback(async () => {
    if (fullRoster || rosterFetchStarted.current) return
    rosterFetchStarted.current = true
    setSearchingFullRoster(true)
    try {
      const res = await authFetch(`${baseUrl}?all=true`)
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error ?? "Search failed")
      setFullRoster(data.attendees ?? [])
    } catch (e: any) {
      setLoadError(e?.message ?? "Search failed")
      rosterFetchStarted.current = false // allow retry
    } finally {
      setSearchingFullRoster(false)
    }
  }, [fullRoster, baseUrl])

  // ── Targeted exact-match lookup — tried FIRST, debounced so it doesn't
  // fire on every keystroke. A complete email or ticket reference costs
  // one Firestore `where` query (~1 read); only a miss (or a search that
  // isn't shaped like either — e.g. a name) falls through to the full
  // roster fetch above. ──
  useEffect(() => {
    const term = searchTerm.trim()
    if (!term) {
      setTargetedResults(null)
      return
    }

    const handle = setTimeout(async () => {
      setTargetedLookupLoading(true)
      try {
        const isEmailLike = term.includes("@")
        const param = isEmailLike
          ? `email=${encodeURIComponent(term)}`
          : `ticketReference=${encodeURIComponent(term)}`
        const res = await authFetch(`${baseUrl}?${param}`)
        const data = await res.json()
        const results: AttendeeData[] = res.ok && data.success ? (data.attendees ?? []) : []

        if (results.length > 0) {
          setTargetedResults(results)
        } else {
          // No exact match — likely a partial/fuzzy name search (or an
          // email/ref that's still being typed). Fall back to the full
          // roster so substring matching still works as before.
          setTargetedResults(null)
          ensureFullRoster()
        }
      } catch {
        setTargetedResults(null)
        ensureFullRoster()
      } finally {
        setTargetedLookupLoading(false)
      }
    }, 400) // debounce — don't query on every keystroke

    return () => clearTimeout(handle)
  }, [searchTerm, baseUrl, ensureFullRoster])

  const isSearching = searchTerm.trim().length > 0
  const usingTargetedResults = isSearching && Boolean(targetedResults && targetedResults.length > 0)

  // While actively searching: an exact targeted match wins if we have one
  // (cheapest + most precise); otherwise fall back to the full roster
  // (once it's arrived). Outside search, show whatever's paginated in.
  const sourceList = isSearching ? (usingTargetedResults ? targetedResults! : (fullRoster ?? [])) : items

  const filteredAttendees = useMemo(() => {
    return sourceList.filter((attendee) => {
      const matchesSearch =
        !isSearching ||
        usingTargetedResults || // already an exact server-side match — don't re-filter by name/email substring
        attendee.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        attendee.fullName.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesCheckIn =
        checkInFilter === "all" ||
        (checkInFilter === "checkedIn" && attendee.verified) ||
        (checkInFilter === "notCheckedIn" && !attendee.verified)
      const matchesTicketType =
        ticketTypeFilter.length === 0 || ticketTypeFilter.includes(attendee.ticketType)
      const matchesDate =
        (!startDate || attendee.purchaseDateISO >= startDate) &&
        (!endDate || attendee.purchaseDateISO <= endDate)
      return matchesSearch && matchesCheckIn && matchesTicketType && matchesDate
    })
  }, [sourceList, searchTerm, checkInFilter, ticketTypeFilter, startDate, endDate, isSearching, usingTargetedResults])

  // Ticket-count badge (e.g. "×2") next to a name — needs counts across
  // the full roster, so it only lights up once search has fetched it;
  // in the default paginated view it falls back to what's on this page.
  const emailCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    const base = fullRoster ?? items
    for (const a of base) {
      const key = a.email.toLowerCase()
      counts[key] = (counts[key] ?? 0) + 1
    }
    return counts
  }, [fullRoster, items])

  // ── Row click: fetch just this person's own ticket(s) ──
  const handleSelectAttendee = async (attendee: AttendeeData) => {
    setSelectedAttendee(attendee)
    setSelectedAttendeeTickets([])
    setSelectedAttendeeLoading(true)
    try {
      const res = await authFetch(`${baseUrl}?email=${encodeURIComponent(attendee.email)}`)
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to load attendee")
      setSelectedAttendeeTickets(data.attendees ?? [attendee])
    } catch {
      // Fall back to just the row we already have rather than a dead dialog.
      setSelectedAttendeeTickets([attendee])
    } finally {
      setSelectedAttendeeLoading(false)
    }
  }

  /**
   * JSON export includes eventId + eventName so the scanner can store them
   * against the imported guest list. The sync key is NOT included here —
   * it lives only in Booker's Firebase and is shown once to the user.
   *
   * Export always needs the COMPLETE guest list, so it fetches (or reuses
   * the already-cached) full roster regardless of how many rows are
   * currently paginated into view.
   */
  const handleExport = async (format: "json" | "csv") => {
    setExporting(true)
    try {
      let all = fullRoster
      if (!all) {
        const res = await authFetch(`${baseUrl}?all=true`)
        const data = await res.json()
        if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to load attendees for export")
        all = (data.attendees ?? []) as AttendeeData[]
        setFullRoster(all)
      }

      const exportData = all.map((a) => ({
        fullName: a.fullName,
        email: a.email,
        ticketId: a.id,
        ticketType: a.ticketType,
        facialEnroll: a.facialEnroll,
        ...(a.faceEmbedding ? { faceEmbedding: a.faceEmbedding } : {}),
      }))

      const fileName = `spotix_${eventId}`

      if (format === "json") {
        const envelope = { eventId, eventName, guests: exportData }
        const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" })
        triggerDownload(blob, `${fileName}.json`)
      } else {
        const headers = ["fullName", "email", "ticketId", "ticketType", "facialEnroll", "faceEmbedding"]
        const rows = exportData.map((row) =>
          headers.map((h) => {
            const value = row[h as keyof typeof row]
            if (Array.isArray(value)) return `"${(value as number[]).join("|")}"`
            return `"${String(value ?? "").replace(/"/g, '""')}"`
          }).join(",")
        )
        const csv = [headers.join(","), ...rows].join("\n")
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
        triggerDownload(blob, `${fileName}.csv`)
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Export failed")
    } finally {
      setExporting(false)
    }
  }

  const triggerDownload = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col md:flex-row md:flex-wrap gap-4">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            placeholder="Search by email, ticket reference, or name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border-2 border-slate-200 rounded-xl focus:outline-none focus:border-[#6b2fa5] focus:ring-4 focus:ring-[#6b2fa5]/10 transition-all duration-200 placeholder:text-slate-400"
          />
          {isSearching && (targetedLookupLoading || searchingFullRoster) && (
            <Loader2 size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6b2fa5] animate-spin" />
          )}
        </div>
        {/* Filter — opens the AttendeeFilterDialog (check-in status,
            ticket types, purchase-date range). Badge shows how many of
            those three categories currently have an active selection. */}
        <button
          type="button"
          onClick={() => setFilterDialogOpen(true)}
          className={`relative flex items-center justify-center gap-2 px-5 py-3 rounded-xl border-2 font-semibold text-sm transition-all duration-200 whitespace-nowrap ${
            hasActiveFilters
              ? "border-[#6b2fa5] bg-[#6b2fa5]/5 text-[#6b2fa5]"
              : "border-slate-200 text-slate-600 hover:border-slate-300"
          }`}
        >
          <Filter size={18} />
          Filter
          {activeFilterCount > 0 && (
            <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-[#6b2fa5] text-white text-[10px] font-bold flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Download dropdown — Guest Registry (existing export) or Post Mortem (new) */}
        <div className="relative" ref={downloadMenuRef}>
          <button
            onClick={() => setDownloadMenuOpen((v) => !v)}
            disabled={totalCount === 0 || exporting}
            className="flex items-center justify-center gap-2 px-5 py-3 bg-[#6b2fa5] text-white font-semibold text-sm rounded-xl shadow-lg shadow-[#6b2fa5]/25 hover:bg-[#5a2690] hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 whitespace-nowrap w-full md:w-auto"
          >
            {exporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
            Download
            <ChevronDown size={16} className={`transition-transform ${downloadMenuOpen ? "rotate-180" : ""}`} />
          </button>

          {downloadMenuOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl border-2 border-slate-200 shadow-xl z-20 overflow-hidden">
              <button
                onClick={() => { setDownloadMenuOpen(false); setRegistryDialogOpen(true) }}
                className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[#6b2fa5]/5 transition-colors"
              >
                <FileSpreadsheet size={18} className="text-[#6b2fa5] flex-shrink-0 mt-0.5" />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">Guest Registry</span>
                  <span className="block text-xs text-slate-500">Export the full guest list as JSON or CSV</span>
                </span>
              </button>
              <div className="border-t border-slate-100" />
              <button
                onClick={() => { setDownloadMenuOpen(false); setPostMortemDialogOpen(true) }}
                disabled={!eventHasEnded}
                className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[#6b2fa5]/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <FileBarChart2 size={18} className="text-[#6b2fa5] flex-shrink-0 mt-0.5" />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">Post Mortem</span>
                  <span className="block text-xs text-slate-500">
                    {eventHasEnded
                      ? "Detailed report: purchase behavior, check-ins & awards"
                      : "Available after the event ends"}
                  </span>
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {loadError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          {loadError}
        </div>
      )}

      {/* Online-registry ques — only once we know the status, and only
          when there IS an online registry for this event */}
      {checkinStatus?.hasRegistry && (
        checkinStatus.hasSyncKey ? (
          <Que
            tone="info"
            message="You are scanning online, don't forget to sync back from Spotix offline scanner software."
          />
        ) : (
          <Que
            tone="info"
            message="You are scanning online, don't forget to set up auto sync or manually sync scanned tickets so they reflect here."
          />
        )
      )}

      {/* Stats — from server aggregates, accurate even before everything's loaded */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-[#6b2fa5] to-[#8b4fc5] rounded-xl p-5 text-white shadow-lg shadow-[#6b2fa5]/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-purple-100">Total Attendees</p>
              <p className="text-3xl font-bold mt-1">{totalCount}</p>
            </div>
            <User size={32} className="text-purple-200" />
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 border-2 border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">Checked In</p>
              <p className="text-3xl font-bold text-[#6b2fa5] mt-1">{checkedInCount}</p>
            </div>
            <CheckCircle2 size={32} className="text-[#6b2fa5]" />
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 border-2 border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">Not Checked In</p>
              <p className="text-3xl font-bold text-[#6b2fa5] mt-1">{notCheckedInCount}</p>
            </div>
            <XCircle size={32} className="text-[#6b2fa5]" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border-2 border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-slate-50 to-slate-100 border-b-2 border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Reference</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Name</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Email</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Ticket Type</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Purchase Date</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Facial Enroll</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Check-In</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {initialLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3 text-slate-400">
                      <Loader2 size={28} className="animate-spin" />
                      <p className="text-sm font-medium">Loading attendees…</p>
                    </div>
                  </td>
                </tr>
              ) : filteredAttendees.length > 0 ? (
                filteredAttendees.map((attendee, index) => {
                  const emailCount = emailCounts[attendee.email.toLowerCase()] ?? 1
                  return (
                    <tr
                      key={attendee.id}
                      onClick={() => handleSelectAttendee(attendee)}
                      className="cursor-pointer hover:bg-[#6b2fa5]/5 transition-all duration-150 border-l-4 border-l-transparent hover:border-l-[#6b2fa5]"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <td className="px-6 py-4">
                        <span className="text-sm font-semibold text-slate-900">{attendee.ticketReference}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div className="w-10 h-10 rounded-full bg-[#6b2fa5]/10 overflow-hidden shadow-md">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={dicebearAvatarUrl(attendee.email)}
                                alt={attendee.fullName}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            {emailCount > 1 && (
                              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#6b2fa5] text-white text-[9px] font-bold flex items-center justify-center border border-white">
                                {emailCount}
                              </span>
                            )}
                          </div>
                          <span className="text-sm font-medium text-slate-900">{attendee.fullName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-600">{attendee.email}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-3 py-1.5 bg-gradient-to-r from-[#6b2fa5]/10 to-[#8b4fc5]/10 text-[#6b2fa5] rounded-lg text-xs font-semibold border border-[#6b2fa5]/20">
                          {attendee.ticketType}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-600 font-medium">
                          {formatFirestoreTimestamp(attendee.purchaseDate)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold ${
                          attendee.facialEnroll === "enrolled"
                            ? "bg-blue-50 text-blue-700 border border-blue-200"
                            : "bg-slate-50 text-slate-700 border border-slate-200"
                        }`}>
                          {attendee.facialEnroll === "enrolled" ? "✓ Enrolled" : "○ Unenrolled"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${
                          attendee.verified
                            ? "bg-[#6b2fa5] text-white"
                            : "bg-[#6b2fa5]/10 text-[#6b2fa5] border border-[#6b2fa5]/20"
                        }`}>
                          {attendee.verified
                            ? <><CheckCircle2 size={12} /> Checked In</>
                            : <><XCircle size={12} /> Not Checked In</>
                          }
                        </span>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
                        <User size={32} className="text-slate-400" />
                      </div>
                      <p className="text-slate-600 font-medium">
                        {searchTerm || hasActiveFilters ? "No attendees match your filters" : "No attendees yet"}
                      </p>
                      {(searchTerm || hasActiveFilters) && (
                        <button
                          onClick={() => {
                            setSearchTerm("")
                            setFilters(EMPTY_ATTENDEE_FILTERS)
                          }}
                          className="text-sm text-[#6b2fa5] font-semibold hover:underline"
                        >
                          Clear filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Load more — only shown in the default (non-search) paginated view */}
        {!isSearching && !initialLoading && hasMore && (
          <div className="flex justify-center py-5 border-t border-slate-100">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl border-2 border-[#6b2fa5]/20 text-[#6b2fa5] text-sm font-semibold hover:bg-[#6b2fa5]/5 transition-colors disabled:opacity-50"
            >
              {loadingMore ? (
                <><Loader2 size={16} className="animate-spin" /> Loading…</>
              ) : (
                <>Load 15 more ({items.length} of {matchingCount})</>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Attendee Filter Dialog */}
      <AttendeeFilterDialog
        open={filterDialogOpen}
        onClose={() => setFilterDialogOpen(false)}
        onApply={setFilters}
        ticketTypes={ticketTypes}
        appliedFilters={filters}
      />

      {/* Registry Export Dialog */}
      <RegistryDialog
        open={registryDialogOpen}
        onClose={() => setRegistryDialogOpen(false)}
        onExport={handleExport}
        attendeeCount={totalCount}
        eventId={eventId}
        eventName={eventName}
      />

      {/* Attendee Post Mortem Dialog */}
      <AttendeePostMortemDialog
        open={postMortemDialogOpen}
        onClose={() => setPostMortemDialogOpen(false)}
        eventId={eventId}
        eventName={eventName}
        eventHasEnded={eventHasEnded}
        requesterEmail={user?.email}
      />

      {/* Attendee summary dialog */}
      {selectedAttendee && (
        <AttendeeDialog
          attendee={selectedAttendee}
          emailTickets={selectedAttendeeTickets}
          loading={selectedAttendeeLoading}
          formatFirestoreTimestamp={formatFirestoreTimestamp}
          onClose={() => setSelectedAttendee(null)}
        />
      )}
    </div>
  )
}
