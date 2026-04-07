/**
 * app/api/revenue/route.ts
 *
 * GET /api/revenue?userId=xxx
 *
 * Dashboard stats for a booker. Two parallel reads:
 *
 *  1. users/{userId}
 *     Reads totalEvents, ticketsSold, totalRevenue, totalPaidOut directly.
 *     availableBalance = totalRevenue - totalPaidOut (computed here, not stored).
 *
 *  2. events collection (flat)
 *     Queries where organizerId == userId.
 *     Counts how many have status "active" vs "inactive".
 *     Returns the 5 most recent events for the Recent Events table.
 *
 * This replaces the old nested events/{userId}/userEvents subcollection approach.
 */

import { adminDb } from "@/lib/firebase-admin"
import { type NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get("userId")

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 })
    }

    // ── 1. Read aggregated stats from the user document ───────────────────────
    // These fields are maintained by server-side increments (event creation,
    // ticket purchase webhooks, payout processing) so we never need to sum
    // across the events collection for these numbers.
    const userDoc = await adminDb.collection("users").doc(userId).get()

    if (!userDoc.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const userData = userDoc.data()!
    const userName = userData.username || userData.fullName || "Booker"

    const totalEvents: number = userData.totalEvents ?? 0
    const ticketsSold: number = userData.ticketsSold ?? 0
    const totalRevenue: number = userData.totalRevenue ?? 0
    const totalPaidOut: number = userData.totalPaidOut ?? 0
    const availableBalance: number = totalRevenue - totalPaidOut

    // ── 2. Query flat events collection by organizerId ────────────────────────
    // We need per-status counts and the recent events list — these cannot be
    // derived from user-doc counters alone, so we query the collection.
    //
    // Required Firestore composite index:
    //   Collection: events | Fields: organizerId ASC, createdAt DESC
    const eventsSnap = await adminDb
      .collection("events")
      .where("organizerId", "==", userId)
      .orderBy("createdAt", "desc")
      .get()

    let activeEvents = 0
    let inactiveEvents = 0
    const recentEventsData: any[] = []

    for (const doc of eventsSnap.docs) {
      const d = doc.data()

      if (d.status === "active") activeEvents++
      else if (d.status === "inactive") inactiveEvents++
      // "cancelled" and "completed" are intentionally excluded from both counts

      recentEventsData.push({
        id: doc.id,
        eventName: d.eventName || "Unnamed Event",
        eventDate: d.eventDate,
        ticketsSold: d.ticketsSold || 0,
        revenue: d.revenue || 0,
        // availableBalance per event: revenue minus whatever has been paid out for it
        availableBalance: d.availableRevenue ?? (d.revenue || 0) - (d.paidOut || 0),
        status: d.status || "inactive",
      })
    }

    // recentEventsData is already ordered by createdAt desc from the query
    const recentEvents = recentEventsData.slice(0, 5)

    return NextResponse.json({
      stats: {
        totalEvents,
        activeEvents,
        inactiveEvents,
        totalRevenue,
        availableBalance,
        totalPaidOut,
        totalTicketsSold: ticketsSold,
      },
      recentEvents,
      bookerName: userName,
      lastUpdated: Date.now(),
    })
  } catch (error) {
    console.error("Error fetching revenue data:", error)
    return NextResponse.json({ error: "Failed to fetch revenue data" }, { status: 500 })
  }
}