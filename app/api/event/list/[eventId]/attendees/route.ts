/**
 * app/api/event/list/[eventId]/attendees/route.ts
 *
 * GET /api/event/list/[eventId]/attendees
 *
 *   Default (browse):        ?limit=15&cursor=<lastDocId>
 *     → { attendees, nextCursor, hasMore, totalCount, checkedInCount, notCheckedInCount, matchingCount }
 *     Reads only `limit` docs (+ 1 cursor-doc re-fetch when paging), not the
 *     whole collection. totalCount/checkedInCount/notCheckedInCount are
 *     always EVENT-WIDE (unaffected by the filters below) — they power the
 *     three summary cards, which are meant to read as the event's overall
 *     check-in progress regardless of what's currently filtered in the
 *     table. matchingCount is the count for the CURRENT filter combo (or
 *     equal to totalCount when no filter is active) — that's what the
 *     table's "Load 15 more (x of y)" pager uses.
 *
 *     Optional filters (all combinable, and all pushed down into the actual
 *     Firestore query — not applied after the fact — so pagination itself
 *     only ever returns matching rows):
 *       checkedIn=true|false        → attendee.verified
 *       ticketTypes=VIP,Regular     → attendee.ticketType in (...) (max 10,
 *                                      a Firestore "in" query limit)
 *       startDate=YYYY-MM-DD        → purchaseDate >= start of that day
 *       endDate=YYYY-MM-DD          → purchaseDate <= end of that day
 *                                      (pass the same value as both for a
 *                                      single specific day)
 *
 *     NOTE: combining these with the existing orderBy("purchaseDate") will
 *     likely need a composite index the first time each combination runs —
 *     Firestore's error includes a direct link to create it in one click.
 *
 *   Full list:                ?all=true
 *     → { attendees }  (every attendee — used ONLY as a fallback for
 *       free-text name search when neither of the targeted lookups below
 *       finds an exact match, and for the guest-registry export dialog,
 *       both of which genuinely need the complete set). Intentionally NOT
 *       filtered — the client applies checkInFilter/ticketTypeFilter/
 *       dateFilter over this same full roster locally, alongside the
 *       free-text match that can only run client-side anyway.
 *
 *   Single attendee lookup:   ?email=<email>
 *     → { attendees }  (just that person's ticket(s) — a real `where`
 *       query, not a full-collection read). Used by the attendee-detail
 *       card AND by the search box's fast path when what's typed looks
 *       like an email — see ticketReference below for the other fast path.
 *
 *   Ticket reference lookup:  ?ticketReference=<value>
 *     → { attendees }  (exact match on attendee.ticketReference — also a
 *       real `where` query). This is the search box's fast path for
 *       "refId" lookups: searching by a guest's exact email or exact
 *       ticket reference costs one targeted Firestore read instead of
 *       reading the whole attendees collection. The client only falls
 *       back to ?all=true when this (or the email lookup) comes back
 *       empty — i.e. for genuine partial/fuzzy name search.
 *
 * Auth: same spotix_at cookie + resolveEventAccess as the rest of
 * event-info — owner, Admin, or any collaborator role whose tab set
 * includes "attendees".
 */

import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyAccessToken } from "@/lib/auth-tokens"
import { resolveEventAccess, hasTab } from "@/lib/event-access"
import { mapAttendeeDoc } from "@/lib/event-bundle"

const DEV_TAG = "spotix-api-v1"

function ok(data: object, status = 200) {
  return NextResponse.json({ success: true, developer: DEV_TAG, ...data }, { status })
}

