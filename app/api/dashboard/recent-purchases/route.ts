/**
 * app/api/dashboard/recent-purchases/route.ts
 *
 * GET /api/dashboard/recent-purchases
 *
 * Thin route handler — auth, then delegate straight to the modular
 * aggregator in lib/recent-purchases/index.ts. See that file for how the
 * four purchase kinds (tickets/merch/votes/elections) are gathered and
 * merged.
 */

import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyAccessToken } from "@/lib/auth-tokens"
import { getRecentPurchases } from "@/lib/recent-purchases"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get("spotix_at")?.value
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let userId: string
  try {
    const payload = await verifyAccessToken(token, "spotix-booker")
    userId = payload.uid
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 })
  }

  try {
    const purchases = await getRecentPurchases(userId)
    return NextResponse.json({ purchases })
  } catch (err) {
    console.error("[GET /api/dashboard/recent-purchases] error:", err)
    return NextResponse.json({ error: "Failed to load recent purchases" }, { status: 500 })
  }
}
