/**
 * GET /api/sms/credits → { success, credits: { available, reserved, consumed } }
 * SMS credits belong to the booker (not an event) and are separate from email credits.
 */
import { NextResponse } from "next/server"
import { requireBooker } from "@/lib/booker-session"
import { callCampaignBackend } from "@/lib/campaign-backend"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const session = await requireBooker()
  if ("error" in session) return session.error
  try {
    const { res, data } = await callCampaignBackend(`/sms/credits?organizerId=${encodeURIComponent(session.uid)}`)
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: "Failed to load SMS credits" }, { status: 500 })
  }
}
