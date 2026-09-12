/**
 * app/api/event/slug-check/route.ts
 *
 * GET /api/event/slug-check?slug=my-event → { available: boolean, reason?: string }
 *
 * Live availability check used by EventBioData's slug field while the
 * organizer types/edits their event's shareable link. This is a UX nicety
 * only — app/api/event/one/route.ts re-checks and dedupes server-side at
 * creation time regardless, so a race between two organizers picking the
 * same slug at the same instant can never actually collide.
 */

import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { adminDb } from "@/lib/firebase-admin"
import { verifyAccessToken } from "@/lib/auth-tokens"
import { isValidSlug, SLUG_RULES_HINT } from "@/lib/slug"

const DEV_TAG = "API developed and maintained by Spotix Technologies"

function ok<T extends object>(data: T) {
  return NextResponse.json({ ...data, developer: DEV_TAG })
}
function fail(error: string, status: number) {
  return NextResponse.json({ error, developer: DEV_TAG }, { status })
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const cookieToken = cookieStore.get("spotix_at")?.value
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const token = cookieToken || bearer
  if (!token) return fail("No access token", 401)
  try {
    await verifyAccessToken(token, "spotix-booker")
  } catch {
    return fail("Invalid or expired access token", 401)
  }

  const slug = request.nextUrl.searchParams.get("slug")?.trim().toLowerCase() || ""

  if (!isValidSlug(slug)) {
    return ok({ available: false, reason: SLUG_RULES_HINT })
  }

  try {
    const snap = await adminDb.collection("events").where("eventSlug", "==", slug).limit(1).get()
    if (snap.empty) return ok({ available: true })
    return ok({ available: false, reason: "That link is already taken" })
  } catch (dbErr) {
    console.error("[GET /api/event/slug-check] Firestore lookup failed:", dbErr)
    // Fail open — the server-side create route dedupes for real regardless,
    // so a transient Firestore hiccup here shouldn't block someone from
    // typing an event name.
    return ok({ available: true })
  }
}
