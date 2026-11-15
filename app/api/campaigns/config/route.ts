/**
 * app/api/campaigns/config/route.ts
 *
 * GET /api/campaigns/config → { success, validationRequired }
 *
 * Tells the create wizard whether the backend's isValidationAllowed flag
 * is on, so it can show the "Our system is reviewing the campaign" copy.
 * Requires a valid booker session like every other campaigns route, but
 * there's nothing event-specific to check.
 */

import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyAccessToken } from "@/lib/auth-tokens"
import { callCampaignBackend } from "@/lib/campaign-backend"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get("spotix_at")?.value
  if (!token) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  try {
    await verifyAccessToken(token, "spotix-booker")
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { res, data } = await callCampaignBackend("/campaigns/config")
    return NextResponse.json(data, { status: res.status })
  } catch {
    // Non-critical — the wizard just won't show the review copy.
    return NextResponse.json({ success: true, validationRequired: false })
  }
}
