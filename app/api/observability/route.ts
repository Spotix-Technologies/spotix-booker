/**
 * app/api/observability/route.ts
 *
 * GET /api/observability?days=N
 *   → Numerox funnel stats aggregated across every event the caller
 *     OWNS (organizerId === userId) — the "All Events" view on the
 *     Observability page. Per-event drill-down (and any admin-raised
 *     retention override) lives at
 *     /api/event/[eventId]/observability instead — see that route.
 *
 * `days` is always capped at DEFAULT_OBSERVABILITY_MAX_DAYS (5) here,
 * regardless of any per-event maxDaysFetch override an admin has set —
 * overrides exist for drilling into one event's history, not for
 * inflating this aggregate. See app/lib/numerox-max-days.ts.
 *
 * Auth: spotix_at httpOnly cookie, same as /api/event/list.
 */

import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { adminDb } from "@/lib/firebase-admin"
import { verifyAccessToken } from "@/lib/auth-tokens"
import { getNumeroxClient } from "@/lib/numerox"
import { DEFAULT_OBSERVABILITY_MAX_DAYS } from "@/lib/numerox-max-days"
import { mergeCountMaps, sumUniqueVisitors } from "@/lib/observability-aggregate"
import type { EventStats } from "@drexx-codes/numerox"

const DEV_TAG = "spotix-api-v1"

function ok(data: object, status = 200) {
  return NextResponse.json({ success: true, developer: DEV_TAG, ...data }, { status })
}

function fail(message: string, status: number) {
  return NextResponse.json({ success: false, error: message, developer: DEV_TAG }, { status })
}

async function authenticate(): Promise<{ userId: string } | NextResponse> {
  const cookieStore = await cookies()
  const token = cookieStore.get("spotix_at")?.value
  if (!token) return fail("No access token", 401)
  try {
    const payload = await verifyAccessToken(token, "spotix-booker")
    return { userId: payload.uid }
  } catch {
    return fail("Invalid or expired access token", 401)
  }
}

export interface ObservabilityEventBreakdown {
  eventId: string
  eventName: string
  totals: EventStats["totals"]
  conversion: EventStats["conversion"]
  /** Summed from this event's own daily stats — see
   * app/lib/observability-aggregate.ts for the summing convention. */
  uniqueVisitors: number
  /** All-time unique visitors for this event — each device counted once,
   * the first time it ever viewed the event. Independent of `days`. */
  lifetimeUniqueVisitors: number
}

