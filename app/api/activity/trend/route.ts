/**
 * app/api/activity/trend/route.ts
 *
 * GET /api/activity/trend?userId=xxx
 *
 * 3-day "movement trend" combining two independently-owned data sources
 * for this booker:
 *
 *   1. Ticket purchases — events/{eventId}/attendees, keyed by `purchaseDate`
 *      (a Firestore Timestamp, same field the event-info attendees tab
 *      already reads — see app/api/event/list/[eventId]/route.ts).
 *
 *   2. Poll votes — voting/{pollId}/entries, keyed by `date` (same field
 *      app/api/polls/entries/route.ts already orders by).
 *
 * Both are per-event / per-poll subcollections, so there's no single query
 * that can range-filter across all of them at once without a collectionGroup
 * query that would also need filtering back down to just this booker's
 * docs. Instead: fetch this booker's event/poll IDs first (already-scoped,
 * cheap reads), then fan out one bounded, date-range-filtered subcollection
 * query per event/poll in parallel. Capped to the most recent 40 events and
 * 20 polls so an account with a long history can't turn this into an
 * unbounded fan-out — recent activity is what a 3-day trend needs anyway.
 */

import { adminDb } from "@/lib/firebase-admin"
import { verifyAccessToken } from "@/lib/auth-tokens"
import { Timestamp } from "firebase-admin/firestore"
import { type NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const DAYS = 3
const MAX_EVENTS = 40
const MAX_POLLS = 20

interface DayBucket {
  date: string
  label: string
  ticketsPurchased: number
  votesCast: number
}

function toDateSafe(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Timestamp) return value.toDate()
  if (typeof value === "object" && value !== null && "_seconds" in (value as any)) {
    return new Date((value as any)._seconds * 1000)
  }
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

function buildBuckets(): { since: Date; buckets: Map<string, DayBucket> } {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const since = new Date(today)
  since.setDate(since.getDate() - (DAYS - 1))

  const buckets = new Map<string, DayBucket>()
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    buckets.set(key, {
      date: key,
      label: d.toLocaleDateString("en-US", { weekday: "short" }),
      ticketsPurchased: 0,
      votesCast: 0,
    })
  }
  return { since, buckets }
}

export async function GET(request: NextRequest) {
  try {
    // Auth: verify the spotix_at cookie server-side — never trust an
    // x-user-id header (see app/api/event/one/route.ts's comment: Next
    // middleware never runs on /api/*, so nothing strips a client-forged
    // header before it reaches this handler).
    const token = request.cookies.get("spotix_at")?.value
    if (!token) {
      return NextResponse.json({ error: "Unauthorized", message: "Not authenticated" }, { status: 401 })
    }
    let xUserId: string
    try {
      const payload = await verifyAccessToken(token, "spotix-booker")
      xUserId = payload.uid
    } catch {
      return NextResponse.json({ error: "Unauthorized", message: "Invalid or expired token" }, { status: 401 })
    }

    const userId = request.nextUrl.searchParams.get("userId")
    if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 })
    if (xUserId !== userId) {
      return NextResponse.json({ error: "Forbidden", message: "You can only access your own data" }, { status: 403 })
    }

    const { since, buckets } = buildBuckets()
    const sinceTs = Timestamp.fromDate(since)

    // ── This booker's events (capped) ──────────────────────────────────────
    const eventsSnap = await adminDb
      .collection("events")
      .where("organizerId", "==", userId)
      .orderBy("createdAt", "desc")
      .limit(MAX_EVENTS)
      .get()

    // ── This booker's polls (capped) ───────────────────────────────────────
    const pollsSnap = await adminDb
      .collection("voting")
      .where("creatorId", "==", userId)
      .orderBy("createdAt", "desc")
      .limit(MAX_POLLS)
      .get()

    // ── Fan out: attendees purchased since `since`, per event ──────────────
    const attendeesResults = await Promise.all(
      eventsSnap.docs.map((eventDoc) =>
        eventDoc.ref
          .collection("attendees")
          .where("purchaseDate", ">=", sinceTs)
          .get()
          .catch(() => null)
      )
    )

    for (const snap of attendeesResults) {
      if (!snap) continue
      for (const doc of snap.docs) {
        const d = toDateSafe(doc.data().purchaseDate)
        if (!d) continue
        const key = d.toISOString().slice(0, 10)
        const bucket = buckets.get(key)
        if (bucket) bucket.ticketsPurchased += 1
      }
    }

    // ── Fan out: entries (votes) since `since`, per poll ────────────────────
    const entriesResults = await Promise.all(
      pollsSnap.docs.map((pollDoc) =>
        pollDoc.ref
          .collection("entries")
          .where("date", ">=", sinceTs)
          .get()
          .catch(() => null)
      )
    )

    for (const snap of entriesResults) {
      if (!snap) continue
      for (const doc of snap.docs) {
        const d = toDateSafe(doc.data().date)
        if (!d) continue
        const key = d.toISOString().slice(0, 10)
        const bucket = buckets.get(key)
        if (bucket) bucket.votesCast += 1
      }
    }

    return NextResponse.json({
      days: Array.from(buckets.values()),
      eventsScanned: eventsSnap.size,
      pollsScanned: pollsSnap.size,
      lastUpdated: Date.now(),
    })
  } catch (error) {
    console.error("Error building activity trend:", error)
    return NextResponse.json({ error: "Failed to build activity trend" }, { status: 500 })
  }
}
