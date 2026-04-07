import { type NextRequest, NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"

/**
 * GET /api/profile/stats?userId=xxx
 *
 * Fetch user's profile stats (ticketsSold, totalRevenue) from the new flat users/{userId} document.
 *
 * Implements cache-first pattern:
 * 1. Check if stats are cached in memory (simple in-memory cache per request)
 * 2. Query users/{userId} for ticketsSold and totalRevenue fields
 * 3. Return stats with cache metadata
 *
 * Note: The old nested collection structure (events/{userId}/userEvents/{eventId}) is deprecated.
 * The stats endpoint now reads directly from the users document where these aggregated values
 * are maintained by server-side increments (ticket purchase webhooks, event creation, payouts).
 */

// Simple in-memory cache (scoped to this request's lifetime)
// In production, consider Redis for cross-instance caching
const _statsCache: Map<string, { data: any; timestamp: number }> = new Map()
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

function getFromCache(userId: string) {
  const cached = _statsCache.get(userId)
  if (!cached) return null

  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    _statsCache.delete(userId)
    return null
  }

  return cached.data
}

function setCache(userId: string, data: any) {
  _statsCache.set(userId, { data, timestamp: Date.now() })
}

export async function GET(request: NextRequest) {
  try {
    // Defensive check: Verify that middleware has injected auth headers
    // (middleware validates the token and injects x-user-id)
    const xUserId = request.headers.get("x-user-id")
    if (!xUserId) {
      console.warn(
        "[api/profile/stats] Missing x-user-id header — middleware may have failed to authenticate"
      )
      return NextResponse.json(
        { error: "Unauthorized", message: "Missing authentication headers" },
        { status: 401 }
      )
    }

    const userId = request.nextUrl.searchParams.get("userId")

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 })
    }

    // Ensure the requesting user matches the requested userId (prevent cross-user data access)
    if (xUserId !== userId) {
      console.warn(`[api/profile/stats] User ${xUserId} attempted to access data for ${userId}`)
      return NextResponse.json(
        { error: "Forbidden", message: "You can only access your own data" },
        { status: 403 }
      )
    }

    // Step 1: Check cache first
    const cachedStats = getFromCache(userId)
    if (cachedStats) {
      console.log(`[cache hit] profile stats for ${userId}`)
      return NextResponse.json({
        ...cachedStats,
        fromCache: true,
      })
    }

    // Step 2: Fetch from users/{userId} document (new structure)
    const userDoc = await adminDb.collection("users").doc(userId).get()

    if (!userDoc.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const userData = userDoc.data()!

    // Extract stats from user document
    // These fields are maintained by server-side logic (webhooks, event creation, payouts)
    const ticketsSold = userData.ticketsSold ?? 0
    const totalRevenue = userData.totalRevenue ?? 0
    const eventsCreated = userData.totalEvents ?? 0
    const totalPaidOut = userData.totalPaidOut ?? 0

    const stats = {
      ticketsSold,
      totalRevenue,
      eventsCreated,
      totalPaidOut,
      availableBalance: totalRevenue - totalPaidOut,
    }

    // Step 3: Cache the stats for future requests
    setCache(userId, stats)

    return NextResponse.json({
      ...stats,
      fromCache: false,
      lastUpdated: Date.now(),
    })
  } catch (error) {
    console.error("Error fetching profile stats:", error)
    return NextResponse.json({ error: "Failed to fetch profile stats" }, { status: 500 })
  }
}
