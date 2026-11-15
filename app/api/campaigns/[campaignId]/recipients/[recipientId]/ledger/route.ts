/**
 * app/api/campaigns/[campaignId]/recipients/[recipientId]/ledger/route.ts
 *
 * GET /api/campaigns/{campaignId}/recipients/{recipientId}/ledger →
 * the full, immutable event history for ONE recipient — backs the
 * "Ledger" bottom sheet on the campaign detail page. Same ownership
 * check as the sibling recipients/route.ts (fetch the campaign first to
 * learn organizer_id, since the backend doesn't know about Firestore
 * event ownership).
 */

import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyAccessToken } from "@/lib/auth-tokens"
import { callCampaignBackend } from "@/lib/campaign-backend"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ campaignId: string; recipientId: string }> }
) {
  const { campaignId, recipientId } = await params

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

  const { res: campaignRes, data: campaignData } = await callCampaignBackend(`/campaigns/${encodeURIComponent(campaignId)}`)
  if (!campaignRes.ok) return NextResponse.json(campaignData, { status: campaignRes.status })
  if (campaignData?.campaign?.organizer_id !== uid) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
  }

  const { res, data } = await callCampaignBackend(
    `/campaigns/${encodeURIComponent(campaignId)}/recipients/${encodeURIComponent(recipientId)}/ledger`
  )
  return NextResponse.json(data, { status: res.status })
}
