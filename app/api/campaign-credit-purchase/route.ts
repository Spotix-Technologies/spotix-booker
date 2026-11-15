/**
 * app/api/campaign-credit-purchase/route.ts
 *
 * POST /api/campaign-credit-purchase  { packageId }
 * Every package includes analytics -- no toggle to pass through.
 *
 * Email credits are bought for the booker's ACCOUNT and can be spent on any
 * of their events, so no eventId is sent or checked.
 *
 * Retrieves name/email from the organizer's own Booker account (spec
 * §16 — never asks them to retype it), then asks the backend to create the
 * pending Reference doc + compute the Paystack-fee-inclusive total. Returns
 * what the client needs to open the Paystack popup — nothing is charged yet.
 */

import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { adminDb } from "@/lib/firebase-admin"
import { verifyAccessToken } from "@/lib/auth-tokens"
import { callCampaignBackend } from "@/lib/campaign-backend"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const token = cookieStore.get("spotix_at")?.value
  if (!token) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })

  let uid: string, email: string
  try {
    const payload = await verifyAccessToken(token, "spotix-booker")
    uid = payload.uid
    email = payload.email
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { packageId } = body || {}
  if (!packageId) {
    return NextResponse.json({ success: false, error: "packageId is required" }, { status: 400 })
  }

  const userDoc = await adminDb.collection("users").doc(uid).get()
  const name = userDoc.data()?.fullName || email

  const { res, data } = await callCampaignBackend("/campaign-credit-purchase", {
    method: "POST",
    body: JSON.stringify({ organizerId: uid, email, name, packageId }),
  })
  return NextResponse.json(data, { status: res.status })
}
