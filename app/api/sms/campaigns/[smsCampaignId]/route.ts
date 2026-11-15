/** GET /api/sms/campaigns/[smsCampaignId] — one of the signed-in booker's bulk SMS campaigns. */
import { NextResponse } from "next/server"
import { requireBooker } from "@/lib/booker-session"
import { callCampaignBackend } from "@/lib/campaign-backend"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_req: Request, { params }: { params: Promise<{ smsCampaignId: string }> }) {
  const session = await requireBooker()
  if ("error" in session) return session.error
  const { smsCampaignId } = await params
  try {
    const { res, data } = await callCampaignBackend(
      `/sms/campaigns/${encodeURIComponent(smsCampaignId)}?organizerId=${encodeURIComponent(session.uid)}`
    )
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: "Failed to load campaign" }, { status: 500 })
  }
}
