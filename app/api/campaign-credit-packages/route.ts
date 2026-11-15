/**
 * app/api/campaign-credit-packages/route.ts
 *
 * GET /api/campaign-credit-packages — just needs auth (packages aren't
 * event- or organizer-specific), proxies to the backend which reads them
 * from Firebase admin/global/emailCreditPackages.
 */

import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyAccessToken } from "@/lib/auth-tokens"
import { callCampaignBackend } from "@/lib/campaign-backend"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
  const token = cookieStore.get("spotix_at")?.value
  if (!token) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  try {
    await verifyAccessToken(token, "spotix-booker")
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const { res, data } = await callCampaignBackend("/campaign-credit-packages")
  return NextResponse.json(data, { status: res.status })
}
