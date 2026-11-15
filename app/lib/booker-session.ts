/**
 * app/lib/booker-session.ts
 *
 * Shared auth for the bulk SMS API routes — the same spotix_at cookie
 * check every other booker route repeats inline, pulled into one helper so
 * the eight new routes don't each re-implement it.
 */

import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { adminDb } from "@/lib/firebase-admin"
import { verifyAccessToken } from "@/lib/auth-tokens"

export interface BookerSession {
  uid: string
  email: string
}

export async function requireBooker(): Promise<BookerSession | { error: NextResponse }> {
  const cookieStore = await cookies()
  const token = cookieStore.get("spotix_at")?.value
  if (!token) return { error: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }) }
  try {
    const payload = await verifyAccessToken(token, "spotix-booker")
    return { uid: payload.uid, email: payload.email }
  } catch {
    return { error: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }) }
  }
}

/** Confirms the signed-in booker owns the event. Returns the event data. */
export async function requireOwnedEvent(uid: string, eventId: string) {
  const eventDoc = await adminDb.collection("events").doc(eventId).get()
  if (!eventDoc.exists) {
    return { error: NextResponse.json({ success: false, error: "Event not found" }, { status: 404 }) }
  }
  const event = eventDoc.data()!
  if (event.organizerId !== uid) {
    return { error: NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }) }
  }
  return { event }
}

/**
 * The booker's own username + email, read from the same users doc
 * /api/user/me serves — resolved server-side so nobody can point the
 * approved/rejected emails at someone else.
 */
export async function getBookerIdentity(uid: string, fallbackEmail: string) {
  const snap = await adminDb.collection("users").doc(uid).get()
  const u = snap.data() || {}
  return {
    email: (u.email as string) || fallbackEmail || "",
    username: (u.username as string) || (u.bookerName as string) || (u.fullName as string) || "",
    fullName: (u.fullName as string) || (u.bookerName as string) || "",
  }
}
