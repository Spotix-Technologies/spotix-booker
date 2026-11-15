/**
 * app/api/campaigns/[campaignId]/route.ts
 *
 * GET /api/campaigns/{campaignId} → campaign detail, ownership-checked.
 *
 * The backend doesn't know about Firestore event ownership, so this
 * route fetches the campaign first (to learn its event_id/organizer_id)
 * and then checks the caller against organizer_id directly — cheaper
 * than a round trip through Firestore for a value the backend already
 * has, and still never trusts the frontend's word for who owns what.
 */

import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyAccessToken } from "@/lib/auth-tokens"
import { callCampaignBackend } from "@/lib/campaign-backend"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest, { params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params

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

  const { res, data } = await callCampaignBackend(`/campaigns/${encodeURIComponent(campaignId)}`)
  if (!res.ok) return NextResponse.json(data, { status: res.status })

  if (data?.campaign?.organizer_id !== uid) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
  }
  return NextResponse.json(data)
}
