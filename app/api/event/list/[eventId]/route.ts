/**
 * app/api/event/list/[eventId]/route.ts
 *
 * GET    /api/event/list/[eventId]
 *   → Returns full event detail: eventData, attendees, discounts, payouts,
 *     chart data, bookerBVT, and weather forecast.
 *
 * PATCH  /api/event/list/[eventId]
 *   Body { action: "edit", ...editFields }      → Update core event fields
 *   Body { action: "toggleDiscount", code }     → Flip discount active flag
 *   Body { action: "setFeeBurden", feeBurden: { coversPaystackFee, coversSpotixFee } } → Who pays which fee going forward
 *   Body { action: "setSlug", eventSlug }        → Create/change the event's short link
 *
 * POST   /api/event/list/[eventId]
 *   Body { action: "addDiscount", ...discount } → Add a new discount code
 *
 * All handlers:
 *   - Auth via spotix_at httpOnly cookie
 *   - Ownership enforced: authenticated user must be the event organizer
 *   - Admin SDK only — no client SDK
 *
 * Flat Firestore structure:
 *   events/{eventId}
 *   events/{eventId}/attendees
 *   events/{eventId}/discounts
 *   events/{eventId}/payouts
 *   users/{organizerId}
 *   forecasts/{eventId}
 */

import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { adminDb } from "@/lib/firebase-admin"
import { verifyAccessToken } from "@/lib/auth-tokens"
import { FieldValue } from "firebase-admin/firestore"
import { resolveEventAccess, isOwnerOrAdmin, EventAccessResult } from "@/lib/event-access"
import { buildEventBundle } from "@/lib/event-bundle"
import { slugify, isValidSlug, withSuffix, SLUG_RULES_HINT } from "@/lib/slug"

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

// ─── Discount value rules ──────────────────────────────────────────────────
// A coupon can never discount away more than a booker would sensibly give
// up: percentage discounts are capped at 90%, and flat discounts are capped
// at 90% of the highest-priced ticket tier the coupon applies to (falling
// back to the event's highest tier overall when the coupon isn't scoped).
// Enforced server-side because the client form is just UX — this is the
// actual guard against a manipulated/direct API call.
function getMaxApplicablePrice(
  ticketPrices: { policy: string; price: number }[],
  applicableTickets: string[] | null | undefined
): number {
  const relevant =
    applicableTickets && applicableTickets.length > 0
      ? ticketPrices.filter((t) => applicableTickets.includes(t.policy))
      : ticketPrices
  return relevant.reduce((max, t) => Math.max(max, Number(t.price) || 0), 0)
}

function validateDiscountValue(
  type: "percentage" | "flat",
  value: number,
  ticketPrices: { policy: string; price: number }[],
  applicableTickets: string[] | null | undefined
): string | null {
  if (type === "percentage") {
    if (value > 90) return "Percentage discounts can't exceed 90%."
    return null
  }
  const maxPrice = getMaxApplicablePrice(ticketPrices, applicableTickets)
  if (maxPrice <= 0) return "This event has no priced ticket tiers to discount."
  if (value > maxPrice) {
    return `There's no ticket listed that costs that much — the highest applicable ticket is ₦${maxPrice.toLocaleString("en-NG")}.`
  }
  const cap = maxPrice * 0.9
  if (value > cap) {
    return `A flat discount can't give away more than 90% of your highest applicable ticket price (₦${cap.toLocaleString("en-NG")}).`
  }
  return null
}

