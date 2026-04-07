/**
 * app/api/event/list/[eventId]/merch/route.ts
 *
 * GET    /api/event/list/[eventId]/merch
 *   → Fetches all listings added to the event, enriched with full product data
 *
 * POST   /api/event/list/[eventId]/merch
 *   Body { listingId, currentUserId, eventName }
 *   → Adds listing to events/{eventId}/listings + arrayUnion(eventName) on the product doc
 *
 * DELETE /api/event/list/[eventId]/merch
 *   Body { firestoreId, eventName }
 *   → Removes listing from events/{eventId}/listings + arrayRemove(eventName) on the product doc
 *
 * All handlers:
 *   - Auth via spotix_at httpOnly cookie
 *   - Ownership enforced: authenticated user must be the event organizer
 *   - Admin SDK only — no client SDK
 *
 * Firestore structure:
 *   events/{eventId}/listings/{firestoreId}  { listingId, userId, addedAt }
 *   listing/{userId}/products/{listingId}    { productName, description, price, images, addedEvents[] }
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
): Promise<{ ref: FirebaseFirestore.DocumentReference } | NextResponse> {
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
    const listingsSnap = await eventRef.collection("listings").get()

    // Enrich each listing doc with full product data in parallel
    const listings = await Promise.all(
      listingsSnap.docs.map(async (d) => {
        const data = d.data()
        const { listingId, userId: ownerId } = data

        try {
          const productSnap = await adminDb
            .collection("listing")
            .doc(ownerId)
            .collection("products")
            .doc(listingId)
            .get()

          if (!productSnap.exists) return null

          const p = productSnap.data()!
          return {
            firestoreId: d.id,
            id: listingId,
            productName: p.productName ?? "",
            description: p.description ?? "",
            price: p.price ?? 0,
            images: p.images ?? [],
          }
        } catch {
          return null
        }
      })
    )

    return ok({ listings: listings.filter(Boolean) })
  } catch (e) {
    console.error("[GET merch] failed", e)
    return fail("Failed to fetch merchandise", 500)
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

  const { listingId, currentUserId, eventName } = body
  if (!listingId?.trim()) return fail("listingId is required", 400)
  if (!currentUserId?.trim()) return fail("currentUserId is required", 400)
  if (!eventName?.trim()) return fail("eventName is required", 400)

  const owned = await resolveOwnedEvent(eventId, userId)
  if (owned instanceof NextResponse) return owned
  const { ref: eventRef } = owned

  // Verify the product exists
  const productRef = adminDb
    .collection("listing")
    .doc(currentUserId)
    .collection("products")
    .doc(listingId)

  const productSnap = await productRef.get()
  if (!productSnap.exists) return fail("Listing not found", 404)

  // Check not already added
  const existing = await eventRef
    .collection("listings")
    .where("listingId", "==", listingId)
    .limit(1)
    .get()
  if (!existing.empty) return fail("This listing is already added to the event", 409)

  try {
    const newDocRef = eventRef.collection("listings").doc()
    await newDocRef.set({
      listingId,
      userId: currentUserId,
      addedAt: FieldValue.serverTimestamp(),
    })

    // arrayUnion eventName on the product doc
    await productRef.update({
      addedEvents: FieldValue.arrayUnion(eventName),
    })

    const p = productSnap.data()!
    return ok(
      {
        message: "Listing added successfully",
        listing: {
          firestoreId: newDocRef.id,
          id: listingId,
          productName: p.productName ?? "",
          description: p.description ?? "",
          price: p.price ?? 0,
          images: p.images ?? [],
        },
      },
      201
    )
  } catch (e) {
    console.error("[POST merch] failed", e)
    return fail("Failed to add listing", 500)
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

  const { firestoreId, eventName } = body
  if (!firestoreId?.trim()) return fail("firestoreId is required", 400)
  if (!eventName?.trim()) return fail("eventName is required", 400)

  const owned = await resolveOwnedEvent(eventId, userId)
  if (owned instanceof NextResponse) return owned
  const { ref: eventRef } = owned

  const listingDocRef = eventRef.collection("listings").doc(firestoreId)
  const listingSnap = await listingDocRef.get()
  if (!listingSnap.exists) return fail("Listing not found", 404)

  const { listingId, userId: ownerId } = listingSnap.data()!

  try {
    await listingDocRef.delete()

    // arrayRemove eventName from the product doc
    await adminDb
      .collection("listing")
      .doc(ownerId)
      .collection("products")
      .doc(listingId)
      .update({
        addedEvents: FieldValue.arrayRemove(eventName),
      })

    return ok({ message: "Listing removed successfully" })
  } catch (e) {
    console.error("[DELETE merch] failed", e)
    return fail("Failed to remove listing", 500)
  }
}