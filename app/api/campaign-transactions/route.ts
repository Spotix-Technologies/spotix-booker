/**
 * app/api/campaign-transactions/route.ts
 *
 * GET /api/campaign-transactions?kind=all|email|sms&limit=10&cursor=…
 *
 * The booker's email + SMS credit movements, newest first. Credits belong to
 * the booker's account, so there's no event to check — the spotix_at cookie
 * is the only auth needed, and the organizerId sent to the backend always
 * comes from the verified session, never from the query string.
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
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit")) || 25, 1), 100)
  const cursor = req.nextUrl.searchParams.get("cursor")

  const qs = new URLSearchParams({ organizerId: session.uid, kind, limit: String(limit) })
  if (cursor) qs.set("cursor", cursor)

  try {
    const { res, data } = await callCampaignBackend(`/campaign-transactions?${qs.toString()}`)
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: "Failed to load transactions" }, { status: 500 })
  }
}