function eventTicketPricesFrom(eventSnap: FirebaseFirestore.DocumentSnapshot): { policy: string; price: number }[] {
  return ((eventSnap.data()?.ticketPrices ?? []) as any[])
    .filter((t) => t?.policy)
    .map((t) => ({ policy: t.policy as string, price: Number(t.price) || 0 }))
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
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

// ─── Ownership guard (STRICT — Creator only) ─────────────────────────────────
// Kept for the "edit" action specifically: Admin gets full-parity access
// to everything else on this route, but editing the event's core fields
// stays Creator-only (see BUILT_IN_ROLE_TABS.admin in lib/team-tabs.ts —
// "edit" is deliberately excluded from Admin's tab list).
async function resolveOwnedEvent(
  eventId: string,
  userId: string
): Promise<
  | { snap: FirebaseFirestore.DocumentSnapshot; ref: FirebaseFirestore.DocumentReference }
  | NextResponse
> {
  const ref = adminDb.collection("events").doc(eventId)
  const snap = await ref.get()
  if (!snap.exists) return fail("Event not found", 404)
  if (snap.data()!.organizerId !== userId) return fail("Forbidden: you do not own this event", 403)
  return { snap, ref }
}

// ─── Full-parity guard (Creator OR Admin) ────────────────────────────────────
// Used by GET (the full dashboard bundle) and every mutation that Admin is
// allowed to perform. Other collaborator roles (checkin/accountant/custom)
// keep using GET /api/teams?action=myAccess for their (tab-scoped) view —
// see app/api/teams/route.ts.
async function resolveParityAccess(
  eventId: string,
  userId: string
): Promise<Extract<EventAccessResult, { ok: true }> | NextResponse> {
  const access = await resolveEventAccess(eventId, userId)
  if (!access.ok) return fail(access.error, access.status)
  if (!isOwnerOrAdmin(access)) {
    return fail("Forbidden: use /api/teams?action=myAccess for your role's view of this event", 403)
  }
  return access
}

// ─── GET ──────────────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const auth = await authenticate()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  const { eventId } = await params
  if (!eventId?.trim()) return fail("eventId is required", 400)

  // Creator OR Admin — full parity bundle either way. Other collaborator
  // roles are routed to /api/teams?action=myAccess by the client when this
  // 403s (see loadPage() in app/event-info/[eventId]/page.tsx).
  const access = await resolveParityAccess(eventId, userId)
  if (access instanceof NextResponse) return access

  const bundle = await buildEventBundle(access.eventRef, access.eventSnap, access.organizerId)

  // Note: forecast is intentionally excluded here.
  // WeatherTab fetches /api/forecast on demand when the tab is selected.

  return ok(bundle)
}

