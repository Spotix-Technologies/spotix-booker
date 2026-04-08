"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { authFetch } from "@/lib/auth-client"
import { useProtectedPage } from "@/hooks/useProtectedPage"
// import { Nav } from "@/components/nav"
import { Preloader } from "@/components/preloader"
import { ParticlesBackground } from "@/components/particles-background"
import { EventsList } from "@/components/events/events-list"
import { CollaboratedEventsList } from "@/components/events/collaborated-events-list"
import { Search, Plus, Calendar, TrendingUp, Users, RefreshCw } from "lucide-react"
import type { EventData, CollaboratedEventData } from "@/types/event"

// ─── Cache helpers ────────────────────────────────────────────────────────────
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

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function EventsPage() {
  const router = useRouter()
  useProtectedPage()

  const [userId, setUserId]                   = useState<string | null>(null)
  const [events, setEvents]                   = useState<EventData[]>([])
  const [collaboratedEvents, setCollaborated] = useState<CollaboratedEventData[]>([])
  const [loading, setLoading]                 = useState(true)
  const [refreshing, setRefreshing]           = useState(false)
  const [cachedAt, setCachedAt]               = useState<number | null>(null)
  const [searchQuery, setSearchQuery]         = useState("")
  const [statusFilter, setStatusFilter]       = useState("all")

  // ── Fetch user ID after auth is confirmed ──────────────────────────────────
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const userResponse = await authFetch("/api/user/me")
        if (!userResponse.ok) {
          router.push("/login")
          return
        }

        const userData = await userResponse.json()
        const uid = userData?.uid || userData?.id

        if (!uid) {
          router.push("/login")
          return
        }

        setUserId(uid)
      } catch (err) {
        console.error("Auth initialization error:", err)
        router.push("/login")
      }
    }

    initializeAuth()
  }, [router])

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchEvents = useCallback(async (bust = false) => {
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
    }
  }, [userId])

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

  // ── Optimistic event updater (used by pause/resume) ───────────────────────
  // Also keeps localStorage cache in sync so a page refresh reflects the change.
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

  // ── Stats ─────────────────────────────────────────────────────────────────
  const totalEvents      = events.length
  const activeEvents     = events.filter((e) => e.status === "active").length
  const totalRevenue     = events.reduce((s, e) => s + e.revenue, 0)
  const totalTicketsSold = events.reduce((s, e) => s + e.ticketsSold, 0)

  const cachedTimeLabel = cachedAt
    ? new Date(cachedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : null

  return (
    <>
      <Preloader isLoading={loading} />
      <ParticlesBackground />

      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-purple-50/20 to-gray-100">
        {/* <Nav /> */}

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">

          {/* Header */}
          <div className="mb-8 sm:mb-12 animate-in fade-in slide-in-from-top-4 duration-700">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
              <div className="space-y-2">
                <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-[#6b2fa5] via-[#8b3fc5] to-[#6b2fa5] bg-clip-text text-transparent">
                  My Events
                </h1>
                <p className="text-gray-600 text-base sm:text-lg">
                  Manage and track all your events in one place
                </p>
              </div>
              <button
                onClick={() => router.push("/create-event")}
                className="bg-gradient-to-r from-[#6b2fa5] to-[#8b3fc5] hover:from-[#5a2789] hover:to-[#6b2fa5] text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all duration-200 shadow-lg shadow-[#6b2fa5]/30 hover:shadow-xl hover:shadow-[#6b2fa5]/40 hover:-translate-y-0.5 active:translate-y-0"
              >
                <Plus size={22} strokeWidth={2.5} />
                <span>Create Event</span>
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8 animate-in fade-in slide-in-from-top-6 duration-700">
            <StatCard
              label="Total Events"
              value={totalEvents}
              icon={<Calendar className="w-6 h-6 text-[#6b2fa5]" />}
              iconBg="bg-[#6b2fa5]/10"
              valueColor="text-gray-900"
            />
            <StatCard
              label="Active Events"
              value={activeEvents}
              icon={<TrendingUp className="w-6 h-6 text-green-600" />}
              iconBg="bg-green-100"
              valueColor="text-green-600"
            />
            <StatCard
              label="Tickets Sold"
              value={totalTicketsSold.toLocaleString()}
              icon={<Users className="w-6 h-6 text-blue-600" />}
              iconBg="bg-blue-100"
              valueColor="text-blue-600"
            />
            <StatCard
              label="Total Revenue"
              value={`₦${totalRevenue.toLocaleString()}`}
              icon={
                <svg className="w-6 h-6 text-[#6b2fa5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              }
              iconBg="bg-[#6b2fa5]/10"
              valueColor="text-[#6b2fa5]"
            />
          </div>

          {/* Search + Filter + Refresh */}
          <div className="mb-8 flex flex-col sm:flex-row gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={20} />
              <input
                type="text"
                placeholder="Search events by name or venue..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200 shadow-sm hover:shadow-md"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-5 py-3 border border-gray-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200 shadow-sm font-medium text-gray-700 cursor-pointer"
            >
              <option value="all">All Events</option>
              <option value="active">Active</option>
              <option value="past">Past</option>
              <option value="inactive">Inactive</option>
              <option value="cancelled">Cancelled</option>
              <option value="completed">Completed</option>
            </select>

            <div className="flex items-center gap-3">
              <button
                onClick={() => fetchEvents(true)}
                disabled={refreshing}
                title="Refresh events"
                className="flex items-center gap-2 px-4 py-3 bg-white border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:border-[#6b2fa5] hover:text-[#6b2fa5] transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw size={16} className={refreshing ? "animate-spin text-[#6b2fa5]" : ""} />
                <span className="hidden sm:inline">{refreshing ? "Refreshing…" : "Refresh"}</span>
              </button>

              {cachedTimeLabel && !refreshing && (
                <p className="hidden lg:block text-xs text-gray-400 whitespace-nowrap">
                  Cached at {cachedTimeLabel}
                </p>
              )}
            </div>
          </div>

          {/* My Events */}
          <div className="animate-in fade-in slide-in-from-bottom-6 duration-700">
            <EventsList
              events={events}
              searchQuery={searchQuery}
              statusFilter={statusFilter}
              onEventsChange={handleEventsChange}
            />
          </div>

          {/* Collaborated Events */}
          {collaboratedEvents.length > 0 && (
            <div className="mt-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
              <CollaboratedEventsList
                events={collaboratedEvents}
                searchQuery={searchQuery}
                statusFilter={statusFilter}
              />
            </div>
          )}
        </main>
      </div>
    </>
  )
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
function StatCard({
  label, value, icon, iconBg, valueColor,
}: {
  label: string
  value: string | number
  icon: React.ReactNode
  iconBg: string
  valueColor: string
}) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-md hover:shadow-xl transition-shadow duration-200 border border-gray-100">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-gray-600 text-sm font-medium mb-1">{label}</p>
          <p className={`text-3xl font-bold ${valueColor}`}>{value}</p>
        </div>
        <div className={`w-12 h-12 ${iconBg} rounded-lg flex items-center justify-center`}>
          {icon}
        </div>
      </div>
    </div>
  )
}
