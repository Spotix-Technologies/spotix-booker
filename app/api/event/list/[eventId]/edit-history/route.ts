/**
 * app/api/event/list/[eventId]/edit-history/route.ts
 *
 * GET /api/event/list/[eventId]/edit-history?limit=25&before=<ISO cursor>
 *   → Newest-first page of the event's edit history, read from Supabase by
 *     spotix-backend (see lib/edit-history.ts). Writes happen inside the
 *     individual edit routes, never here.
 *
 *   - Auth via spotix_at httpOnly cookie
 *   - Access: Creator or Admin collaborator (the "history" tab — see
 *     lib/team-tabs.ts). Custom roles can never be granted it.
 */

import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyAccessToken } from "@/lib/auth-tokens"
import { resolveEventAccess, hasTab } from "@/lib/event-access"
import { fetchEditHistory } from "@/lib/edit-history"

const DEV_TAG = "spotix-api-v1"

function fail(message: string, status: number) {
  return NextResponse.json({ success: false, error: message, developer: DEV_TAG }, { status })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const token = (await cookies()).get("spotix_at")?.value
  if (!token) return fail("No access token", 401)

  let userId: string
  try {
    userId = (await verifyAccessToken(token, "spotix-booker")).uid
  } catch {
    return fail("Invalid or expired access token", 401)
  }

  const { eventId } = await params
  if (!eventId?.trim()) return fail("eventId is required", 400)

  const access = await resolveEventAccess(eventId, userId)
  if (!access.ok) return fail(access.error, access.status)
  if (!hasTab(access, "history")) return fail("Forbidden: your role cannot view this event's edit history", 403)

  const { searchParams } = new URL(req.url)
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 25, 1), 100)
  const before = searchParams.get("before")
  if (before && Number.isNaN(Date.parse(before))) return fail("before must be an ISO timestamp", 400)

  try {
    const page = await fetchEditHistory(eventId, { limit, before })
    return NextResponse.json({ success: true, developer: DEV_TAG, ...page })
  } catch (e) {
    console.error("[GET edit-history] failed", e)
    return fail("Failed to load edit history", 502)
  }
}
