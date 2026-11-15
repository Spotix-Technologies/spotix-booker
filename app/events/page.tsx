"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { authFetch, getAccessToken, tryRefreshTokens } from "@/lib/auth-client"
import { EventsList } from "@/components/events/events-list"
import { CollaboratedEventsList } from "@/components/events/collaborated-events-list"
import EventTransferDialog, { type IncomingTransfer } from "@/components/events/event-transfer-dialog"
import { Search, Plus, Calendar, TrendingUp, Users, RefreshCw, ArrowRightLeft, Eye, EyeOff, Loader } from "lucide-react"
import { useBalanceVisibility, useBalanceVisibilityRoot, BalanceVisibilityCtx } from "@/hooks/use-balance-visibility"
import type { EventData, CollaboratedEventData } from "@/types/event"

//  Cache helpers 
const CACHE_TTL_MS = 20 * 60 * 1000

function cacheKey(userId: string, action: string) {
  return `spotix_events_${action}_${userId}`
}

function readCache<T>(key: string): { data: T; cachedAt: number } | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (Date.now() - parsed.cachedAt > CACHE_TTL_MS) {
      localStorage.removeItem(key)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function writeCache<T>(key: string, data: T) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, cachedAt: Date.now() }))
  } catch {}
}

function bustCache(userId: string) {
  localStorage.removeItem(cacheKey(userId, "owned"))
  localStorage.removeItem(cacheKey(userId, "collaborated"))
}

