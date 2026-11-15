/**
 * app/api/campaigns/preview/route.ts
 *
 * POST /api/campaigns/preview  { eventId, templateId, message, brandColor }
 *
 * Renders the campaign email HTML for the Design step (spec ask: let
 * organizers see how the email will look, with their chosen template and
 * color, before they send) — stateless, nothing is created or persisted.
 * Same auth + event-ownership check as POST /api/campaigns, then proxies
 * to spotix-backend's /v1/campaigns/preview using the trusted event name/
 * slug (never trusting a frontend-supplied event name for the render).
 */

import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { adminDb } from "@/lib/firebase-admin"
import { verifyAccessToken } from "@/lib/auth-tokens"
import { callCampaignBackend } from "@/lib/campaign-backend"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { eventId, templateId, message, brandColor } = body || {}
  if (!eventId) {
    return NextResponse.json({ success: false, error: "eventId is required" }, { status: 400 })
  }

  const cookieStore = await cookies()
  const token = cookieStore.get("spotix_at")?.value
  if (!token) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })

  let uid: string
  try {
    const payload = await verifyAccessToken(token, "spotix-booker")
    uid = payload.uid
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const eventDoc = await adminDb.collection("events").doc(eventId).get()
  if (!eventDoc.exists) {
    return NextResponse.json({ success: false, error: "Event not found" }, { status: 404 })
  }
  const event = eventDoc.data()!
  if (event.organizerId !== uid) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
  }

  const { res, data } = await callCampaignBackend("/campaigns/preview", {
    method: "POST",
    body: JSON.stringify({
      eventNameSnapshot: event.eventName,
      eventSlugSnapshot: event.eventSlug ?? eventId,
      templateId,
      messageText: message,
      brandColor,
    }),
  })
  return NextResponse.json(data, { status: res.status })
}
