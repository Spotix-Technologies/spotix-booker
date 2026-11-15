/**
 * POST /api/sms/credit-purchase { quantity, discountCode? }
 *
 * Name/email come from the booker's own account (never retyped), the backend
 * recomputes the price and creates the pending Reference doc. Returns what
 * the client needs to open the Paystack popup — nothing is charged yet.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireBooker, getBookerIdentity } from "@/lib/booker-session"
import { callCampaignBackend } from "@/lib/campaign-backend"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const session = await requireBooker()
  if ("error" in session) return session.error

  const { quantity, discountCode } = await req.json().catch(() => ({}))
  if (!quantity) return NextResponse.json({ success: false, error: "quantity is required" }, { status: 400 })

  const identity = await getBookerIdentity(session.uid, session.email)
  try {
    const { res, data } = await callCampaignBackend("/sms/credit-purchase", {
      method: "POST",
      body: JSON.stringify({
        organizerId: session.uid,
        email: identity.email,
        name: identity.fullName || identity.username || identity.email,
        quantity: Number(quantity),
        discountCode: typeof discountCode === "string" ? discountCode : undefined,
      }),
    })
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: "Failed to start purchase" }, { status: 500 })
  }
}
