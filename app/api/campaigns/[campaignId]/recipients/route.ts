/**
 * app/api/campaigns/[campaignId]/recipients/route.ts
 *
 * GET /api/campaigns/{campaignId}/recipients → per-recipient send status
 * for the campaign detail page's recipient table. Same ownership check
 * as the sibling ../route.ts (backend doesn't know about Firestore event
 * ownership, so this fetches the campaign first to learn organizer_id).
 *
 * ?all=1 forwards through to the backend's own ?all=1, lifting the
 * default 500-row cap — used by the "clone this campaign" flow
 * (app/campaign/create) to pull the complete original audience.
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

  const { res: campaignRes, data: campaignData } = await callCampaignBackend(`/campaigns/${encodeURIComponent(campaignId)}`)
  if (!campaignRes.ok) return NextResponse.json(campaignData, { status: campaignRes.status })
  if (campaignData?.campaign?.organizer_id !== uid) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
  }

  const all = req.nextUrl.searchParams.get("all")
  const { res, data } = await callCampaignBackend(
    `/campaigns/${encodeURIComponent(campaignId)}/recipients${all ? "?all=1" : ""}`
  )
  return NextResponse.json(data, { status: res.status })
}
