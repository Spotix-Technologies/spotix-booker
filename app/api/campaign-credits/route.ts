/**
 * app/api/campaign-credits/route.ts
 *
 * GET /api/campaign-credits → { success, credits: { available, reserved, consumed, … } }
 *
 * Email credits belong to the booker's account (like SMS credits) — one
 * balance shared by every event they own, so no eventId is needed any more.
 * Auth: spotix_at cookie.
 */

import { NextResponse } from "next/server"
import { requireBooker } from "@/lib/booker-session"
import { callCampaignBackend } from "@/lib/campaign-backend"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const session = await requireBooker()
  if ("error" in session) return session.error

  try {
    const { res, data } = await callCampaignBackend(
      `/campaign-credits?organizerId=${encodeURIComponent(session.uid)}`
    )
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    return NextResponse.json({ success: false, error: "Failed to load credits" }, { status: 500 })
  }
}
