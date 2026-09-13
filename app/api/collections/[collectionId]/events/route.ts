/**
 * app/api/collections/[collectionId]/events/route.ts
 *
 * POST /api/collections/{collectionId}/events — attach an already-created
 * event (created the normal way via /api/event/one) to a collection.
 *
 * Two writes, batched:
 *  1. event_collections/{collectionId}/events/{eventId} — a denormalized
 *     snapshot (name/image/date/venue) so the Collections Manager can list
 *     a collection's events without an extra read per event.
 *  2. events/{eventId} — stamped with { collectionId, collectionName } so
 *     the event doc itself records which collection it belongs to (per
 *     the reference living on the event, not just on the collection).
 *
 * event_collections/{collectionId}.eventCount is kept in sync alongside.
 */

import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { adminDb } from "@/lib/firebase-admin"
import { FieldValue } from "firebase-admin/firestore"
import { verifyAccessToken } from "@/lib/auth-tokens"

const DEV_TAG = "spotix-api-v1"

function ok(data: object, status = 200) {
  return NextResponse.json({ success: true, developer: DEV_TAG, ...data }, { status })
}
function fail(message: string, status: number) {
  return NextResponse.json({ success: false, error: message, developer: DEV_TAG }, { status })
}

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  const auth = await authenticate()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth
  const { collectionId } = await params

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return fail("Invalid JSON body", 400)
  }

  const eventId = typeof body.eventId === "string" ? body.eventId.trim() : ""
  if (!eventId) return fail("eventId is required", 400)

  try {
    const collectionRef = adminDb.collection("event_collections").doc(collectionId)
    const eventRef = adminDb.collection("events").doc(eventId)

    const [collectionDoc, eventDoc] = await Promise.all([collectionRef.get(), eventRef.get()])

    if (!collectionDoc.exists) return fail("Collection not found", 404)
    const collectionData = collectionDoc.data()!
    if (collectionData.organizerId !== userId) {
      return fail("Forbidden: you do not own this collection", 403)
    }

    if (!eventDoc.exists) return fail("Event not found", 404)
    const eventData = eventDoc.data()!
    // Only the organizer's own events can be attached — mirrors the "create
    // the single event as per normal, then add it" flow: you can't add
    // someone else's event to your collection.
    if (eventData.organizerId !== userId) {
      return fail("Forbidden: you do not own this event", 403)
    }
    if (eventData.collectionId) {
      return fail(
        eventData.collectionId === collectionId
          ? "This event is already in this collection"
          : "This event already belongs to another collection — remove it from there first",
        409
      )
    }

    const collectionEventRef = collectionRef.collection("events").doc(eventId)

    const batch = adminDb.batch()
    batch.set(collectionEventRef, {
      eventId,
      eventName: eventData.eventName ?? "Unnamed event",
      eventImage: eventData.eventImage ?? null,
      eventDate: eventData.eventDate ?? null,
      eventVenue: eventData.eventVenue ?? null,
      addedAt: FieldValue.serverTimestamp(),
    })
    batch.update(eventRef, {
      collectionId,
      collectionName: collectionData.name ?? "",
    })
    batch.update(collectionRef, { eventCount: FieldValue.increment(1) })
    await batch.commit()

    return ok({ message: "Event added to collection" }, 201)
  } catch (e) {
    console.error("[/api/collections/[collectionId]/events POST]", e)
    return fail("Could not add event to collection. Please try again.", 500)
  }
}
