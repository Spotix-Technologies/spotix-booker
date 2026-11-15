/**
 * app/api/campaigns/[campaignId]/start/route.ts
 *
 * POST /api/campaigns/{campaignId}/start
 *
 * Ownership is enforced backend-side too (campaigns.:id/start checks
 * organizer_id against the body we pass) — this route's own check is
 * defense in depth, same pattern as the rest of this folder.
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

  const { res, data } = await callCampaignBackend(`/campaigns/${encodeURIComponent(campaignId)}/start`, {
    method: "POST",
    body: JSON.stringify({ organizerId: uid }),
  })
  return NextResponse.json(data, { status: res.status })
}
