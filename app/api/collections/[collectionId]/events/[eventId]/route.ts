/**
 * app/api/collections/[collectionId]/events/[eventId]/route.ts
 *
 * DELETE /api/collections/{collectionId}/events/{eventId} — detach an
 * event from a collection. Mirrors the add route: deletes the
 * denormalized subcollection doc, clears the collectionId/collectionName
 * reference on the event doc itself, and decrements eventCount.
 */

import { NextResponse } from "next/server"
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

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ collectionId: string; eventId: string }> }
) {
  const auth = await authenticate()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth
  const { collectionId, eventId } = await params

  try {
    const collectionRef = adminDb.collection("event_collections").doc(collectionId)
    const eventRef = adminDb.collection("events").doc(eventId)
    const collectionEventRef = collectionRef.collection("events").doc(eventId)

    const [collectionDoc, collectionEventDoc] = await Promise.all([
      collectionRef.get(),
      collectionEventRef.get(),
    ])

    if (!collectionDoc.exists) return fail("Collection not found", 404)
    if (collectionDoc.data()!.organizerId !== userId) {
      return fail("Forbidden: you do not own this collection", 403)
    }
    if (!collectionEventDoc.exists) return fail("This event is not in that collection", 404)

    const batch = adminDb.batch()
    batch.delete(collectionEventRef)
    batch.update(collectionRef, { eventCount: FieldValue.increment(-1) })
    // The event doc might have been deleted separately since being added —
    // don't let that stop the removal from the collection side.
    const eventDoc = await eventRef.get()
    if (eventDoc.exists) {
      batch.update(eventRef, {
        collectionId: FieldValue.delete(),
        collectionName: FieldValue.delete(),
      })
    }
    await batch.commit()

    return ok({ message: "Event removed from collection" })
  } catch (e) {
    console.error("[/api/collections/[collectionId]/events/[eventId] DELETE]", e)
    return fail("Could not remove event from collection. Please try again.", 500)
  }
}
