/**
 * app/api/event/[eventId]/observability/route.ts
 *
 * GET /api/event/[eventId]/observability?days=N
 *   → Numerox funnel stats (page views → checkout → payment → success)
 *     for a single event, over the last N days.
 *
 *   - Auth via spotix_at httpOnly cookie
 *   - Access enforced via resolveEventAccess: Creator, Admin, or any
 *     collaborator (built-in or custom) granted the "observability" tab
 *     — see app/lib/event-access.ts and app/lib/team-tabs.ts
 *   - `days` is capped by this event's effective maxDaysFetch (5 by
 *     default, or an admin-configured override — see
 *     app/lib/numerox-max-days.ts). The response always reports that
 *     ceiling back so the UI's date-range picker never offers an option
 *     that would fail.
 *   - Admin SDK only — no client SDK. Numerox's own Firestore reads
 *     happen through numerox/firestore's FirestoreNumeroxStore, backed
 *     by the same adminDb as everything else in this route.
 */

import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyAccessToken } from "@/lib/auth-tokens"
import { resolveEventAccess, hasTab } from "@/lib/event-access"
import { resolveEventMaxDaysFetch } from "@/lib/numerox-max-days"
import { getNumeroxClient } from "@/lib/numerox"
import { NumeroxError } from "@drexx-codes/numerox"

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
  if (!hasTab(access, "observability")) {
    return fail("Forbidden: your role does not have access to Observability on this event", 403)
  }

  const maxDaysFetch = resolveEventMaxDaysFetch(access.eventSnap.data())

  const requestedDays = Number(req.nextUrl.searchParams.get("days") ?? maxDaysFetch)
  if (!Number.isInteger(requestedDays) || requestedDays < 1) {
    return fail("days must be a positive integer", 400)
  }

  try {
    const numerox = getNumeroxClient(maxDaysFetch)
    const stats = await numerox.stats.get({ eventId, days: requestedDays })
    return ok({ stats, maxDaysFetch })
  } catch (e) {
    if (e instanceof NumeroxError) {
      // MAX_DAYS_EXCEEDED, VALIDATION_ERROR, etc. — these are the
      // caller's fault (a stale UI requesting more days than the
      // ceiling), not a server error.
      return fail(e.message, 400)
    }
    console.error("[GET observability]", e)
    return fail("Failed to fetch observability stats", 500)
  }
}
