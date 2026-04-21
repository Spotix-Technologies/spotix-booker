import { NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/maintenance/status
 * Public endpoint — no auth required.
 * Returns the current maintenance state from admin/global.
 */
export async function GET() {
  try {
    const snap = await adminDb.collection("admin").doc("global").get()

    if (!snap.exists) {
      return NextResponse.json({ isMaintenance: false, maintenanceReason: null })
    }

    const data = snap.data()!

    return NextResponse.json({
      isMaintenance: data.isMaintenance ?? false,
      maintenanceReason: data.maintenanceReason ?? null,
    })
  } catch (err) {
    console.error("[GET /api/maintenance/status] error:", err)
    // Fail open — never block users due to a status-check error
    return NextResponse.json({ isMaintenance: false, maintenanceReason: null })
  }
}