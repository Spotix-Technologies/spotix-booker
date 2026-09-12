// app/lib/event-bundle.ts
//
// Shapes the full event-info payload (eventData, attendees, discounts,
// payout log, chart data, financial figures) exactly once. Previously
// app/api/event/list/[eventId]/route.ts (owner path) and app/api/teams
// route.ts's `myAccess` (collaborator path) each hand-rolled their own
// version — the collaborator path only building attendees + a slim
// eventData and hardcoding discounts/payouts/chart data to empty/zero.
// That's the root cause of Admin (and other collaborators) not seeing
// "everything the Creator sees". Both routes now call this.

import { adminDb } from "@/lib/firebase-admin"
import { computeSalesTrend, todayAndYesterdayKeys, type SalesTrend } from "@/lib/sales-trend"

function tsToDateString(ts: FirebaseFirestore.Timestamp | string | null | undefined): string {
  if (!ts) return "Unknown"
  if (typeof ts === "string") return ts
  try { return ts.toDate().toLocaleDateString() } catch { return "Unknown" }
}

function tsToTimeString(ts: FirebaseFirestore.Timestamp | null | undefined): string {
  if (!ts) return ""
  try { return ts.toDate().toLocaleTimeString() } catch { return "" }
}

// "YYYY-MM-DD" using the SAME local-time components the attendees route's
// date-range filter builds its Firestore query boundaries from (`new
// Date(\`${startDate}T00:00:00.000\`)`, no "Z" — parsed in local time, not
// UTC). Deliberately not toISOString(), which is UTC and would shift the
// calendar day near midnight relative to what the filter actually matched
// against server-side. Used so the attendees tab's date-picker filter can
// compare client-side (search mode) against the same day the server-side
// filter used (default paginated mode).
function tsToISODateString(ts: FirebaseFirestore.Timestamp | string | null | undefined): string {
  if (!ts || typeof ts === "string") return ""
  try {
    const d = ts.toDate()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
  } catch {
    return ""
  }
}

/**
 * Shared attendee-doc → API-shape mapper. Pulled out of buildEventBundle so
 * app/api/event/list/[eventId]/attendees/route.ts (paginated browse, search-all,
 * single-attendee lookup, and full export) formats attendees identically to
 * the main dashboard bundle instead of re-implementing this by hand.
 */
export function mapAttendeeDoc(d: FirebaseFirestore.QueryDocumentSnapshot) {
  const a = d.data()
  return {
    id: d.id,
    fullName: a.fullName ?? "Unknown",
    email: a.email ?? "no-email@example.com",
    ticketType: a.ticketType ?? "Standard",
    verified: a.verified ?? false,
    purchaseDate: tsToDateString(a.purchaseDate),
    purchaseDateISO: tsToISODateString(a.purchaseDate),
    purchaseTime: a.purchaseTime ?? tsToTimeString(a.purchaseDate),
    ticketReference: a.ticketReference ?? "Unknown",
    facialEnroll: a.faceEmbedding ? "enrolled" as const : "unenrolled" as const,
    faceEmbedding: a.faceEmbedding ?? null,
  }
}