// ─── PATCH ────────────────────────────────────────────────────────────────────
// action: "edit"           → update core event fields
// action: "toggleDiscount" → flip active flag on a discount doc by code
// action: "setFeeBurden"   → who pays which fee going forward (Paystack's, Spotix's, both, or neither)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const auth = await authenticate()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  const { eventId } = await params
  if (!eventId?.trim()) return fail("eventId is required", 400)

  let body: Record<string, any>
  try { body = await req.json() } catch { return fail("Invalid JSON body", 400) }

  const { action } = body
  if (!action) return fail("action is required", 400)

  // "edit" stays Creator-only (Admin's tab list excludes "edit" — see
  // lib/team-tabs.ts). Every other action here is full-parity (Creator or
  // Admin), resolved just below inside each action branch.
  if (action === "edit") {
    const owned = await resolveOwnedEvent(eventId, userId)
    if (owned instanceof NextResponse) return owned
    const { ref: eventRef } = owned

    const {
      eventName, eventDescription, eventDate, eventEndDate,
      eventVenue, eventStart, eventEnd, eventType,
      country, state,
      enablePricing, ticketPrices,
      enableStopDate, stopDate,
      enableColorCode, colorCode,
      enableMaxSize, maxSize,
    } = body

    if (!eventName?.trim())       return fail("eventName is required", 400)
    if (!eventDescription?.trim()) return fail("eventDescription is required", 400)
    if (!eventDate?.trim())       return fail("eventDate is required", 400)
    if (!eventVenue?.trim())      return fail("eventVenue is required", 400)
    if (!eventStart?.trim() || !eventEnd?.trim() || !eventEndDate?.trim()) {
      return fail("eventStart, eventEnd, and eventEndDate are required", 400)
    }
    if (!eventType?.trim()) return fail("eventType is required", 400)

    const updateData: Record<string, any> = {
      eventName: eventName.trim(),
      eventDescription: eventDescription.trim(),
      eventDate,
      eventEndDate,
      eventVenue: eventVenue.trim(),
      eventStart,
      eventEnd,
      eventType,
      // Unlike eventVenue, country/state ARE editable post-creation —
      // both are optional here so an event created before this feature
      // existed doesn't get wiped back to empty on its next unrelated
      // edit; only overwritten when the organizer actually sent a value.
      ...(typeof country === "string" && country.trim() ? { country: country.trim() } : {}),
      ...(typeof state === "string" && state.trim() ? { state: state.trim() } : {}),
      isFree: !enablePricing,
      ticketPrices: enablePricing ? (ticketPrices ?? []) : [],
      enableStopDate: !!enableStopDate,
      stopDate: enableStopDate && stopDate ? new Date(stopDate) : null,
      enableColorCode: !!enableColorCode,
      colorCode: enableColorCode ? (colorCode ?? null) : null,
      enableMaxSize: !!enableMaxSize,
      maxSize: enableMaxSize ? (maxSize ?? null) : null,
      updatedAt: FieldValue.serverTimestamp(),
    }

    try {
      await eventRef.update(updateData)
      return ok({ message: "Event updated successfully" })
    } catch (e: any) {
      console.error("[PATCH edit] Firestore update failed", e)
      return fail("Failed to update event", 500)
    }
  }

  // ── action: setSlug ──────────────────────────────────────────────────────
  // Lets the organizer add (or change) the human-readable short link for an
  // event that predates the eventSlug feature, or edit one it already has.
  // Creator-only, same as "edit" — the slug is a core identity field, not a
  // revenue/collaboration setting. eventId stays the real internal key
  // everywhere else (auth, payments, admin, analytics); this only changes
  // the public `${NEXT_PUBLIC_APP_URL}/event/{slug}` link.
  //
  // Mirrors the slugify + uniqueness-with-retry logic used at creation time
  // in app/api/event/one/route.ts. The client's live /api/event/slug-check
  // is a UX nicety only — this is the actual source of truth, so a race
  // between two organizers can never land two events on the same slug.
  if (action === "setSlug") {
    const owned = await resolveOwnedEvent(eventId, userId)
    if (owned instanceof NextResponse) return owned
    const { ref: eventRef } = owned

    const { eventSlug: requestedSlug } = body
    const baseSlug = slugify(String(requestedSlug ?? ""))
    if (!isValidSlug(baseSlug)) {
      return fail(`Invalid link — ${SLUG_RULES_HINT}`, 400)
    }

    let finalSlug = baseSlug
    for (let attempt = 1; attempt <= 5; attempt++) {
      const candidate = withSuffix(baseSlug, attempt)
      const existing = await adminDb
        .collection("events")
        .where("eventSlug", "==", candidate)
        .limit(1)
        .get()
      // A slug "taken" by this very event (re-saving the same value) isn't
      // actually a collision.
      const takenByAnother = !existing.empty && existing.docs[0].id !== eventId
      if (!takenByAnother) {
        finalSlug = candidate
        break
      }
      if (attempt === 5) finalSlug = withSuffix(baseSlug, Date.now() % 100000)
    }

    try {
      await eventRef.update({ eventSlug: finalSlug, updatedAt: FieldValue.serverTimestamp() })
      return ok({ message: "Event link created", eventSlug: finalSlug })
    } catch (e: any) {
      console.error("[PATCH setSlug] failed", e)
      return fail("Failed to save event link", 500)
    }
  }

  // Every remaining action (apiAccess, toggleAgentActivity, setAgentIncentive,
  // toggleDiscount) is full-parity — Creator or Admin.
  const access = await resolveParityAccess(eventId, userId)
  if (access instanceof NextResponse) return access
  const eventRef = access.eventRef

  // -- action: apiAccess ---------------------------------------------------
  // Toggles allowAPIAccess and sets widget display options for this event.
  // Consumed by app/components/event-info/apiAccess.tsx. Location and event
  // dates remain read-only regardless of this setting -- this only gates
  // /v1/event, /v1/event/stats, /v1/widget, /v1/lookup in spotix-api.
  if (action === "apiAccess") {
    const { allowAPIAccess, widgetLength, widgetHeight, widgetColour } = body

    const update: Record<string, any> = { updatedAt: FieldValue.serverTimestamp() }

    if (allowAPIAccess !== undefined) update.allowAPIAccess = Boolean(allowAPIAccess)

    if (widgetLength !== undefined) {
      const n = Number(widgetLength)
      if (!Number.isFinite(n) || n < 120 || n > 800) return fail("widgetLength must be between 120 and 800", 400)
      update.widgetLength = n
    }
    if (widgetHeight !== undefined) {
      const n = Number(widgetHeight)
      if (!Number.isFinite(n) || n < 120 || n > 800) return fail("widgetHeight must be between 120 and 800", 400)
      update.widgetHeight = n
    }
    if (widgetColour !== undefined) {
      if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(widgetColour)) return fail("widgetColour must be a valid hex colour", 400)
      update.widgetColour = widgetColour
    }

    try {
      await eventRef.update(update)
      return ok({ message: "API & widget settings updated" })
    } catch (e: any) {
      console.error("[PATCH apiAccess] failed", e)
      return fail("Failed to update API access settings", 500)
    }
  }

  // -- action: toggleAgentActivity --------------------------------------------
  // Instruction 5: bookers toggle this live from the event-info Teams tab,
  // independent of the create-event-time enabledCollaboration/allowAgents
  // pairing. Events with agent activity disabled block all agent-side
  // actions -- the agent app re-checks `allowAgents` on the event doc
  // before letting an agent affiliate or sell.
  //
  // Incentives are event-wide, not per-agent (every agent selling for this
  // event earns the same rate) — so turning agent activity ON requires one
  // to already be set. Body: { agentIncentive: { type, value } } is required
  // only on the ON transition; turning OFF doesn't touch it, so re-enabling
  // later remembers the last value as a convenience.
  if (action === "toggleAgentActivity") {
    const currentValue = access.eventSnap.data()!.allowAgents === true
    const turningOn = !currentValue

    if (turningOn) {
      const { agentIncentive } = body
      const invalid =
        !agentIncentive ||
        (agentIncentive.type !== "percentage" && agentIncentive.type !== "flat") ||
        !Number.isFinite(Number(agentIncentive.value)) ||
        Number(agentIncentive.value) < 0 ||
        (agentIncentive.type === "percentage" && Number(agentIncentive.value) > 100)
      if (invalid) {
        return fail("Set a valid incentive before enabling agent activity — agents can't apply without one", 400)
      }
      try {
        await eventRef.update({
          allowAgents: true,
          agentIncentive: { type: agentIncentive.type, value: Number(agentIncentive.value) },
          updatedAt: FieldValue.serverTimestamp(),
        })
        return ok({
          message: "Agent activity enabled",
          allowAgents: true,
          agentIncentive: { type: agentIncentive.type, value: Number(agentIncentive.value) },
        })
      } catch (e: any) {
        console.error("[PATCH toggleAgentActivity] failed", e)
        return fail("Failed to update agent activity", 500)
      }
    }

    try {
      await eventRef.update({ allowAgents: false, updatedAt: FieldValue.serverTimestamp() })
      return ok({ message: "Agent activity disabled", allowAgents: false })
    } catch (e: any) {
      console.error("[PATCH toggleAgentActivity] failed", e)
      return fail("Failed to update agent activity", 500)
    }
  }

  // -- action: setAgentIncentive ------------------------------------------------
  // Lets the booker adjust the event-wide incentive rate without re-toggling
  // agent activity off and back on. Applies to every agent on this event.
  if (action === "setAgentIncentive") {
    const { agentIncentive } = body
    const invalid =
      !agentIncentive ||
      (agentIncentive.type !== "percentage" && agentIncentive.type !== "flat") ||
      !Number.isFinite(Number(agentIncentive.value)) ||
      Number(agentIncentive.value) < 0 ||
      (agentIncentive.type === "percentage" && Number(agentIncentive.value) > 100)
    if (invalid) return fail("Provide a valid incentive: { type: 'percentage' | 'flat', value }", 400)

    try {
      const value = { type: agentIncentive.type, value: Number(agentIncentive.value) }
      await eventRef.update({ agentIncentive: value, updatedAt: FieldValue.serverTimestamp() })
      return ok({ message: "Incentive updated", agentIncentive: value })
    } catch (e: any) {
      console.error("[PATCH setAgentIncentive] failed", e)
      return fail("Failed to update incentive", 500)
    }
  }

  if (action === "toggleDiscount") {
    const { discountId } = body
    if (!discountId) return fail("discountId is required", 400)

    const discountRef = eventRef.collection("discounts").doc(discountId)
    const discountSnap = await discountRef.get()

    if (!discountSnap.exists) return fail("Discount not found", 404)

    const currentActive = discountSnap.data()!.active !== false
    try {
      await discountRef.update({ active: !currentActive })
      return ok({ message: "Discount status updated", active: !currentActive })
    } catch (e: any) {
      console.error("[PATCH toggleDiscount] failed", e)
      return fail("Failed to update discount", 500)
    }
  }

  // -- action: editDiscount -----------------------------------------------
  // Lets the booker change availability (maxUses/active), expiry, and
  // which ticket types a coupon applies to, without recreating the code.
  // usedCount and code are immutable here on purpose — usedCount is
  // system-maintained (see /api/v1/atomic in spotix-user), and changing
  // the code itself would silently orphan the value the buyer already saw.
  if (action === "editDiscount") {
    const { discountId, value, maxUses, active, expiryDate, applicableTickets } = body
    if (!discountId) return fail("discountId is required", 400)

    const discountRef = eventRef.collection("discounts").doc(discountId)
    const discountSnap = await discountRef.get()
    if (!discountSnap.exists) return fail("Discount not found", 404)

    const update: Record<string, any> = { updatedAt: FieldValue.serverTimestamp() }
    const eventTicketPrices = eventTicketPricesFrom(access.eventSnap)

    // Resolved before the value check below, since a flat discount's cap
    // depends on which tickets it applies to — including a scope change
    // made in this same request.
    let effectiveApplicableTickets: string[] | null = discountSnap.data()?.applicableTickets ?? null

    if (applicableTickets !== undefined) {
      if (applicableTickets === null) {
        update.applicableTickets = null
        effectiveApplicableTickets = null
      } else {
        if (!Array.isArray(applicableTickets) || applicableTickets.some((t) => typeof t !== "string")) {
          return fail("applicableTickets must be an array of ticket policy names", 400)
        }
        const eventTicketPolicies: string[] = eventTicketPrices.map((t) => t.policy)
        const invalid = applicableTickets.filter((t: string) => !eventTicketPolicies.includes(t))
        if (invalid.length > 0) return fail(`Unknown ticket type(s): ${invalid.join(", ")}`, 400)
        update.applicableTickets = applicableTickets.length > 0 ? applicableTickets : null
        effectiveApplicableTickets = update.applicableTickets
      }
    }

    if (value !== undefined) {
      if (typeof value !== "number" || value < 0) return fail("value must be a non-negative number", 400)
      const discountType = discountSnap.data()?.type as "percentage" | "flat"
      const valueError = validateDiscountValue(discountType, value, eventTicketPrices, effectiveApplicableTickets)
      if (valueError) return fail(valueError, 400)
      update.value = value
    }
    if (maxUses !== undefined) {
      if (typeof maxUses !== "number" || maxUses < 1) return fail("maxUses must be at least 1", 400)
      update.maxUses = maxUses
    }
    if (active !== undefined) update.active = Boolean(active)

    if (expiryDate !== undefined) {
      if (expiryDate === null || expiryDate === "") {
        update.expiryDate = null
      } else {
        const parsed = new Date(expiryDate)
        if (Number.isNaN(parsed.getTime())) return fail("expiryDate must be a valid date", 400)
        update.expiryDate = parsed.toISOString()
      }
    }

    try {
      await discountRef.update(update)
      const fresh = await discountRef.get()
      const d = fresh.data()!
      return ok({
        message: "Discount updated successfully",
        discount: {
          id: fresh.id,
          code: d.code,
          type: d.type,
          value: d.value,
          maxUses: d.maxUses,
          usedCount: d.usedCount ?? 0,
          active: d.active !== false,
          expiryDate: d.expiryDate ?? null,
          applicableTickets: d.applicableTickets ?? null,
        },
      })
    } catch (e: any) {
      console.error("[PATCH editDiscount] failed", e)
      return fail("Failed to update discount", 500)
    }
  }

  // -- action: setFeeBurden ----------------------------------------------
  // Who pays what for every future ticket sale on this event: Spotix's
  // platform fee and Paystack's own processing fee are independent
  // switches (an event can have the organizer cover one, both, or
  // neither — attendee pays whichever the organizer doesn't). Full-parity,
  // same as the agent-incentive rate, since it's an event-wide revenue
  // setting rather than a core detail. Purely forward-looking —
  // spotix-backend and spotix-user freeze the burden actually applied on
  // each Reference at purchase time, so this never rewrites what a past
  // or in-flight sale already charged.
  if (action === "setFeeBurden") {
    const { feeBurden } = body
    if (
      !feeBurden ||
      typeof feeBurden !== "object" ||
      typeof feeBurden.coversPaystackFee !== "boolean" ||
      typeof feeBurden.coversSpotixFee !== "boolean"
    ) {
      return fail("feeBurden must be { coversPaystackFee: boolean, coversSpotixFee: boolean }", 400)
    }
    const normalisedFeeBurden = {
      coversPaystackFee: feeBurden.coversPaystackFee,
      coversSpotixFee: feeBurden.coversSpotixFee,
    }
    try {
      await eventRef.update({
        feeBurden: normalisedFeeBurden,
        // Keep the legacy field in sync too, so anything not yet migrated
        // to read `feeBurden` (or an older frozen Reference read path)
        // still resolves the Spotix-fee half correctly.
        buyerBearsBurden: !normalisedFeeBurden.coversSpotixFee,
        updatedAt: FieldValue.serverTimestamp(),
      })
      return ok({ message: "Fee burden updated", feeBurden: normalisedFeeBurden })
    } catch (e: any) {
      console.error("[PATCH setFeeBurden] failed", e)
      return fail("Failed to update fee burden", 500)
    }
  }

  return fail(`Unknown action: ${action}`, 400)
}

