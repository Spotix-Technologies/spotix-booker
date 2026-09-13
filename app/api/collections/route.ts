/**
 * app/api/collections/route.ts
 *
 * Event Collections — item 3 of the Sep 2026 create-event fixes.
 *
 * A collection is a flat, top-level `event_collections/{collectionId}`
 * document: just a name, description, and cover image, owned by a
 * booker (organizerId). It is a *container*, not an event-creation flow —
 * the organizer creates individual events the normal way (POST
 * /api/event/one) and then attaches an already-created event to a
 * collection from the Collections Manager (see
 * app/api/collections/[collectionId]/events/route.ts).
 *
 * GET  /api/collections        — list the current organizer's own collections
 * POST /api/collections        — create a new (empty) collection
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

// ─── GET /api/collections — the organizer's own collections ─────────────────
export async function GET() {
  const auth = await authenticate()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  try {
    const snapshot = await adminDb
      .collection("event_collections")
      .where("organizerId", "==", userId)
      .get()

    const collections = snapshot.docs
      .map((doc) => {
        const data = doc.data()
        return {
          id: doc.id,
          name: data.name ?? "Untitled collection",
          description: data.description ?? "",
          image: data.image ?? "",
          eventCount: data.eventCount ?? 0,
          createdAt: data.createdAt?.toDate?.().toISOString() ?? null,
        }
      })
      // Newest first — createdAt is a server timestamp so this is stable.
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))

    return ok({ collections })
  } catch (e) {
    console.error("[/api/collections GET]", e)
    return fail("Internal server error", 500)
  }
}

// ─── POST /api/collections — create a new collection ────────────────────────
export async function POST(req: NextRequest) {
  const auth = await authenticate()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return fail("Invalid JSON body", 400)
  }

  const name = typeof body.name === "string" ? body.name.trim() : ""
  const description = typeof body.description === "string" ? body.description.trim() : ""
  const image = typeof body.image === "string" ? body.image.trim() : ""

  if (!name) return fail("name is required", 400)
  if (!description) return fail("description is required", 400)
  if (!image) return fail("image is required", 400)

  try {
    const collectionData = {
      name,
      description,
      image,
      organizerId: userId,
      eventCount: 0,
      createdAt: FieldValue.serverTimestamp(),
    }

    const docRef = await adminDb.collection("event_collections").add(collectionData)

    return ok(
      {
        message: "Collection created successfully",
        collectionId: docRef.id,
        collection: { id: docRef.id, name, description, image, eventCount: 0 },
      },
      201
    )
  } catch (e) {
    console.error("[/api/collections POST]", e)
    return fail("Could not create collection. Please try again.", 500)
  }
}
