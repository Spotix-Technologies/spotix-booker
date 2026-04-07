import { type NextRequest, NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"
import { verifyAccessToken } from "@/lib/auth-tokens"

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
    // Resolve user ID from middleware header or cookie fallback
    let xUserId = request.headers.get("x-user-id")

    if (!xUserId) {
      const token = request.cookies.get("spotix_at")?.value
      if (!token) {
        return NextResponse.json(
          { error: "Unauthorized", message: "Not authenticated" },
          { status: 401 }
        )
      }
      try {
        const payload = await verifyAccessToken(token, "spotix-booker")
        xUserId = payload.uid
      } catch {
        return NextResponse.json(
          { error: "Unauthorized", message: "Invalid or expired token" },
          { status: 401 }
        )
      }
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
      return NextResponse.json({ ...cachedStats, fromCache: true })
    }

    // Step 2: Fetch from users/{userId} document
    const userDoc = await adminDb.collection("users").doc(userId).get()

    if (!userDoc.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const userData = userDoc.data()!

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