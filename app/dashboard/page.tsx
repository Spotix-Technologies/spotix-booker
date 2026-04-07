"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { authFetch, getAccessToken } from "@/lib/auth-client"
import { Preloader } from "@/components/preloader"
import { ParticlesBackground } from "@/components/particles-background"
// import { Nav } from "@/components/nav"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { StatsGrid } from "@/components/dashboard/stats-grid"
import { EventsSection } from "@/components/dashboard/events-section"
import { QuickActions } from "@/components/dashboard/quick-actions"

// ── Types ──────────────────────────────────────────────────────────────────────

interface DashboardStats {
  totalEvents: number
  activeEvents: number
  inactiveEvents: number  // renamed from pastEvents
  totalRevenue: number
  availableBalance: number
  totalPaidOut: number
  totalTicketsSold: number
}

interface Event {
  id: string
  eventName: string
  eventDate: string
  ticketsSold: number
  revenue: number
  availableBalance: number
  status: string
}

interface CachedDashboard {
  stats: DashboardStats
  events: Event[]
  userName: string
  cachedAt: number   // Date.now() ms timestamp
}

// ── Cache helpers ──────────────────────────────────────────────────────────

const CACHE_TTL_MS = 10 * 60 * 1000  // 10 minutes

function getCacheKey(userId: string) {
  return `spotix_dashboard_${userId}`
}

function readCache(userId: string): CachedDashboard | null {
  try {
    const raw = localStorage.getItem(getCacheKey(userId))
    if (!raw) return null
    const cached: CachedDashboard = JSON.parse(raw)
    const age = Date.now() - cached.cachedAt
    if (age > CACHE_TTL_MS) {
      localStorage.removeItem(getCacheKey(userId))
      return null
    }
    return cached
  } catch {
    return null
  }
}

function writeCache(userId: string, data: CachedDashboard) {
  try {
    localStorage.setItem(getCacheKey(userId), JSON.stringify(data))
  } catch {
    // localStorage quota exceeded or unavailable — silently ignore
  }
}

function bustCache(userId: string) {
  try {
    localStorage.removeItem(getCacheKey(userId))
  } catch {
    // ignore
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [userName, setUserName] = useState("Booker")
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const [servedFromCache, setServedFromCache] = useState(false)

  // ── Auth check ───────────────────────────────────────────────────────────────

  useEffect(() => {
    // Check if we have a valid access token (middleware already validated it)
    if (!getAccessToken()) {
      router.push("/login")
      return
    }

    // Fetch user ID from the API
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

  // ── Fetch / cache logic ───────────────────────────────────────────────────────

  const fetchDashboardData = useCallback(
    async (forceRefresh = false) => {
      if (!userId) return

      // Serve from cache if fresh and not a forced refresh
      if (!forceRefresh) {
        const cached = readCache(userId)
        if (cached) {
          setStats(cached.stats)
          setEvents(cached.events)
          setUserName(cached.userName)
          setLastRefreshed(new Date(cached.cachedAt))
          setServedFromCache(true)
          setLoading(false)
          setError(null)
          return
        }
      }

      // Cache miss or forced refresh — hit the API
      try {
        setIsRefreshing(forceRefresh)
        setServedFromCache(false)

        const response = await authFetch(`/api/revenue?userId=${userId}`)
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || "Failed to fetch dashboard data")
        }

        const freshStats: DashboardStats = data.stats
        const freshEvents: Event[] = data.recentEvents
        const freshName: string = data.bookerName

        setStats(freshStats)
        setEvents(freshEvents)
        setUserName(freshName)
        setError(null)

        const now = Date.now()
        setLastRefreshed(new Date(now))

        // Persist to cache
        if (forceRefresh) bustCache(userId)
        writeCache(userId, {
          stats: freshStats,
          events: freshEvents,
          userName: freshName,
          cachedAt: now,
        })
      } catch (err: any) {
        console.error("Error fetching dashboard data:", err)
        setError(err.message || "Failed to load dashboard data")
      } finally {
        setLoading(false)
        setIsRefreshing(false)
      }
    },
    [userId]
  )

  // ── Initial load + auto-refresh every 10 min ──────────────────────────────────

  useEffect(() => {
    if (!userId) return

    fetchDashboardData()

    // Auto-refresh aligned with the 10-min TTL. If cache is still fresh when
    // the interval fires, fetchDashboardData will just re-serve from cache.
    const interval = setInterval(() => {
      fetchDashboardData(true)
    }, CACHE_TTL_MS)

    return () => clearInterval(interval)
  }, [userId, fetchDashboardData])

  // ── Manual refresh (busts cache) ──────────────────────────────────────────────

  const handleRefresh = useCallback(() => {
    if (userId) bustCache(userId)
    fetchDashboardData(true)
  }, [userId, fetchDashboardData])

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) return <Preloader isLoading={true} />

  return (
    <>
      <Preloader isLoading={loading} />
      <ParticlesBackground />

      <div className="min-h-screen bg-background">
        {/* <Nav /> */}

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

          {/* Error banner */}
          {error && (
            <div className="mb-6 p-4 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive">
              <p className="font-medium">{error}</p>
              <button onClick={handleRefresh} className="mt-2 text-sm underline hover:no-underline">
                Try Again
              </button>
            </div>
          )}

          {/* Cache notice — subtle, doesn't interrupt the layout */}
          {servedFromCache && lastRefreshed && (
            <div className="mb-4 flex items-center justify-between text-xs text-slate-400 px-1">
              <span>
                Showing cached data from {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.
                Auto-refreshes every 10 min.
              </span>
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="underline hover:no-underline hover:text-slate-600 transition-colors disabled:opacity-50"
              >
                {isRefreshing ? "Refreshing…" : "Refresh now"}
              </button>
            </div>
          )}

          <DashboardHeader userName={userName} onRefresh={handleRefresh} isRefreshing={isRefreshing} />

          {stats && (
            <>
              <StatsGrid stats={stats} />
              <EventsSection events={events} userId={userId} />
              <QuickActions />
            </>
          )}
        </main>
      </div>
    </>
  )
}