// ─── POST ─────────────────────────────────────────────────────────────────────
// action: "addDiscount" → create a new discount doc
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const auth = await authenticate()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  const { eventId } = await params
  if (!eventId?.trim()) return fail("eventId is required", 400)

  let body: Record<string, any>
  try { body = await req.json() } catch { return fail("Invalid JSON body", 400) }

  const { action } = body
  if (action !== "addDiscount") return fail(`Unknown action: ${action}`, 400)

  const access = await resolveParityAccess(eventId, userId)
  if (access instanceof NextResponse) return access
  const eventRef = access.eventRef

  const { code, type, value, maxUses, usedCount, active, expiryDate, applicableTickets } = body

  if (!code?.trim()) return fail("code is required", 400)
  if (!["percentage", "flat"].includes(type)) return fail("type must be 'percentage' or 'flat'", 400)
  if (typeof value !== "number" || value < 0) return fail("value must be a non-negative number", 400)

  const eventTicketPrices = eventTicketPricesFrom(access.eventSnap)

  // Check for duplicate code (case-insensitive)
  const existing = await eventRef
    .collection("discounts")
    .where("code", "==", code.trim().toUpperCase())
    .limit(1)
    .get()

  // Also check lowercase/mixed — normalise before comparing
  const existingAll = await eventRef.collection("discounts").get()
  const duplicate = existingAll.docs.some(
    (d) => d.data().code?.toLowerCase() === code.trim().toLowerCase()
  )
  if (duplicate) return fail("A discount with this code already exists", 409)

  // applicableTickets: which ticket policies this coupon can be applied to.
  // Empty/omitted = every ticket type on the event. Validated against the
  // event's own ticketPrices so a booker can't scope a coupon to a policy
  // name that doesn't exist (e.g. a typo, or a tier removed since).
  let normalizedApplicableTickets: string[] | null = null
  if (Array.isArray(applicableTickets) && applicableTickets.length > 0) {
    if (applicableTickets.some((t: unknown) => typeof t !== "string")) {
      return fail("applicableTickets must be an array of ticket policy names", 400)
    }
    const eventTicketPolicies: string[] = eventTicketPrices.map((t) => t.policy)
    const invalid = applicableTickets.filter((t: string) => !eventTicketPolicies.includes(t))
    if (invalid.length > 0) return fail(`Unknown ticket type(s): ${invalid.join(", ")}`, 400)
    normalizedApplicableTickets = applicableTickets
  }

  const valueError = validateDiscountValue(type, value, eventTicketPrices, normalizedApplicableTickets)
  if (valueError) return fail(valueError, 400)

  // expiryDate: optional. Stored as an ISO string so the buyer-side
  // validation route (spotix-user's /api/v1/discount) can just `new Date(...)` it.
  let normalizedExpiryDate: string | null = null
  if (expiryDate) {
    const parsed = new Date(expiryDate)
    if (Number.isNaN(parsed.getTime())) return fail("expiryDate must be a valid date", 400)
    normalizedExpiryDate = parsed.toISOString()
  }

  const discountDoc = {
    code: code.trim(),
    type,
    value,
    maxUses: maxUses ?? 1,
    usedCount: usedCount ?? 0,
    active: active !== false,
    expiryDate: normalizedExpiryDate,
    applicableTickets: normalizedApplicableTickets,
    createdAt: FieldValue.serverTimestamp(),
  }

  try {
    const docRef = await eventRef.collection("discounts").add(discountDoc)
    return ok(
      {
        message: "Discount added successfully",
        discount: { id: docRef.id, ...discountDoc, createdAt: undefined },
      },
      201
    )
  } catch (e: any) {
    console.error("[POST addDiscount] failed", e)
    return fail("Failed to add discount", 500)
  }
}
