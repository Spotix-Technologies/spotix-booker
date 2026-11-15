/**
 * app/api/campaigns/route.ts
 *
 * GET  /api/campaigns?eventId={eventId}&limit=  → list campaigns for an event
 * POST /api/campaigns  { eventId, name, recipients: [{name,email}] }
 *
 * Auth + event-ownership check happens here (Firestore), then this proxies
 * to spotix-backend's internal /v1/campaigns route — the browser never
 * talks to the backend or Supabase directly (spec §44/§45).
 */

import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { adminDb } from "@/lib/firebase-admin"
import { verifyAccessToken } from "@/lib/auth-tokens"
import { callCampaignBackend } from "@/lib/campaign-backend"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function resolveOwnedEvent(req: NextRequest, eventId: string) {
  const cookieStore = await cookies()
  const token = cookieStore.get("spotix_at")?.value
  if (!token) return { error: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }) }

  let uid: string
  try {
    const payload = await verifyAccessToken(token, "spotix-booker")
    uid = payload.uid
  } catch {
    return { error: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }) }
  }

  const eventDoc = await adminDb.collection("events").doc(eventId).get()
  if (!eventDoc.exists) {
    return { error: NextResponse.json({ success: false, error: "Event not found" }, { status: 404 }) }
  }
  const event = eventDoc.data()!
  if (event.organizerId !== uid) {
    return { error: NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }) }
  }
  return { uid, event }
}

/** Firestore Timestamp | Date | string → ISO string (or null). */
function toIso(v: any): string | null {
  if (!v) return null
  if (typeof v?.toDate === "function") return v.toDate().toISOString()
  if (v instanceof Date) return v.toISOString()
  return typeof v === "string" ? v : null
}

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get("eventId")
  if (!eventId) return NextResponse.json({ success: false, error: "eventId is required" }, { status: 400 })

  const resolved = await resolveOwnedEvent(req, eventId)
  if ("error" in resolved) return resolved.error

  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit")) || 25, 1), 100)
  const { res, data } = await callCampaignBackend(`/campaigns?eventId=${encodeURIComponent(eventId)}&limit=${limit}`)
  return NextResponse.json(data, { status: res.status })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { eventId, name, recipients, templateId, message, brandColor, replyToAddress, ctaText } = body || {}
  if (!eventId || !name) {
    return NextResponse.json({ success: false, error: "eventId and name are required" }, { status: 400 })
  }

  const resolved = await resolveOwnedEvent(req, eventId)
  if ("error" in resolved) return resolved.error
  const { uid, event } = resolved

  // Who gets the "sent" / "flagged" emails. Resolved here from the users
  // doc (same source as /api/user/me) rather than accepted from the
  // browser, so nobody can point campaign notifications at someone else.
  const userSnap = await adminDb.collection("users").doc(uid).get()
  const user = userSnap.data() || {}

  const { res, data } = await callCampaignBackend("/campaigns", {
    method: "POST",
    body: JSON.stringify({
      eventId,
      organizerId: uid,
      eventNameSnapshot: event.eventName,
      eventSlugSnapshot: event.eventSlug ?? eventId,
      name,
      recipients,
      templateId,
      messageText: message,
      brandColor,
      replyToAddress,
      ctaText: typeof ctaText === "string" ? ctaText.trim().slice(0, 40) : undefined,
      // Real event facts, snapshotted server-side from Firestore (never
      // trusted from the browser) — the backend's moderation prompt
      // checks the booker's message against these.
      eventVenueSnapshot: event.eventVenue ?? null,
      eventDateSnapshot: toIso(event.eventDate),
      eventStartSnapshot: event.eventStart ?? null,
      eventEndSnapshot: event.eventEnd ?? null,
      ticketPricesSnapshot: Array.isArray(event.ticketPrices) ? event.ticketPrices : null,
      isFreeSnapshot: !!event.isFree,
      organizerEmail: user.email || null,
      organizerName: user.bookerName || user.fullName || null,
    }),
  })
  return NextResponse.json(data, { status: res.status })
}
