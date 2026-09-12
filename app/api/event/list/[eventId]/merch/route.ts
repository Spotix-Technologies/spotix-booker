/**
 * app/api/event/list/[eventId]/merch/route.ts
 *
 * GET    /api/event/list/[eventId]/merch
 *   → Fetches all listings added to the event, enriched with full product data
 *
 * POST   /api/event/list/[eventId]/merch
 *   Body { listingId, currentUserId, eventName }
 *   → Adds listing to events/{eventId}/listings
 *
 * DELETE /api/event/list/[eventId]/merch
 *   Body { firestoreId, eventName }
 *   → Removes listing from events/{eventId}/listings
 *
 * All handlers:
 *   - Auth via spotix_at httpOnly cookie
 *   - Ownership enforced: authenticated user must be the event organizer
 *   - Admin SDK (Firestore) + service-role Supabase client — no client SDK
 *
 * Firestore structure:
 *   events/{eventId}/listings/{firestoreId}  { listingId, userId, addedAt }
 *
 * Product data itself (productName, description, price, images, quantity,
 * status) lives in Supabase's merch_listings table — see lib/merch-db.ts
 * and /supabase/schema-merch.sql — NOT in Firestore. The
 * `listing/{userId}/products/{listingId}` path this route used to read/
 * write no longer has any real data; every listing now lives in Supabase
 * from the moment it's created (see app/api/listings/route.ts). This route
 * only keeps the event<->listing *link* in Firestore.
 *
 * Note: the old Firestore-side `addedEvents` array (arrayUnion/arrayRemove
 * on the product doc, a reverse index of "which events include this
 * listing") is dropped rather than ported to a new Supabase column —
 * nothing else in the codebase reads it, and events/{eventId}/listings is
 * already the authoritative forward index.
 */

import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyAccessToken } from "@/lib/auth-tokens"
import { FieldValue } from "firebase-admin/firestore"
import { resolveEventAccess, hasTab } from "@/lib/event-access"
import { getMerchListingById } from "@/lib/merch-db"

const DEV_TAG = "spotix-api-v1"

function ok(data: object, status = 200) {
  return NextResponse.json({ success: true, developer: DEV_TAG, ...data }, { status })
}

function fail(message: string, status: number) {
  return NextResponse.json({ success: false, error: message, developer: DEV_TAG }, { status })
}

// --- Auth ------------------------------------------------------------------
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

// --- Access guard — Creator, Admin, or any collaborator (built-in or custom)
// granted the "merch" tab -----------------------------------------------------
async function resolveMerchAccess(
  eventId: string,
  userId: string
): Promise<{ ref: FirebaseFirestore.DocumentReference } | NextResponse> {
  const access = await resolveEventAccess(eventId, userId)
  if (!access.ok) return fail(access.error, access.status)
  if (!hasTab(access, "merch")) {
    return fail("Forbidden: your role does not have access to Merch on this event", 403)
  }
  return { ref: access.eventRef }
}

// --- GET ---------------------------------------------------------------------
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const auth = await authenticate()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  const { eventId } = await params
  if (!eventId?.trim()) return fail("eventId is required", 400)

  const owned = await resolveMerchAccess(eventId, userId)
  if (owned instanceof NextResponse) return owned
  const { ref: eventRef } = owned

  try {
    const listingsSnap = await eventRef.collection("listings").get()

    // Enrich each listing doc with full product data from Supabase, in parallel
    const listings = await Promise.all(
      listingsSnap.docs.map(async (d) => {
        const data = d.data()
        const { listingId } = data

        try {
          const listing = await getMerchListingById(listingId)
          if (!listing) return null

          return {
            firestoreId: d.id,
            id: listing.id,
            productName: listing.productName,
            description: listing.description,
            price: listing.price,
            images: listing.images,
            quantity: listing.quantity,
            status: listing.status,
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

// --- POST ----------------------------------------------------------------------
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

  const owned = await resolveMerchAccess(eventId, userId)
  if (owned instanceof NextResponse) return owned
  const { ref: eventRef } = owned

  // Verify the product exists in Supabase and actually belongs to
  // currentUserId — the old Firestore path never checked ownership here,
  // trusting whatever the client sent; this closes that gap.
  const listing = await getMerchListingById(listingId)
  if (!listing) return fail("Listing not found", 404)
  if (listing.bookerId !== currentUserId) {
    return fail("This listing does not belong to the specified user", 403)
  }

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

    return ok(
      {
        message: "Listing added successfully",
        listing: {
          firestoreId: newDocRef.id,
          id: listing.id,
          productName: listing.productName,
          description: listing.description,
          price: listing.price,
          images: listing.images,
          quantity: listing.quantity,
          status: listing.status,
        },
      },
      201
    )
  } catch (e) {
    console.error("[POST merch] failed", e)
    return fail("Failed to add listing", 500)
  }
}

// --- DELETE ----------------------------------------------------------------------
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

  const owned = await resolveMerchAccess(eventId, userId)
  if (owned instanceof NextResponse) return owned
  const { ref: eventRef } = owned

  const listingDocRef = eventRef.collection("listings").doc(firestoreId)
  const listingSnap = await listingDocRef.get()
  if (!listingSnap.exists) return fail("Listing not found", 404)

  try {
    await listingDocRef.delete()
    return ok({ message: "Listing removed successfully" })
  } catch (e) {
    console.error("[DELETE merch] failed", e)
    return fail("Failed to remove listing", 500)
  }
}
