/**
 * app/api/campaigns/[campaignId]/resubmit/route.ts
 *
 * POST /api/campaigns/{campaignId}/resubmit
 *   { templateId, message, brandColor, ctaText }
 *
 * For a campaign that moderation flagged. Only the design fields are
 * accepted — the backend keeps the audience, name and event locked and
 * re-runs the same review pipeline as a fresh start.
 */

import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyAccessToken } from "@/lib/auth-tokens"
import { callCampaignBackend } from "@/lib/campaign-backend"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest, { params }: { params: Promise<{ campaignId: string }> }) {
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

  const body = await req.json().catch(() => ({}))
  const { templateId, message, brandColor, ctaText } = body || {}

  const { res, data } = await callCampaignBackend(`/campaigns/${encodeURIComponent(campaignId)}/resubmit`, {
    method: "POST",
    body: JSON.stringify({ organizerId: uid, templateId, messageText: message, brandColor, ctaText }),
  })
  return NextResponse.json(data, { status: res.status })
}
