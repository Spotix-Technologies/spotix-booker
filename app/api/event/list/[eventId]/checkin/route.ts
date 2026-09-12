/**
 * app/api/event/list/[eventId]/checkin/route.ts
 *
 * GET /api/event/list/[eventId]/checkin?action=status
 *   → { hasRegistry, registryCount, ticketsSold, hasSyncKey, pendingPushCount,
 *       autoSyncAt, canManageAutoSync }
 *     autoSyncAt is null unless a push is currently scheduled (ISO string
 *     of the chosen date/time). canManageAutoSync tells the client whether
 *     THIS viewer is allowed to schedule/cancel it (see
 *     canManageCheckinAutoSync in app/lib/event-access.ts) — the built-in
 *     "checkin" role can see an existing schedule but not set one.
 *
 * GET /api/event/list/[eventId]/checkin?action=lookup&ticketId=<id>
 * GET /api/event/list/[eventId]/checkin?action=lookup&email=<email>
 *   → { results: [...] }  looked up from the Supabase mirror, not Firestore
 *     — this is the whole point of the registry (see app/lib/checkin-db.ts).
 *
 * POST /api/event/list/[eventId]/checkin
 *   Body: { action: "build" }
 *     → Copies the full attendees collection into Supabase (one-time,
 *       "Start Virtual Registry" button).
 *   Body: { action: "pull" }
 *     → Firestore → Supabase. Pulls only attendees purchased since the
 *       registry's last-pulled ticket ("Pull" button on the Check-in tab).
 *   Body: { action: "push" }
 *     → Supabase → Firestore. Sends verified check-ins that haven't made
 *       it back to Firestore yet ("Push" button on the Check-in tab).
 *   Body: { action: "checkin", ticketId, via }
 *     → Marks a ticket verified in the Supabase registry ONLY — records
 *       who checked it in (the authenticated booker/staffer) and leaves
 *       it pending push. Firestore is not touched here; it only learns
 *       about this check-in via "push" or a scheduled auto sync.
 *       via: "qr" | "manual" | "email"
 *   Body: { action: "scheduleAutoSync", runAt }
 *     → runAt: ISO date/time string, must be in the future. Schedules a
 *       ONE-OFF pg_cron job (see scheduleAutoSync in app/lib/checkin-db.ts)
 *       that pushes this event's verified check-ins to Firestore at that
 *       exact moment. Requires canManageCheckinAutoSync — 403 otherwise.
 *   Body: { action: "cancelAutoSync" }
 *     → Cancels a pending schedule, if any. Same permission requirement.
 *
 * Auth: resolveEventAccess + the "checkin" tab, same pattern as every
 * other event-info sub-route.
 */

import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyAccessToken } from "@/lib/auth-tokens"
import { resolveEventAccess, hasTab, canManageCheckinAutoSync } from "@/lib/event-access"
import { adminDb } from "@/lib/firebase-admin"
import {
  getRegistryStatus,
  buildVirtualRegistry,
  pullNewSales,
  pushVerifiedToFirestore,
  getPendingPushCount,
  lookupTicket,
  checkInTicket,
  scheduleAutoSync,
  cancelAutoSync,
} from "@/lib/checkin-db"

async function getUserDisplayName(uid: string, fallback: string): Promise<string> {
  try {
    const doc = await adminDb.collection("users").doc(uid).get()
    return doc.data()?.fullName || fallback
  } catch {
    return fallback
  }
}

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
  if (!hasTab(access, "checkin")) {
    return fail("Forbidden: you do not have access to this event's check-in tools", 403)
  }

  const action = req.nextUrl.searchParams.get("action") ?? "status"

  if (action === "status") {
    try {
      const registry = await getRegistryStatus(eventId)
      const pendingPushCount = registry.exists ? await getPendingPushCount(eventId) : 0
      const eventData = access.eventSnap.data() ?? {}
      return ok({
        hasRegistry: registry.exists,
        registryCount: registry.count,
        ticketsSold: eventData.ticketsSold ?? 0,
        hasSyncKey: Boolean(eventData.syncKey),
        pendingPushCount,
        autoSyncAt: eventData.checkinAutoSyncAt ?? null,
        canManageAutoSync: canManageCheckinAutoSync(access),
      })
    } catch (e: any) {
      console.error("[GET checkin status]", e)
      return fail("Failed to load check-in status", 500)
    }
  }

  if (action === "lookup") {
    const ticketId = req.nextUrl.searchParams.get("ticketId")?.trim()
    const email = req.nextUrl.searchParams.get("email")?.trim()
    if (!ticketId && !email) return fail("ticketId or email is required", 400)

    try {
      const results = await lookupTicket(eventId, { ticketId, email })
      return ok({ results })
    } catch (e: any) {
      console.error("[GET checkin lookup]", e)
      return fail("Lookup failed", 500)
    }
  }

  return fail("Invalid action. Use 'status' or 'lookup'.", 400)
}

