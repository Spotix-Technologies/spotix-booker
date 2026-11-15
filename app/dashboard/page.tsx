"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { authFetch, getAccessToken, tryRefreshTokens } from "@/lib/auth-client"
import { Loader } from "lucide-react"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { StatsGrid } from "@/components/dashboard/stats-grid"
import { EventsSection } from "@/components/dashboard/events-section"
import { PollsSection } from "@/components/dashboard/polls-section"
import { QuickActions } from "@/components/dashboard/quick-actions"
import { RecentPurchasesCard } from "@/components/dashboard/recent-purchases"
import type { RecentPurchase } from "@/lib/recent-purchases"
import { SkeletonRows } from "@/components/ui/skeleton"

interface DashboardStats {
  totalEvents: number
  activeEvents: number
  inactiveEvents: number
  totalRevenue: number
  availableBalance: number
  totalPaidOut: number
  totalTicketsSold: number
  upcomingEvents?: number
  pastEvents?: number
}

interface Event {
  id: string
  eventName: string
  eventDate: string
  ticketsSold: number
  revenue: number
  availableBalance: number
  status: string
  flagged?: boolean
  suspended?: boolean
}

interface Poll {
  id: string
  pollName: string
  pollImage: string
  pollStartDate: string
  pollEndDate: string
  pollAmount: number
  pollCount: number
  totalPaidOut: number
  flagged?: boolean
  suspended?: boolean
}

interface CachedDashboard {
  stats: DashboardStats
  events: Event[]
  polls: Poll[]
  eventsTrendPct: number | null
  eventsTrendTone: "up" | "down" | "flat"
  pollsTrendPct: number | null
  pollsTrendTone: "up" | "down" | "flat"
  userName: string
  cachedAt: number
}

const CACHE_TTL_MS = 10 * 60 * 1000

function getCacheKey(userId: string) { return `spotix_dashboard_${userId}` }

function readCache(userId: string): CachedDashboard | null {
  try {
    const raw = localStorage.getItem(getCacheKey(userId))
    if (!raw) return null
    const cached: CachedDashboard = JSON.parse(raw)
    if (Date.now() - cached.cachedAt > CACHE_TTL_MS) {
      localStorage.removeItem(getCacheKey(userId))
      return null
    }
    return cached
  } catch { return null }
}

function writeCache(userId: string, data: CachedDashboard) {
  try { localStorage.setItem(getCacheKey(userId), JSON.stringify(data)) } catch {}
}

function bustCache(userId: string) {
  try { localStorage.removeItem(getCacheKey(userId)) } catch {}
}