export async function GET(req: NextRequest) {
  const auth = await authenticate()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  const requestedDays = Number(req.nextUrl.searchParams.get("days") ?? DEFAULT_OBSERVABILITY_MAX_DAYS)
  if (!Number.isInteger(requestedDays) || requestedDays < 1 || requestedDays > DEFAULT_OBSERVABILITY_MAX_DAYS) {
    return fail(`days must be a whole number between 1 and ${DEFAULT_OBSERVABILITY_MAX_DAYS}`, 400)
  }

  try {
    const eventsSnap = await adminDb.collection("events").where("organizerId", "==", userId).get()

    if (eventsSnap.empty) {
      return ok({
        totals: emptyTotals(),
        conversion: emptyConversion(),
        daily: [],
        lifetime: { uniqueVisitors: 0 },
        events: [] as ObservabilityEventBreakdown[],
        maxDaysFetch: DEFAULT_OBSERVABILITY_MAX_DAYS,
      })
    }

    const numerox = getNumeroxClient(DEFAULT_OBSERVABILITY_MAX_DAYS)

    const perEvent = await Promise.all(
      eventsSnap.docs.map(async (doc) => {
        const stats = await numerox.stats.get({ eventId: doc.id, days: requestedDays })
        return {
          eventId: doc.id,
          eventName: (doc.data().eventName as string) || "Untitled event",
          stats,
        }
      })
    )

    const totals = perEvent.reduce((acc, { stats }) => ({
      pageViews: acc.pageViews + stats.totals.pageViews,
      checkoutStarts: acc.checkoutStarts + stats.totals.checkoutStarts,
      paymentCreated: acc.paymentCreated + stats.totals.paymentCreated,
      paymentSuccess: acc.paymentSuccess + stats.totals.paymentSuccess,
      paymentFailed: acc.paymentFailed + stats.totals.paymentFailed,
      checkoutAbandoned: acc.checkoutAbandoned + stats.totals.checkoutAbandoned,
    }), emptyTotals())

    // Merge every event's daily series into one, date-aligned, series —
    // every event in this window shares the same [from, to] range since
    // they all resolved from the same `requestedDays`. uniqueVisitors,
    // locations and devices ride along too, so the "All Events" view
    // gets the same location/device breakdown a single event's view
    // does — see ObservabilityEventView, which aggregates these client-
    // side across whatever `daily` array it's handed either way.
    interface MergedDay {
      date: string
      pageViews: number
      checkoutStarts: number
      paymentCreated: number
      paymentSuccess: number
      paymentFailed: number
      uniqueVisitors: number
      locations: Record<string, number>
      devices: Record<string, number>
    }
    const dailyByDate = new Map<string, MergedDay>()
    for (const { stats } of perEvent) {
      for (const day of stats.daily) {
        const existing = dailyByDate.get(day.date) ?? {
          date: day.date, pageViews: 0, checkoutStarts: 0, paymentCreated: 0, paymentSuccess: 0, paymentFailed: 0,
          uniqueVisitors: 0, locations: {}, devices: {},
        }
        existing.pageViews += day.pageViews
        existing.checkoutStarts += day.checkoutStarts
        existing.paymentCreated += day.paymentCreated
        existing.paymentSuccess += day.paymentSuccess
        existing.paymentFailed += day.paymentFailed
        existing.uniqueVisitors += day.uniqueVisitors
        existing.locations = mergeCountMaps(existing.locations, day.locations)
        existing.devices = mergeCountMaps(existing.devices, day.devices)
        dailyByDate.set(day.date, existing)
      }
    }
    const daily = [...dailyByDate.values()].sort((a, b) => a.date.localeCompare(b.date))

    const events: ObservabilityEventBreakdown[] = perEvent
      .map(({ eventId, eventName, stats }) => ({
        eventId, eventName, totals: stats.totals, conversion: stats.conversion,
        uniqueVisitors: sumUniqueVisitors(stats.daily),
        // `?.` only guards a deploy where booker's numerox is older than
        // the lifetime tracker — the count just reads 0 until it's upgraded.
        lifetimeUniqueVisitors: stats.lifetime?.uniqueVisitors ?? 0,
      }))
      // Busiest events first — most useful ordering for a breakdown table.
      .sort((a, b) => b.totals.pageViews - a.totals.pageViews)

    // Sum of each event's all-time unique visitors. Numerox visitor ids are
    // scoped per event, so a device that views two of the organizer's
    // events counts once for each — this is "unique per event", summed.
    const lifetime = {
      uniqueVisitors: events.reduce((sum, e) => sum + e.lifetimeUniqueVisitors, 0),
    }

    return ok({
      totals,
      conversion: computeConversion(totals),
      daily,
      lifetime,
      events,
      maxDaysFetch: DEFAULT_OBSERVABILITY_MAX_DAYS,
    })
  } catch (e) {
    console.error("[GET observability overview]", e)
    return fail("Failed to fetch observability overview", 500)
  }
}

function emptyTotals() {
  return { pageViews: 0, checkoutStarts: 0, paymentCreated: 0, paymentSuccess: 0, paymentFailed: 0, checkoutAbandoned: 0 }
}
function emptyConversion() {
  return { pageToCheckout: null, checkoutToPayment: null, paymentToSuccess: null, pageToPurchase: null }
}
// Mirrors numerox's own stats/calculations.ts computeConversion() — kept
// as a tiny local copy since it's just arithmetic on the already-summed
// totals above, not worth a second call into numerox for.
function computeConversion(totals: ReturnType<typeof emptyTotals>) {
  const ratio = (n: number, d: number) => (d > 0 ? n / d : null)
  return {
    pageToCheckout: ratio(totals.checkoutStarts, totals.pageViews),
    checkoutToPayment: ratio(totals.paymentCreated, totals.checkoutStarts),
    paymentToSuccess: ratio(totals.paymentSuccess, totals.paymentCreated),
    pageToPurchase: ratio(totals.paymentSuccess, totals.pageViews),
  }
}
