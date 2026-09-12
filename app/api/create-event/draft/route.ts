/**
 * app/api/create-event/draft/route.ts
 *
 * POST   /api/create-event/draft → save (create or overwrite) the caller's
 *          one-time-event draft.  Body: { data: any, label?: string }
 * GET    /api/create-event/draft → fetch it back, to populate "Load Draft"
 * DELETE /api/create-event/draft → clear it (called after a successful
 *          publish, so a stale draft doesn't linger and offer to restore
 *          an event that already exists)
 *
 * Drafts live entirely in Redis (Upstash), not Firestore — see
 * lib/poll-drafts.ts, whose storage this reuses under kind "event". Each
 * booker only ever has ONE in-progress create-event draft at a time (unlike
 * polls, which supports several named drafts) — the UI is a single
 * Save / Load Draft pair, not a picker — so we always use a fixed draftId
 * ("current") namespaced under the user, rather than the id list that
 * genDraftId()/listDrafts() are for.
 */

import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyAccessToken } from "@/lib/auth-tokens"
import { saveDraft, getDraft, deleteDraft } from "@/lib/poll-drafts"

const DEV_TAG = "API developed and maintained by Spotix Technologies"
const DRAFT_ID = "current"

function ok(data: object, status = 200) {
  return NextResponse.json({ success: true, developer: DEV_TAG, ...data }, { status })
}
function fail(message: string, status: number) {
  return NextResponse.json({ success: false, error: message, developer: DEV_TAG }, { status })
}

async function authenticate(request: NextRequest): Promise<{ userId: string } | NextResponse> {
  const cookieStore = await cookies()
  const cookieToken = cookieStore.get("spotix_at")?.value
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const token = cookieToken || bearer
  if (!token) return fail("No access token", 401)
  try {
    const payload = await verifyAccessToken(token, "spotix-booker")
    return { userId: payload.uid }
  } catch {
    return fail("Invalid or expired access token", 401)
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticate(request)
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  let body: Record<string, any>
  try {
    body = await request.json()
  } catch {
    return fail("Invalid JSON body", 400)
  }

  const { data, label } = body
  if (data === undefined || data === null) return fail("data is required", 400)

  try {
    const result = await saveDraft(userId, "event", data, label || "One-time event draft", DRAFT_ID)
    return ok({ updatedAt: result.updatedAt, message: "Draft saved" })
  } catch (draftErr) {
    console.error("[POST /api/create-event/draft] error:", draftErr)
    return fail("Failed to save draft", 500)
  }
}

export async function GET(request: NextRequest) {
  const auth = await authenticate(request)
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  try {
    const draft = await getDraft(userId, DRAFT_ID)
    if (!draft) return ok({ draft: null })
    return ok({ draft })
  } catch (draftErr) {
    console.error("[GET /api/create-event/draft] error:", draftErr)
    return fail("Failed to fetch draft", 500)
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await authenticate(request)
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  try {
    await deleteDraft(userId, "event", DRAFT_ID)
    return ok({ message: "Draft cleared" })
  } catch (draftErr) {
    console.error("[DELETE /api/create-event/draft] error:", draftErr)
    return fail("Failed to clear draft", 500)
  }
}