export default function DashboardPage() {
  const router = useRouter()
  const [loading, setLoading]             = useState(true)
  const [isRefreshing, setIsRefreshing]   = useState(false)
  const [stats, setStats]                 = useState<DashboardStats | null>(null)
  const [events, setEvents]               = useState<Event[]>([])
  const [polls, setPolls]                 = useState<Poll[]>([])
  const [eventsTrendPct, setEventsTrendPct] = useState<number | null>(null)
  const [eventsTrendTone, setEventsTrendTone] = useState<"up" | "down" | "flat">("flat")
  const [pollsTrendPct, setPollsTrendPct]   = useState<number | null>(null)
  const [pollsTrendTone, setPollsTrendTone]   = useState<"up" | "down" | "flat">("flat")
  const [userName, setUserName]           = useState("Booker")
  const [error, setError]                 = useState<string | null>(null)
  const [userId, setUserId]               = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const [servedFromCache, setServedFromCache] = useState(false)
  const [ready, setReady]                 = useState(false)
  const [purchases, setPurchases]         = useState<RecentPurchase[]>([])
  const [purchasesLoading, setPurchasesLoading] = useState(true)

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
      } catch (err) {
        console.error("Auth initialization error:", err)
        router.push("/login")
      }
    }
    initializeAuth()
  }, [router])

  const fetchDashboardData = useCallback(
    async (forceRefresh = false) => {
      if (!userId) return

      if (!forceRefresh) {
        const cached = readCache(userId)
        if (cached) {
          setStats(cached.stats)
          setEvents(cached.events)
          setPolls(cached.polls ?? [])
          setEventsTrendPct(cached.eventsTrendPct ?? null)
          setEventsTrendTone(cached.eventsTrendTone ?? "flat")
          setPollsTrendPct(cached.pollsTrendPct ?? null)
          setPollsTrendTone(cached.pollsTrendTone ?? "flat")
          setUserName(cached.userName)
          setLastRefreshed(new Date(cached.cachedAt))
          setServedFromCache(true)
          setLoading(false)
          setError(null)
          // Stagger animation trigger
          setTimeout(() => setReady(true), 50)
          return
        }
      }

      try {
        setIsRefreshing(forceRefresh)
        setServedFromCache(false)

        const response = await authFetch(`/api/revenue?userId=${userId}`)
        const data = await response.json()

        if (!response.ok) throw new Error(data.error || "Failed to fetch dashboard data")

        setStats(data.stats)
        setEvents(data.recentEvents)
        setPolls(data.recentPolls ?? [])
        setEventsTrendPct(data.eventsTrendPct ?? null)
        setEventsTrendTone(data.eventsTrendTone ?? "flat")
        setPollsTrendPct(data.pollsTrendPct ?? null)
        setPollsTrendTone(data.pollsTrendTone ?? "flat")
        setUserName(data.bookerName)
        setError(null)

        const now = Date.now()
        setLastRefreshed(new Date(now))
        if (forceRefresh) bustCache(userId)
        writeCache(userId, {
          stats: data.stats,
          events: data.recentEvents,
          polls: data.recentPolls ?? [],
          eventsTrendPct: data.eventsTrendPct ?? null,
          eventsTrendTone: data.eventsTrendTone ?? "flat",
          pollsTrendPct: data.pollsTrendPct ?? null,
          pollsTrendTone: data.pollsTrendTone ?? "flat",
          userName: data.bookerName,
          cachedAt: now,
        })
      } catch (err: any) {
        console.error("Error fetching dashboard data:", err)
        setError(err.message || "Failed to load dashboard data")
      } finally {
        setLoading(false)
        setIsRefreshing(false)
        setTimeout(() => setReady(true), 50)
      }
    },
    [userId]
  )

  useEffect(() => {
    if (!userId) return
    fetchDashboardData()
    const interval = setInterval(() => fetchDashboardData(true), CACHE_TTL_MS)
    return () => clearInterval(interval)
  }, [userId, fetchDashboardData])

  // Recent Purchases — independent fetch, own loading state, never blocks
  // the main dashboard render above (see lib/recent-purchases/index.ts for
  // how tickets/merch/votes/elections are aggregated server-side).
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await authFetch("/api/dashboard/recent-purchases")
        const data = await res.json()
        if (!cancelled && res.ok) setPurchases(data.purchases ?? [])
      } catch (err) {
        console.error("Error fetching recent purchases:", err)
      } finally {
        if (!cancelled) setPurchasesLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [userId])

  const handleRefresh = useCallback(() => {
    if (userId) bustCache(userId)
    setReady(false)
    fetchDashboardData(true)
  }, [userId, fetchDashboardData])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader className="w-7 h-7 animate-spin text-[#6b2fa5]" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Error banner */}
        {error && (
          <div
            className={`p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 transition-all duration-500 ${
              ready ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"
            }`}
          >
            <p className="font-semibold text-sm">{error}</p>
            <button onClick={handleRefresh} className="mt-1.5 text-xs underline hover:no-underline">
              Try again
            </button>
          </div>
        )}

        {/* Cache notice */}
        {servedFromCache && lastRefreshed && (
          <div
            className={`flex items-center justify-between text-xs text-slate-400 px-1 transition-all duration-500 delay-75 ${
              ready ? "opacity-100" : "opacity-0"
            }`}
          >
            <span>
              Showing saved data from{" "}
              {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
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

        {/* Header — delay 0 */}
        <div
          className={`transition-all duration-500 ${
            ready ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <DashboardHeader
            userName={userName}
            onRefresh={handleRefresh}
            isRefreshing={isRefreshing}
            lastRefreshed={lastRefreshed}
          />
        </div>

        {stats && (
          <>
            {/* Stats — delay 100ms */}
            <div
              className={`transition-all duration-500 delay-100 ${
                ready ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
            >
              <StatsGrid stats={stats} eventsTrendPct={eventsTrendPct} eventsTrendTone={eventsTrendTone} />
            </div>

            {/* Events + Polls side by side on large screens */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Events — delay 200ms */}
              <div
                className={`transition-all duration-500 delay-200 ${
                  ready ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                }`}
              >
                {isRefreshing ? <SkeletonRows count={4} rowClassName="h-16" /> : <EventsSection events={events} userId={userId} />}
              </div>

              {/* Polls — delay 250ms */}
              <div
                className={`transition-all duration-500 delay-[250ms] ${
                  ready ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                }`}
              >
                {isRefreshing ? <SkeletonRows count={4} rowClassName="h-16" /> : <PollsSection polls={polls} trendPct={pollsTrendPct} trendTone={pollsTrendTone} />}
              </div>
            </div>

            {/* Recent Purchases — delay 280ms */}
            <div
              className={`transition-all duration-500 delay-[280ms] ${
                ready ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
            >
              <RecentPurchasesCard purchases={purchases} loading={purchasesLoading} />
            </div>

            {/* Quick Actions — delay 300ms */}
            <div
              className={`transition-all duration-500 delay-300 ${
                ready ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
            >
              <QuickActions />
            </div>
          </>
        )}
      </main>
    </div>
  )
}
