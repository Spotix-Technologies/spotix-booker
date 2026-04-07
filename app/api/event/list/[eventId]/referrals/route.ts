/**
 * app/api/event/[eventId]/referrals/route.ts
 *
 * GET    /api/event/[eventId]/referrals
 *   → Returns all referral codes and their usages for the event
 *
 * POST   /api/event/[eventId]/referrals
 *   Body { code: string } → Add a new referral code
 *
 * DELETE /api/event/[eventId]/referrals
 *   Body { code: string } → Delete a referral code
 *
 * All handlers:
 *   - Auth via spotix_at httpOnly cookie
 *   - Ownership enforced: authenticated user must be the event organizer
 *   - Admin SDK only — no client SDK
 *
 * Firestore structure:
 *   events/{eventId}/referrals/{code}
 */

import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { adminDb } from "@/lib/firebase-admin"
import { verifyAccessToken } from "@/lib/auth-tokens"
import { FieldValue } from "firebase-admin/firestore"

const DEV_TAG = "spotix-api-v1"

function ok(data: object, status = 200) {
  return NextResponse.json({ success: true, developer: DEV_TAG, ...data }, { status })
}

function fail(message: string, status: number) {
  return NextResponse.json({ success: false, error: message, developer: DEV_TAG }, { status })
}

// ─── Auth ──────────────────────────────────────────────────────────────────────
async function authenticate(): Promise<{ userId: string } | NextResponse> {
  const cookieStore = await cookies()
  const token = cookieStore.get("spotix_at")?.value
  if (!token) return fail("No access token", 401)
  try {
    const payload = await verifyAccessToken(token, "spotix-booker")
    return { userId: payload.uid }
  } catch {
    return fail("Invalid or expired access token", 401)
  }
}

// ─── Ownership guard ───────────────────────────────────────────────────────────
async function resolveOwnedEvent(
  eventId: string,
  userId: string
): Promise<
  | { ref: FirebaseFirestore.DocumentReference }
  | NextResponse
> {
  const ref = adminDb.collection("events").doc(eventId)
  const snap = await ref.get()
  if (!snap.exists) return fail("Event not found", 404)
  if (snap.data()!.organizerId !== userId) return fail("Forbidden: you do not own this event", 403)
  return { ref }
}

// ─── GET ───────────────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const auth = await authenticate()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  const { eventId } = await params
  if (!eventId?.trim()) return fail("eventId is required", 400)

  const owned = await resolveOwnedEvent(eventId, userId)
  if (owned instanceof NextResponse) return owned
  const { ref: eventRef } = owned

  try {
    const snapshot = await eventRef.collection("referrals").get()

    const referrals = snapshot.docs.map((d) => {
      const data = d.data()
      return {
        code: d.id,
        usages: data.usages ?? [],
        totalTickets: data.totalTickets ?? 0,
      }
    })

    return ok({ referrals })
  } catch (e) {
    console.error("[GET referrals] failed", e)
    return fail("Failed to fetch referrals", 500)
  }
}

// ─── POST ──────────────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const auth = await authenticate()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  const { eventId } = await params
  if (!eventId?.trim()) return fail("eventId is required", 400)

  let body: Record<string, any>
  try { body = await req.json() } catch { return fail("Invalid JSON body", 400) }

  const { code } = body
  if (!code?.trim()) return fail("code is required", 400)

  const owned = await resolveOwnedEvent(eventId, userId)
  if (owned instanceof NextResponse) return owned
  const { ref: eventRef } = owned

  const referralsRef = eventRef.collection("referrals")

  // Check for duplicate (case-insensitive)
  const allDocs = await referralsRef.get()
  const duplicate = allDocs.docs.some(
    (d) => d.id.toLowerCase() === code.trim().toLowerCase()
  )
  if (duplicate) return fail("This referral code already exists", 409)

  try {
    await referralsRef.doc(code.trim()).set({
      usages: [],
      totalTickets: 0,
      createdAt: FieldValue.serverTimestamp(),
    })

    return ok(
      {
        message: "Referral code added successfully",
        referral: { code: code.trim(), usages: [], totalTickets: 0 },
      },
      201
    )
  } catch (e) {
    console.error("[POST referrals] failed", e)
    return fail("Failed to add referral code", 500)
  }
}

// ─── DELETE ────────────────────────────────────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const auth = await authenticate()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  const { eventId } = await params
  if (!eventId?.trim()) return fail("eventId is required", 400)

  let body: Record<string, any>
  try { body = await req.json() } catch { return fail("Invalid JSON body", 400) }

  const { code } = body
  if (!code?.trim()) return fail("code is required", 400)

  const owned = await resolveOwnedEvent(eventId, userId)
  if (owned instanceof NextResponse) return owned
  const { ref: eventRef } = owned

  const referralRef = eventRef.collection("referrals").doc(code.trim())
  const snap = await referralRef.get()
  if (!snap.exists) return fail("Referral code not found", 404)

  try {
    await referralRef.delete()
    return ok({ message: "Referral code deleted successfully" })
  } catch (e) {
    console.error("[DELETE referrals] failed", e)
    return fail("Failed to delete referral code", 500)
  }
}