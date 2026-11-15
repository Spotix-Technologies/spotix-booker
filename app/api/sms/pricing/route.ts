/** GET /api/sms/pricing → base price, MOQ and volume thresholds. */
import { NextResponse } from "next/server"
import { requireBooker } from "@/lib/booker-session"
import { callCampaignBackend } from "@/lib/campaign-backend"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const session = await requireBooker()
  if ("error" in session) return session.error
  try {
    const { res, data } = await callCampaignBackend("/sms/pricing")
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: "Failed to load pricing" }, { status: 500 })
  }
}