//  Page 
export default function EventsPage() {
  const router = useRouter()

  const [authChecked, setAuthChecked]         = useState(false)
  const [userId, setUserId]                   = useState<string | null>(null)
  const [events, setEvents]                   = useState<EventData[]>([])
  const [collaboratedEvents, setCollaborated] = useState<CollaboratedEventData[]>([])
  const [loading, setLoading]                 = useState(true)
  const [refreshing, setRefreshing]           = useState(false)
  const [cachedAt, setCachedAt]               = useState<number | null>(null)
  const [searchQuery, setSearchQuery]         = useState("")
  const [statusFilter, setStatusFilter]       = useState("all")
  const [ready, setReady]                     = useState(false)

  const balanceCtx = useBalanceVisibilityRoot()
  const { visible: balanceVisible, toggle: toggleBalance } = balanceCtx

  //  Transfer state 
  const [showTransferDialog, setShowTransferDialog] = useState(false)
  const [incomingTransfers, setIncomingTransfers]   = useState<IncomingTransfer[]>([])

  //  Auth 
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        let token = getAccessToken()
        if (!token) {
          const refreshed = await tryRefreshTokens()
          if (!refreshed) { router.push("/login"); return }
          token = getAccessToken()
        }
        if (!token) { router.push("/login"); return }

        const userResponse = await authFetch("/api/user/me")
        if (!userResponse.ok) { router.push("/login"); return }

        const userData = await userResponse.json()
        const uid = userData?.uid || userData?.id
        if (!uid) { router.push("/login"); return }

        setUserId(uid)
        setAuthChecked(true)
      } catch (err) {
        console.error("Auth initialization error:", err)
        router.push("/login")
      }
    }
    initializeAuth()
  }, [router])

  //  Fetch incoming transfers 
  useEffect(() => {
    if (!authChecked) return
    fetch("/api/event/transfer/incoming")
      .then((r) => (r.ok ? r.json() : { transfers: [] }))
      .then((d) => setIncomingTransfers(d.transfers ?? []))
      .catch(() => {})
  }, [authChecked])

  //  Fetch events 
  const fetchEvents = useCallback(
    async (bust = false) => {
      if (!userId) return

      if (bust) {
        bustCache(userId)
        setRefreshing(true)
      }

      if (!bust) {
        const ownedCache  = readCache<EventData[]>(cacheKey(userId, "owned"))
        const collabCache = readCache<CollaboratedEventData[]>(cacheKey(userId, "collaborated"))
        if (ownedCache && collabCache) {
          setEvents(ownedCache.data)
          setCollaborated(collabCache.data)
          setCachedAt(Math.min(ownedCache.cachedAt, collabCache.cachedAt))
          setLoading(false)
          setTimeout(() => setReady(true), 50)
          return
        }
      }

      try {
        const [ownedRes, collabRes] = await Promise.all([
          authFetch("/api/event/list?action=owned"),
          authFetch("/api/event/list?action=collaborated"),
        ])

        if (ownedRes.ok) {
          const { events: owned } = await ownedRes.json()
          setEvents(owned ?? [])
          writeCache(cacheKey(userId, "owned"), owned ?? [])
        }

        if (collabRes.ok) {
          const { events: collaborated } = await collabRes.json()
          setCollaborated(collaborated ?? [])
          writeCache(cacheKey(userId, "collaborated"), collaborated ?? [])
        }

        setCachedAt(Date.now())
      } catch (e) {
        console.error("Failed to fetch events:", e)
      } finally {
        setLoading(false)
        setRefreshing(false)
        setTimeout(() => setReady(true), 50)
      }
    },
    [userId]
  )

  useEffect(() => {
    if (userId) fetchEvents(false)
  }, [userId, fetchEvents])

  // Auto-refresh every 20 min
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  useEffect(() => {
    if (!userId) return
    timerRef.current = setInterval(() => fetchEvents(true), CACHE_TTL_MS)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [userId, fetchEvents])

  //  Optimistic event updater 
  const handleEventsChange = useCallback(
    (updater: (prev: EventData[]) => EventData[]) => {
      setEvents((prev) => {
        const next = updater(prev)
        if (userId) writeCache(cacheKey(userId, "owned"), next)
        return next
      })
    },
    [userId]
  )

  //  Transfer dialog handler 
  const handleTransferActioned = useCallback(
    (transferId: string, newStatus: "accepted" | "rejected") => {
      setIncomingTransfers((prev) => prev.filter((t) => t.id !== transferId))
      if (newStatus === "accepted" && userId) {
        bustCache(userId)
        fetchEvents(true)
      }
    },
    [userId, fetchEvents]
  )

  //  Stats 
  const totalEvents      = events.length
  const activeEvents     = events.filter((e) => e.status === "active").length
  const totalRevenue     = events.reduce((s, e) => s + e.revenue, 0)
  const totalTicketsSold = events.reduce((s, e) => s + e.ticketsSold, 0)

  const cachedTimeLabel = cachedAt
    ? new Date(cachedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : null

  // Same in-flow (not full-viewport) loading pattern as the Polls page —
  // no fixed white overlay covering the nav, which was the main source of
  // this route "feeling like" a full page reload on every visit.
  if (!authChecked || (loading && !refreshing)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader className="w-7 h-7 animate-spin text-[#6b2fa5]" />
      </div>
    )
  }

  return (
    <BalanceVisibilityCtx.Provider value={balanceCtx}>
    <>
      <div className="min-h-screen bg-slate-50">

        {/*  Page header  */}
        <div className="bg-white border-b border-slate-100 shadow-sm">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">

            {/* Top row */}
            <div className="flex items-center justify-between h-14">
              <div>
                <h1 className="text-lg font-bold text-slate-900 leading-tight">My Events</h1>
                <p className="text-xs text-slate-400 hidden sm:block">Manage and track all your events</p>
              </div>

              <div className="flex items-center gap-2">
                {/* Cache label */}
                {cachedTimeLabel && !refreshing && (
                  <span className="hidden lg:inline text-xs text-slate-400 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200">
                    Updated {cachedTimeLabel}
                  </span>
                )}

                {/* Refresh */}
                <button
                  onClick={() => fetchEvents(true)}
                  disabled={refreshing}
                  title="Refresh events"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw size={13} className={refreshing ? "animate-spin text-[#6b2fa5]" : ""} />
                  <span className="hidden sm:inline">{refreshing ? "Refreshing…" : "Refresh"}</span>
                </button>

                {/* Create event */}
                <button
                  onClick={() => router.push("/create-event")}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#6b2fa5] hover:bg-[#5a2589] text-white text-xs font-semibold transition-colors shadow-sm"
                >
                  <Plus size={14} strokeWidth={2.5} />
                  <span>Create Event</span>
                </button>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-slate-100 border-t border-slate-100 -mx-4 sm:-mx-6 lg:-mx-8">
              {[
                {
                  label: "Total Events",
                  value: totalEvents,
                  icon: <Calendar size={14} className="text-slate-400" />,
                  valueClass: "text-slate-900",
                },
                {
                  label: "Active",
                  value: activeEvents,
                  icon: <TrendingUp size={14} className="text-emerald-500" />,
                  valueClass: "text-emerald-600",
                },
                {
                  label: "Tickets Sold",
                  value: totalTicketsSold.toLocaleString(),
                  icon: <Users size={14} className="text-blue-400" />,
                  valueClass: "text-blue-600",
                },
                {
                  label: "Revenue",
                  value: balanceVisible
                    ? `₦${totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                    : "₦••••••",
                  icon: (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleBalance() }}
                      aria-label={balanceVisible ? "Hide revenue" : "Show revenue"}
                      className="text-[#6b2fa5] opacity-70 hover:opacity-100 transition-opacity"
                    >
                      {balanceVisible
                        ? <EyeOff className="w-3.5 h-3.5" />
                        : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  ),
                  valueClass: "text-[#6b2fa5]",
                },
              ].map(({ label, value, icon, valueClass }) => (
                <div key={label} className="bg-white px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-3">
                  <div className="hidden sm:flex items-center justify-center w-7 h-7 rounded-lg bg-slate-50 border border-slate-100 flex-shrink-0">
                    {icon}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400 font-medium leading-none mb-0.5">{label}</p>
                    <p className={`text-base font-bold leading-none ${valueClass}`}>{value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/*  Content  */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

          {/* Incoming transfer banner */}
          {incomingTransfers.length > 0 && (
            <div className={`transition-all duration-500 delay-[50ms] ${ready ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}>
            <button
              onClick={() => setShowTransferDialog(true)}
              className="w-full flex items-center justify-between gap-3 p-4 bg-white border border-[#6b2fa5]/20 rounded-xl hover:border-[#6b2fa5]/40 hover:bg-[#6b2fa5]/[0.02] transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#6b2fa5] flex items-center justify-center flex-shrink-0 shadow-sm shadow-[#6b2fa5]/30">
                  <ArrowRightLeft size={15} className="text-white" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-slate-800">
                    {incomingTransfers.length === 1
                      ? `Event transfer request — "${incomingTransfers[0].eventName}"`
                      : `${incomingTransfers.length} pending event transfer requests`}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {incomingTransfers.length === 1
                      ? `From @${incomingTransfers[0].organizerUsername} · 3 days to respond`
                      : "Tap to review all pending requests"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#6b2fa5] text-white text-[10px] font-bold">
                  {incomingTransfers.length}
                </span>
                <span className="text-xs font-semibold text-[#6b2fa5] group-hover:translate-x-0.5 transition-transform">
                  Review →
                </span>
              </div>
            </button>
            </div>
          )}

          {/* Search + filter toolbar */}
          <div className={`flex flex-col sm:flex-row gap-3 transition-all duration-500 delay-[100ms] ${ready ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}>
            <div className="flex-1 relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={15} />
              <input
                type="text"
                placeholder="Search by name or venue…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#6b2fa5]/30 focus:border-[#6b2fa5] transition-all duration-200 shadow-sm"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2.5 border border-slate-200 rounded-xl bg-white text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#6b2fa5]/30 focus:border-[#6b2fa5] transition-all duration-200 shadow-sm cursor-pointer"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="past">Past</option>
              <option value="inactive">Inactive</option>
              <option value="cancelled">Cancelled</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          {/* My Events list */}
          <div className={`transition-all duration-500 delay-[150ms] ${ready ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}>
            <EventsList
              events={events}
              searchQuery={searchQuery}
              statusFilter={statusFilter}
              onEventsChange={handleEventsChange}
            />
          </div>

          {/* Collaborated Events */}
          {collaboratedEvents.length > 0 && (
            <div className={`pt-2 transition-all duration-500 delay-200 ${ready ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}>
              <CollaboratedEventsList
                events={collaboratedEvents}
                searchQuery={searchQuery}
                statusFilter={statusFilter}
              />
            </div>
          )}
        </div>
      </div>

      {/* Transfer Dialog */}
      <EventTransferDialog
        isOpen={showTransferDialog}
        onClose={() => setShowTransferDialog(false)}
        transfers={incomingTransfers}
        onTransferActioned={handleTransferActioned}
      />
    </>
    </BalanceVisibilityCtx.Provider>
  )
}