function fail(message: string, status: number) {
  return NextResponse.json(
    { success: false, error: message, developer: DEV_TAG },
    { status }
  )
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

const DEFAULT_PAGE_SIZE = 15
const MAX_PAGE_SIZE = 50
// Firestore's "in" operator caps at 10 values per query.
const MAX_TICKET_TYPES = 10

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const auth = await authenticate()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  const { eventId } = await params
  if (!eventId?.trim()) return fail("eventId is required", 400)

  const access = await resolveEventAccess(eventId, userId)
  if (!access.ok) return fail(access.error, access.status)
  if (!hasTab(access, "attendees")) {
    return fail("Forbidden: you do not have access to this event's attendees", 403)
  }

  const attendeesCol = access.eventRef.collection("attendees")
  const emailFilter = req.nextUrl.searchParams.get("email")?.trim()
  const ticketReferenceFilter = req.nextUrl.searchParams.get("ticketReference")?.trim()
  const wantsAll = req.nextUrl.searchParams.get("all") === "true"

  // ── Single attendee lookup — powers the ticket-breakdown card AND the
  // search box's exact-email fast path. Only reads the docs matching that
  // one email, not the whole collection. ──
  if (emailFilter) {
    try {
      const snap = await attendeesCol.where("email", "==", emailFilter).get()
      return ok({ attendees: snap.docs.map(mapAttendeeDoc) })
    } catch (e: any) {
      console.error("[GET attendees] email lookup failed", e)
      return fail("Failed to load attendee", 500)
    }
  }

  // ── Exact ticket-reference lookup — the search box's other fast path
  // ("refId"). Also a real `where` query, not a collection scan; billed
  // (and billed as 1 read minimum even on zero matches — see pg docs on
  // Firestore query cost) the same tiny amount whether it hits or misses. ──
  if (ticketReferenceFilter) {
    try {
      const snap = await attendeesCol.where("ticketReference", "==", ticketReferenceFilter).get()
      return ok({ attendees: snap.docs.map(mapAttendeeDoc) })
    } catch (e: any) {
      console.error("[GET attendees] ticketReference lookup failed", e)
      return fail("Failed to load attendee", 500)
    }
  }

  // ── Full list — only for the "search everyone" fallback and the guest
  // registry export dialog, both of which genuinely need every record.
  // Deliberately unfiltered — see the file header note above. ──
  if (wantsAll) {
    try {
      const snap = await attendeesCol.get()
      return ok({ attendees: snap.docs.map(mapAttendeeDoc) })
    } catch (e: any) {
      console.error("[GET attendees] full-list fetch failed", e)
      return fail("Failed to load attendees", 500)
    }
  }

  // ── Parse the combinable filters ──
  const checkedInParam = req.nextUrl.searchParams.get("checkedIn")
  const ticketTypesParam = req.nextUrl.searchParams.get("ticketTypes")?.trim()
  const startDateParam = req.nextUrl.searchParams.get("startDate")?.trim()
  const endDateParam = req.nextUrl.searchParams.get("endDate")?.trim()

  const ticketTypesFilter = ticketTypesParam
    ? ticketTypesParam.split(",").map((t) => t.trim()).filter(Boolean).slice(0, MAX_TICKET_TYPES)
    : []

  // "YYYY-MM-DD" → local start/end-of-day Dates. Firestore stores
  // purchaseDate as a Timestamp, so these compare directly against it.
  const startOfDay = startDateParam ? new Date(`${startDateParam}T00:00:00.000`) : null
  const endOfDay = endDateParam ? new Date(`${endDateParam}T23:59:59.999`) : null

  const hasActiveFilters = Boolean(
    checkedInParam === "true" || checkedInParam === "false" ||
    ticketTypesFilter.length > 0 ||
    (startOfDay && !isNaN(startOfDay.getTime())) ||
    (endOfDay && !isNaN(endOfDay.getTime()))
  )

  function applyFilters(q: FirebaseFirestore.Query): FirebaseFirestore.Query {
    let query = q
    if (checkedInParam === "true") query = query.where("verified", "==", true)
    else if (checkedInParam === "false") query = query.where("verified", "==", false)
    if (ticketTypesFilter.length > 0) query = query.where("ticketType", "in", ticketTypesFilter)
    if (startOfDay && !isNaN(startOfDay.getTime())) query = query.where("purchaseDate", ">=", startOfDay)
    if (endOfDay && !isNaN(endOfDay.getTime())) query = query.where("purchaseDate", "<=", endOfDay)
    return query
  }

  // ── Default: paginated browse, 15 at a time ──
  const limitParam = parseInt(req.nextUrl.searchParams.get("limit") ?? "", 10)
  const limit = Number.isFinite(limitParam) && limitParam > 0
    ? Math.min(limitParam, MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE
  const cursorId = req.nextUrl.searchParams.get("cursor")

  try {
    let query = applyFilters(attendeesCol).orderBy("purchaseDate", "desc").limit(limit + 1)

    if (cursorId) {
      const cursorSnap = await attendeesCol.doc(cursorId).get()
      if (cursorSnap.exists) query = query.startAfter(cursorSnap)
    }

    const [pageSnap, totalAgg, checkedInAgg, matchingAgg] = await Promise.all([
      query.get(),
      attendeesCol.count().get(),
      attendeesCol.where("verified", "==", true).count().get(),
      hasActiveFilters ? applyFilters(attendeesCol).count().get() : Promise.resolve(null),
    ])

    const docs = pageSnap.docs
    const hasMore = docs.length > limit
    const pageDocs = hasMore ? docs.slice(0, limit) : docs

    const totalCount = totalAgg.data().count
    const checkedInCount = checkedInAgg.data().count
    const matchingCount = matchingAgg ? matchingAgg.data().count : totalCount

    return ok({
      attendees: pageDocs.map(mapAttendeeDoc),
      nextCursor: hasMore ? pageDocs[pageDocs.length - 1].id : null,
      hasMore,
      totalCount,
      checkedInCount,
      notCheckedInCount: totalCount - checkedInCount,
      matchingCount,
    })
  } catch (e: any) {
    console.error("[GET attendees] paginated fetch failed", e)
    return fail("Failed to load attendees", 500)
  }
}
