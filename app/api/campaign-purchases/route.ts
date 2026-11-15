/**
 * app/api/campaign-purchases/route.ts
 *
 * GET /api/campaign-purchases?eventId={eventId}
 *
 * Auth: spotix_at cookie, then confirms the caller owns the event before
 * proxying to the backend — identical shape to app/api/campaign-credits/route.ts.
 */

import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { adminDb } from "@/lib/firebase-admin"
import { verifyAccessToken } from "@/lib/auth-tokens"
import { callCampaignBackend } from "@/lib/campaign-backend"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
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

  const eventId = req.nextUrl.searchParams.get("eventId")
  if (!eventId) {
    return NextResponse.json({ success: false, error: "eventId is required" }, { status: 400 })
  }

  const eventDoc = await adminDb.collection("events").doc(eventId).get()
  if (!eventDoc.exists) {
    return NextResponse.json({ success: false, error: "Event not found" }, { status: 404 })
  }
  if (eventDoc.data()?.organizerId !== uid) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
  }

  try {
    const { res, data } = await callCampaignBackend(
      `/campaign-purchases?eventId=${encodeURIComponent(eventId)}&organizerId=${encodeURIComponent(uid)}`
    )
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    return NextResponse.json({ success: false, error: "Failed to load purchase history" }, { status: 500 })
  }
}
