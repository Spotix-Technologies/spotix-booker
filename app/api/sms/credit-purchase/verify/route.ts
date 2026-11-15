/** POST /api/sms/credit-purchase/verify { reference } — called right after the Paystack popup reports success. */
import { NextRequest, NextResponse } from "next/server"
import { requireBooker } from "@/lib/booker-session"
import { callCampaignBackend } from "@/lib/campaign-backend"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const session = await requireBooker()
  if ("error" in session) return session.error

  const { reference } = await req.json().catch(() => ({}))
  if (!reference) return NextResponse.json({ success: false, error: "reference is required" }, { status: 400 })

  try {
    const { res, data } = await callCampaignBackend("/sms/credit-purchase/verify", {
      method: "POST",
      body: JSON.stringify({ reference }),
    })
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: "Failed to verify purchase" }, { status: 500 })
  }
}