export async function POST(
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
  if (!hasTab(access, "checkin")) {
    return fail("Forbidden: you do not have access to this event's check-in tools", 403)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return fail("Invalid JSON body", 400)
  }

  const action = body.action as string | undefined

  if (action === "build") {
    try {
      const { imported } = await buildVirtualRegistry(eventId)
      return ok({ imported })
    } catch (e: any) {
      console.error("[POST checkin build]", e)
      return fail("Failed to build virtual registry", 500)
    }
  }

  if (action === "pull") {
    try {
      const result = await pullNewSales(eventId)
      return ok(result)
    } catch (e: any) {
      console.error("[POST checkin pull]", e)
      return fail("Pull failed", 500)
    }
  }

  if (action === "push") {
    try {
      const result = await pushVerifiedToFirestore(eventId)
      return ok(result)
    } catch (e: any) {
      console.error("[POST checkin push]", e)
      return fail("Push failed", 500)
    }
  }

  if (action === "checkin") {
    const ticketId = (body.ticketId as string | undefined)?.trim()
    const via = (body.via as string | undefined) ?? "manual"
    if (!ticketId) return fail("ticketId is required", 400)
    if (!["qr", "manual", "email"].includes(via)) return fail("Invalid via", 400)

    try {
      const checkedInByName = await getUserDisplayName(userId, "Spotix booker")
      const result = await checkInTicket(
        eventId,
        ticketId,
        via as "qr" | "manual" | "email",
        { uid: userId, name: checkedInByName }
      )
      if (!result) return fail("Ticket not found in this event's online registry", 404)
      return ok({ ticket: result })
    } catch (e: any) {
      console.error("[POST checkin checkin]", e)
      return fail("Check-in failed", 500)
    }
  }

  if (action === "scheduleAutoSync") {
    if (!canManageCheckinAutoSync(access)) {
      return fail("Forbidden: only Admin, the owner, or a custom role with Check-in access can schedule auto sync", 403)
    }
    const runAtRaw = body.runAt as string | undefined
    if (!runAtRaw) return fail("runAt is required", 400)
    const runAt = new Date(runAtRaw)
    if (isNaN(runAt.getTime())) return fail("runAt is not a valid date/time", 400)
    if (runAt.getTime() <= Date.now()) return fail("runAt must be in the future", 400)

    try {
      await scheduleAutoSync(eventId, runAt)
      return ok({ autoSyncAt: runAt.toISOString() })
    } catch (e: any) {
      console.error("[POST checkin scheduleAutoSync]", e)
      return fail(e?.message ?? "Failed to schedule auto sync", 500)
    }
  }

  if (action === "cancelAutoSync") {
    if (!canManageCheckinAutoSync(access)) {
      return fail("Forbidden: only Admin, the owner, or a custom role with Check-in access can manage auto sync", 403)
    }
    try {
      await cancelAutoSync(eventId)
      return ok({ autoSyncAt: null })
    } catch (e: any) {
      console.error("[POST checkin cancelAutoSync]", e)
      return fail(e?.message ?? "Failed to cancel auto sync", 500)
    }
  }

  return fail("Invalid action. Use 'build', 'pull', 'push', 'checkin', 'scheduleAutoSync', or 'cancelAutoSync'.", 400)
}
