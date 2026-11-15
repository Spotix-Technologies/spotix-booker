/**
 * GET /api/sms/campaigns/[smsCampaignId]/numbers
 *   → { success, numbers: string[] }          — for "edit & resend"
 * GET /api/sms/campaigns/[smsCampaignId]/numbers?download=1
 *   → the numbers as a .txt file, one per line — for the "Download numbers"
 *     button on the campaign page. Works for any status (a rejected campaign's
 *     numbers are still the booker's own data).
 */
import { NextRequest, NextResponse } from "next/server"
import { requireBooker } from "@/lib/booker-session"
import { callCampaignBackend } from "@/lib/campaign-backend"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest, { params }: { params: Promise<{ smsCampaignId: string }> }) {
  const session = await requireBooker()
  if ("error" in session) return session.error
  const { smsCampaignId } = await params
  const download = req.nextUrl.searchParams.get("download") === "1"

  try {
    const { res, data } = await callCampaignBackend(
      `/sms/campaigns/${encodeURIComponent(smsCampaignId)}/numbers?organizerId=${encodeURIComponent(session.uid)}`
    )
    if (!download || !res.ok || !data?.success) {
      return NextResponse.json(data, { status: res.status })
    }
    const body = (Array.isArray(data.numbers) ? data.numbers : []).join("\n") + "\n"
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="sms-numbers-${smsCampaignId.replace(/[^a-zA-Z0-9-]/g, "")}.txt"`,
        "Cache-Control": "no-store",
      },
    })
  } catch {
    return NextResponse.json({ success: false, error: "Failed to load numbers" }, { status: 500 })
  }
}
