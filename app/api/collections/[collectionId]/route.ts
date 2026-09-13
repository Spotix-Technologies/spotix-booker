/**
 * app/api/collections/[collectionId]/route.ts
 *
 * GET /api/collections/{collectionId} — a single collection plus the
 * (denormalized) list of events currently attached to it, for the
 * Collections Manager screen.
 */

import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { adminDb } from "@/lib/firebase-admin"
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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  const auth = await authenticate()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth
  const { collectionId } = await params

  try {
    const collectionRef = adminDb.collection("event_collections").doc(collectionId)
    const collectionDoc = await collectionRef.get()

    if (!collectionDoc.exists) return fail("Collection not found", 404)
    const data = collectionDoc.data()!
    if (data.organizerId !== userId) return fail("Forbidden: you do not own this collection", 403)

    const eventsSnapshot = await collectionRef.collection("events").orderBy("addedAt", "desc").get()
    const events = eventsSnapshot.docs.map((doc) => {
      const e = doc.data()
      return {
        eventId: doc.id,
        eventName: e.eventName ?? "Unnamed event",
        eventImage: e.eventImage ?? null,
        eventDate: e.eventDate ?? null,
        eventVenue: e.eventVenue ?? null,
        addedAt: e.addedAt?.toDate?.().toISOString() ?? null,
      }
    })

    return ok({
      collection: {
        id: collectionDoc.id,
        name: data.name ?? "Untitled collection",
        description: data.description ?? "",
        image: data.image ?? "",
        eventCount: data.eventCount ?? events.length,
      },
      events,
    })
  } catch (e) {
    console.error("[/api/collections/[collectionId] GET]", e)
    return fail("Internal server error", 500)
  }
}
