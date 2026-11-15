/**
 * app/api/campaign-list/route.ts
 *
 * GET /api/campaign-list?kind=all|email|sms&limit=15&cursor=…
 *
 * Every email + SMS campaign on the booker's account, newest first, for
 * /campaign/list. organizerId always comes from the verified session.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireBooker } from "@/lib/booker-session"
import { callCampaignBackend } from "@/lib/campaign-backend"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const session = await requireBooker()
  if ("error" in session) return session.error

  const kind = req.nextUrl.searchParams.get("kind") || "all"
  if (!["all", "email", "sms"].includes(kind)) {
    return NextResponse.json({ success: false, error: "kind must be all, email or sms" }, { status: 400 })
  }
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit")) || 15, 1), 100)
  const cursor = req.nextUrl.searchParams.get("cursor")

  const qs = new URLSearchParams({ organizerId: session.uid, kind, limit: String(limit) })
  if (cursor) qs.set("cursor", cursor)

  try {
    const { res, data } = await callCampaignBackend(`/campaign-list?${qs.toString()}`)
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: "Failed to load campaigns" }, { status: 500 })
  }
}
