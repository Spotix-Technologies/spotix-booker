/**
 * app/api/campaign-credit-purchase/verify/route.ts
 *
 * POST /api/campaign-credit-purchase/verify  { reference }
 *
 * Called right after the Paystack popup reports success, for immediate
 * UI feedback. Server-side verification happens in the backend against
 * Paystack's own API (never trusts this call's word) — the webhook is
 * still the authoritative path if this call never fires (closed tab,
 * network blip).
 */

import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyAccessToken } from "@/lib/auth-tokens"
import { callCampaignBackend } from "@/lib/campaign-backend"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const token = cookieStore.get("spotix_at")?.value
  if (!token) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  try {
    await verifyAccessToken(token, "spotix-booker")
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const { reference } = await req.json().catch(() => ({}))
  if (!reference) return NextResponse.json({ success: false, error: "reference is required" }, { status: 400 })

  const { res, data } = await callCampaignBackend("/campaign-credit-purchase/verify", {
    method: "POST",
    body: JSON.stringify({ reference }),
  })
  return NextResponse.json(data, { status: res.status })
}
