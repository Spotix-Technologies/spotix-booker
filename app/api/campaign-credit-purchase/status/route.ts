/**
 * GET /api/campaign-credit-purchase/status?reference=…
 *
 * One status lookup for BOTH email and SMS credit purchases. This is what the
 * receipt shown from `?ref=…` in the URL calls: a buyer who left the browser
 * to finish paying and came back to a reloaded page only has the reference.
 * Scoped to the signed-in booker (someone else's reference reads as 404).
 */
import { NextRequest, NextResponse } from "next/server"
import { requireBooker } from "@/lib/booker-session"
import { callCampaignBackend } from "@/lib/campaign-backend"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const session = await requireBooker()
  if ("error" in session) return session.error

  const reference = req.nextUrl.searchParams.get("reference")
  if (!reference) return NextResponse.json({ success: false, error: "reference is required" }, { status: 400 })

  try {
    const { res, data } = await callCampaignBackend(
      `/campaign-credit-purchase/status?reference=${encodeURIComponent(reference)}&organizerId=${encodeURIComponent(session.uid)}`
    )
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: "Failed to check payment status" }, { status: 500 })
  }
}
