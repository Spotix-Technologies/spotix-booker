import { adminDb, FieldValue } from "@/lib/firebase-admin"
import { verifyAccessToken } from "@/lib/auth-tokens"

const TRANSFER_TTL_MS = 3 * 24 * 60 * 60 * 1000 // 3 days

// ─── Shared auth helper ────────────────────────────────────────────────────
async function authenticate(req: Request): Promise<{ userId: string } | Response> {
  const header = req.headers.get("x-user-id")
  if (header) return { userId: header }

  try {
    const cookieHeader = req.headers.get("cookie") ?? ""
    const match = cookieHeader.match(/spotix_at=([^;]+)/)
    if (!match) return Response.json({ error: "Unauthorized" }, { status: 401 })
    const payload = await verifyAccessToken(match[1], "spotix-booker")
    return { userId: payload.uid }
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/event/transfer?eventId={eventId}
// Returns the pending transfer request for a given event (if any).
// Only the organizer or recipient may read it.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const auth = await authenticate(req)
  if (auth instanceof Response) return auth
  const { userId: currentUserId } = auth

  const { searchParams } = new URL(req.url)
  const eventId = searchParams.get("eventId")

  if (!eventId) {
    return Response.json({ error: "Missing eventId" }, { status: 400 })
  }

  try {
    const snapshot = await adminDb
      .collection("transferRequests")
      .doc(eventId)
      .collection("requests")
      .where("status", "==", "pending")
      .orderBy("createdAt", "desc")
      .limit(1)
      .get()

    if (snapshot.empty) {
      return Response.json({ transfer: null })
    }

    const doc = snapshot.docs[0]
    const data = doc.data()

    // Only organizer or recipient may see it
    if (data.organizerId !== currentUserId && data.recipientId !== currentUserId) {
      return Response.json({ error: "Forbidden" }, { status: 403 })
    }

    return Response.json({ transfer: { id: doc.id, ...data } })
  } catch (err: any) {
    console.error("[GET /api/event/transfer]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/event/transfer
// Actions: "create" | "accept" | "reject"
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const auth = await authenticate(req)
  if (auth instanceof Response) return auth
  const { userId: currentUserId } = auth

  let body: any
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { action, eventId, recipientEmail, recipientUsername, recipientId, transferId } = body

  if (!action) {
    return Response.json({ error: "Missing action" }, { status: 400 })
  }

  // ─── CREATE ──────────────────────────────────────────────────────────────
  if (action === "create") {
    if (!eventId || !recipientEmail || !recipientId || !recipientUsername) {
      return Response.json(
        { error: "Missing eventId, recipientEmail, recipientId, or recipientUsername" },
        { status: 400 }
      )
    }

    if (recipientId === currentUserId) {
      return Response.json({ error: "Cannot transfer to yourself" }, { status: 400 })
    }

    // Verify event ownership
    const eventSnap = await adminDb.collection("events").doc(eventId).get()
    if (!eventSnap.exists) {
      return Response.json({ error: "Event not found" }, { status: 404 })
    }
    const eventData = eventSnap.data()!
    if (eventData.organizerId !== currentUserId) {
      return Response.json({ error: "Not the event organizer" }, { status: 403 })
    }

    // Fetch organizer info
    const organizerSnap = await adminDb.collection("users").doc(currentUserId).get()
    const organizerData = organizerSnap.data() ?? {}

    // Check for existing pending transfer
    const existing = await adminDb
      .collection("transferRequests")
      .doc(eventId)
      .collection("requests")
      .where("status", "==", "pending")
      .limit(1)
      .get()

    if (!existing.empty) {
      return Response.json(
        { error: "A pending transfer already exists for this event" },
        { status: 409 }
      )
    }

    const now = Date.now()
    const expiresAt = new Date(now + TRANSFER_TTL_MS)

    // Pre-generate a stable ref ID so we can mirror it to userTransferRequests
    const transferRef = adminDb
      .collection("transferRequests")
      .doc(eventId)
      .collection("requests")
      .doc()

    const userTransferRef = adminDb
      .collection("userTransferRequests")
      .doc(recipientId)
      .collection("requests")
      .doc(transferRef.id)

    const batch = adminDb.batch()

    batch.set(transferRef, {
      eventId,
      eventName: eventData.eventName ?? "",
      organizerId: currentUserId,
      organizerUsername: organizerData.username ?? "",
      recipientId,
      recipientEmail,
      recipientUsername,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
      expiresAt,
    })

    batch.set(userTransferRef, {
      transferId: transferRef.id,
      eventId,
      eventName: eventData.eventName ?? "",
      organizerUsername: organizerData.username ?? "",
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
      expiresAt,
    })

    await batch.commit()

    return Response.json({ transferId: transferRef.id, status: "pending" }, { status: 201 })
  }

  // ─── ACCEPT ──────────────────────────────────────────────────────────────
  if (action === "accept") {
    if (!eventId || !transferId) {
      return Response.json({ error: "Missing eventId or transferId" }, { status: 400 })
    }

    const transferRef = adminDb
      .collection("transferRequests")
      .doc(eventId)
      .collection("requests")
      .doc(transferId)

    const transferSnap = await transferRef.get()
    if (!transferSnap.exists) {
      return Response.json({ error: "Transfer not found" }, { status: 404 })
    }

    const t = transferSnap.data()!
    if (t.status !== "pending") {
      return Response.json({ error: "Transfer is no longer pending" }, { status: 400 })
    }
    if (t.recipientId !== currentUserId) {
      return Response.json({ error: "You are not the recipient" }, { status: 403 })
    }

    const expiresAt = t.expiresAt?.toDate?.() ?? new Date(t.expiresAt)
    if (expiresAt < new Date()) {
      return Response.json({ error: "Transfer request has expired" }, { status: 410 })
    }

    const userTransferRef = adminDb
      .collection("userTransferRequests")
      .doc(currentUserId)
      .collection("requests")
      .doc(transferId)

    const batch = adminDb.batch()
    batch.update(adminDb.collection("events").doc(eventId), {
      organizerId: currentUserId,
    })
    batch.update(transferRef, {
      status: "accepted",
      acceptedAt: FieldValue.serverTimestamp(),
    })
    batch.update(userTransferRef, { status: "accepted" })
    await batch.commit()

    return Response.json({ status: "accepted" })
  }

  // ─── REJECT ──────────────────────────────────────────────────────────────
  if (action === "reject") {
    if (!eventId || !transferId) {
      return Response.json({ error: "Missing eventId or transferId" }, { status: 400 })
    }

    const transferRef = adminDb
      .collection("transferRequests")
      .doc(eventId)
      .collection("requests")
      .doc(transferId)

    const transferSnap = await transferRef.get()
    if (!transferSnap.exists) {
      return Response.json({ error: "Transfer not found" }, { status: 404 })
    }

    const t = transferSnap.data()!
    if (t.status !== "pending") {
      return Response.json({ error: "Transfer is no longer pending" }, { status: 400 })
    }
    if (t.recipientId !== currentUserId) {
      return Response.json({ error: "You are not the recipient" }, { status: 403 })
    }

    const userTransferRef = adminDb
      .collection("userTransferRequests")
      .doc(currentUserId)
      .collection("requests")
      .doc(transferId)

    const batch = adminDb.batch()
    batch.update(transferRef, {
      status: "rejected",
      rejectedAt: FieldValue.serverTimestamp(),
    })
    batch.update(userTransferRef, { status: "rejected" })
    await batch.commit()

    return Response.json({ status: "rejected" })
  }

  return Response.json({ error: "Invalid action" }, { status: 400 })
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/event/transfer
// Cancels (deletes) a pending transfer request. Only the organizer may cancel.
// Body: { eventId, transferId }
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(req: Request) {
  const auth = await authenticate(req)
  if (auth instanceof Response) return auth
  const { userId: currentUserId } = auth

  let body: any
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { eventId, transferId } = body

  if (!eventId || !transferId) {
    return Response.json({ error: "Missing eventId or transferId" }, { status: 400 })
  }

  try {
    const transferRef = adminDb
      .collection("transferRequests")
      .doc(eventId)
      .collection("requests")
      .doc(transferId)

    const transferSnap = await transferRef.get()
    if (!transferSnap.exists) {
      return Response.json({ error: "Transfer not found" }, { status: 404 })
    }

    const t = transferSnap.data()!
    if (t.organizerId !== currentUserId) {
      return Response.json({ error: "Only the organizer can cancel a transfer" }, { status: 403 })
    }
    if (t.status !== "pending") {
      return Response.json({ error: "Only pending transfers can be cancelled" }, { status: 400 })
    }

    // Delete both the main transfer doc and the recipient's denormalized copy
    const userTransferRef = adminDb
      .collection("userTransferRequests")
      .doc(t.recipientId)
      .collection("requests")
      .doc(transferId)

    const batch = adminDb.batch()
    batch.delete(transferRef)
    batch.delete(userTransferRef)
    await batch.commit()

    return Response.json({ status: "cancelled" })
  } catch (err: any) {
    console.error("[DELETE /api/event/transfer]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}