/**
 * GET /api/sms/event-numbers?eventId=…
 *
 * Phone numbers for a bulk SMS audience, sourced the same way ticket payment
 * references are created (spotix-user's create-pay-ref → Firestore
 * `Reference`, one doc per purchase, with `eventId` and `userPhone`): query
 * `Reference` where eventId == the selected event and return the `userPhone`
 * values that are present.
 *
 * Only SUCCESSFUL purchases are included — pending/failed references belong
 * to people who never actually bought a ticket. Numbers are returned RAW
 * (the client validates/flags them through lib/sms-phone.ts, the same as
 * every other source). The event must belong to the signed-in booker.
 */
import { NextRequest, NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"
import { requireBooker, requireOwnedEvent } from "@/lib/booker-session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const session = await requireBooker()
  if ("error" in session) return session.error

  const eventId = req.nextUrl.searchParams.get("eventId")
  if (!eventId) return NextResponse.json({ success: false, error: "eventId is required" }, { status: 400 })

  const owned = await requireOwnedEvent(session.uid, eventId)
  if ("error" in owned) return owned.error

  try {
    // Two equality filters — no composite index needed.
    const snap = await adminDb
      .collection("Reference")
      .where("eventId", "==", eventId)
      .where("status", "==", "successful")
      .get()

    const phones: string[] = []
    snap.docs.forEach((doc) => {
      const phone = doc.data().userPhone
      if (typeof phone === "string" && phone.trim()) phones.push(phone.trim())
    })

    return NextResponse.json({ success: true, numbers: phones, referencesScanned: snap.size })
  } catch (err) {
    console.error("[sms/event-numbers] query failed:", err)
    return NextResponse.json({ success: false, error: "Couldn't load phone numbers for that event" }, { status: 500 })
  }
}