export async function buildEventBundle(
  eventRef: FirebaseFirestore.DocumentReference,
  eventSnap: FirebaseFirestore.DocumentSnapshot,
  organizerId: string
) {
  const ev = eventSnap.data()!

  // ── bookerBVT always comes from the actual organizer, not the caller —
  // so an Admin viewing the event sees the same value the Creator does. ──
  let bookerBVT = ""
  try {
    const userSnap = await adminDb.collection("users").doc(organizerId).get()
    if (userSnap.exists) bookerBVT = userSnap.data()?.bvt ?? ""
  } catch (e) {
    console.error("[event-bundle] organizer fetch failed", e)
  }

  // Note: no longer reads the full `attendees` subcollection here — nothing
  // downstream (Overview's charts, Payouts) actually needs the raw list any
  // more; see the count()-based ticketSalesByType/calculatedRevenue below
  // and the admin/events day-docs used for ticketSalesByDay.
  const [discountsSnap, payoutsSnap] = await Promise.all([
    eventRef.collection("discounts").get(),
    eventRef.collection("payouts").orderBy("createdAt", "desc").get(),
  ])

  // ── Day-over-day trends, from the same admin/events/{eventId}/{date}
  // day-docs the Payouts tab already reads — one read each for today and
  // yesterday covers BOTH fields at once (ticketSales for revenue,
  // ticketCount for tickets sold). These can genuinely disagree — one
  // ₦200k ticket yesterday vs fifty ₦2k tickets today raises ticketCount
  // but drops ticketSales — which is exactly why they're tracked as two
  // independent trends, not one. Powers the Overview tab's stat cards. ──
  let salesTrend: SalesTrend
  let ticketCountTrend: SalesTrend
  try {
    const { today, yesterday } = todayAndYesterdayKeys()
    const [todaySnap, yesterdaySnap] = await Promise.all([
      adminDb.collection("admin").doc("events").collection(eventSnap.id).doc(today).get(),
      adminDb.collection("admin").doc("events").collection(eventSnap.id).doc(yesterday).get(),
    ])
    const todaySales = todaySnap.exists ? (todaySnap.data()?.ticketSales ?? 0) : 0
    const yesterdaySales = yesterdaySnap.exists ? (yesterdaySnap.data()?.ticketSales ?? 0) : 0
    salesTrend = computeSalesTrend(todaySales, yesterdaySales)

    const todayCount = todaySnap.exists ? (todaySnap.data()?.ticketCount ?? 0) : 0
    const yesterdayCount = yesterdaySnap.exists ? (yesterdaySnap.data()?.ticketCount ?? 0) : 0
    ticketCountTrend = computeSalesTrend(todayCount, yesterdayCount)
  } catch (e) {
    console.error("[event-bundle] sales trend fetch failed", e)
    salesTrend = { pct: 0, tone: "flat", today: 0, yesterday: 0 }
    ticketCountTrend = { pct: 0, tone: "flat", today: 0, yesterday: 0 }
  }

  const discounts = discountsSnap.docs.map((d) => {
    const dc = d.data()
    return {
      id: d.id,
      code: dc.code ?? "",
      type: dc.type ?? "percentage",
      value: dc.value ?? 0,
      maxUses: dc.maxUses ?? 1,
      usedCount: dc.usedCount ?? 0,
      active: dc.active !== false,
      expiryDate: dc.expiryDate ?? null,
      applicableTickets: dc.applicableTickets ?? null,
    }
  })

  let calculatedTotalPaidOut = 0
  const payouts = payoutsSnap.docs.map((d) => {
    const p = d.data()
    const payoutAmount = p.payoutAmount ?? 0
    if (p.status === "Confirmed") calculatedTotalPaidOut += payoutAmount
    return {
      id: d.id,
      date: tsToDateString(p.createdAt),
      amount: payoutAmount,
      status: p.status ?? "Pending",
      actionCode: p.actionCode ?? "",
      reference: p.reference ?? "",
      payoutAmount,
      payableAmount: p.payableAmount ?? 0,
      agentName: p.agentName ?? "",
      transactionTime: p.transactionTime ?? tsToTimeString(p.createdAt),
    }
  })

  // ── Ticket-type sold counts — one count() aggregation per ticket policy
  // (Promise.all) instead of looping every attendee doc. Feeds both the
  // "Ticket Types Distribution" chart below and calculatedRevenue's
  // fallback just after, so the full attendee list is never read here. ──
  let ticketSalesByType: { type: string; count: number; revenue: number }[] = []
  try {
    const policies: { policy: string; price: number }[] = ev.ticketPrices ?? []
    const counts = await Promise.all(
      policies.map((t) => eventRef.collection("attendees").where("ticketType", "==", t.policy).count().get())
    )
    ticketSalesByType = policies.map((t, i) => ({
      type: t.policy, count: counts[i].data().count, revenue: counts[i].data().count * Number(t.price),
    }))
  } catch (e) {
    console.error("[event-bundle] ticketSalesByType count() query failed", e)
  }

  const calculatedRevenue = ticketSalesByType.reduce((sum, t) => sum + t.revenue, 0)

  const totalRevenue = ev.totalRevenue ?? ev.revenue ?? calculatedRevenue ?? 0
  const totalPaidOut = ev.totalPaidOut ?? calculatedTotalPaidOut
  const availableRevenue = ev.availableRevenue ?? (totalRevenue - totalPaidOut)

  const eventDate: Date = ev.eventDate?.toDate?.() ?? new Date(ev.eventDate)

  const eventData = {
    id: eventSnap.id,
    eventName: ev.eventName ?? "",
    // null (not "") for events created before the short-link feature —
    // lets the client tell "no slug yet" apart from an empty string.
    eventSlug: ev.eventSlug ?? null,
    eventImage: ev.eventImage ?? "/placeholder.svg",
    eventImages: ev.eventImages ?? [],
    eventDate: eventDate.toISOString(),
    eventType: ev.eventType ?? "",
    eventDescription: ev.eventDescription ?? "",
    isFree: ev.isFree ?? false,
    ticketPrices: ev.ticketPrices ?? [],
    createdBy: ev.organizerId ?? organizerId,
    eventVenue: ev.eventVenue ?? "",
    totalCapacity: ev.enableMaxSize ? parseInt(ev.maxSize, 10) : 100,
    ticketsSold: ev.ticketsSold ?? 0,
    totalRevenue,
    eventEndDate: ev.eventEndDate ?? "",
    eventStart: ev.eventStart ?? "",
    eventEnd: ev.eventEnd ?? "",
    enableMaxSize: ev.enableMaxSize ?? false,
    maxSize: ev.maxSize ?? "",
    enableColorCode: ev.enableColorCode ?? false,
    colorCode: ev.colorCode ?? "",
    enableStopDate: ev.enableStopDate ?? ev.hasStopDate ?? false,
    stopDate: ev.stopDate ? (ev.stopDate.toDate?.() ?? new Date(ev.stopDate)).toISOString() : "",
    payId: ev.payId ?? "",
    availableRevenue,
    totalPaidOut,
    status: ev.status ?? "active",
    enabledCollaboration: ev.enabledCollaboration ?? false,
    allowAgents: ev.allowAgents ?? false,
    agentIncentive: ev.agentIncentive ?? null,
    votingId: ev.votingId ?? null,
    votingPollName: ev.votingPollName ?? null,
    allowAPIAccess: ev.allowAPIAccess ?? false,
    widgetLength: ev.widgetLength ?? 320,
    widgetHeight: ev.widgetHeight ?? 420,
    widgetColour: ev.widgetColour ?? "#6b2fa5",
    // Who pays the platform's fee(s), set in spotix-admin per event.
    // true (default) = attendee pays it on top of ticket price, unchanged
    // from how every event has always worked. false = it's deducted from
    // this organizer's proceeds at payout time. See PATCH action
    // "setFeeBurden" below and spotix-backend's payment webhook, which is
    // what actually applies this at settlement time.
    buyerBearsBurden: ev.buyerBearsBurden ?? true,
    // Superset of buyerBearsBurden above — Spotix's platform fee and
    // Paystack's own processing fee are independent switches. Falls back
    // to deriving from the legacy buyerBearsBurden field for events that
    // predate this split (Paystack's fee wasn't a distinct concept yet,
    // so it stays attendee-owed regardless in that fallback).
    feeBurden:
      ev.feeBurden && typeof ev.feeBurden === "object"
        ? {
            coversPaystackFee: ev.feeBurden.coversPaystackFee === true,
            coversSpotixFee: ev.feeBurden.coversSpotixFee === true,
          }
        : { coversPaystackFee: false, coversSpotixFee: ev.buyerBearsBurden === false },
  }

  // ── "Ticket Sales Over Time" chart — reads the admin/events/{eventId}
  // day-docs (same source as salesTrend above) instead of tallying every
  // attendee doc by purchase date. One read per day the event has been
  // selling, not one per attendee. ──
  let ticketSalesByDay: { date: string; count: number; revenue: number }[] = []
  try {
    const dayDocsSnap = await adminDb.collection("admin").doc("events").collection(eventSnap.id).get()
    ticketSalesByDay = dayDocsSnap.docs
      .map((d) => {
        const data = d.data()
        const date = new Date(d.id) // day-doc id is a "YYYY-MM-DD" key (see lib/sales-trend.ts)
        return {
          date: date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
          count: data.ticketCount ?? 0,
          revenue: data.ticketSales ?? 0,
          _sortKey: d.id,
        }
      })
      .sort((a, b) => a._sortKey.localeCompare(b._sortKey))
      .map(({ _sortKey, ...rest }) => rest)
  } catch (e) {
    console.error("[event-bundle] ticketSalesByDay day-doc read failed", e)
  }

  // Chart only shows types that actually sold — computed above, filtered here.
  const ticketTypeData = ticketSalesByType.filter((t) => t.count > 0)

  return {
    eventData,
    bookerBVT,
    discounts,
    payouts,
    ticketSalesByDay,
    ticketSalesByType,
    ticketTypeData,
    availableBalance: availableRevenue,
    totalPaidOut,
    salesTrend,
    ticketCountTrend,
  }
}
