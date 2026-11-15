/**
 * POST /api/sms/quote { quantity, discountCode? }
 * Server-calculated price breakdown (thresholds → discount → VAT). The buy
 * modal only displays this; the real charge is recomputed again at purchase.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireBooker } from "@/lib/booker-session"
import { callCampaignBackend } from "@/lib/campaign-backend"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const session = await requireBooker()
  if ("error" in session) return session.error

  const { quantity, discountCode } = await req.json().catch(() => ({}))
  try {
    const { res, data } = await callCampaignBackend("/sms/quote", {
      method: "POST",
      body: JSON.stringify({ quantity: Number(quantity), discountCode: typeof discountCode === "string" ? discountCode : undefined }),
    })
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: "Failed to calculate price" }, { status: 500 })
  }
}
