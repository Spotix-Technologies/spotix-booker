import { auth } from "@/lib/firebase"
import { adminDb, FieldValue } from "@/lib/firebase"
import { getAuth } from "firebase-admin/auth"

/**
 * GET /api/event/transfer
 * Fetch all pending transfer requests for the logged-in user.
 * Returns transfers where the user is either the requester or recipient.
 */
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = authHeader.slice(7)
    let currentUserId: string

    try {
      const decodedToken = await getAuth().verifyIdToken(token)
      currentUserId = decodedToken.uid
    } catch {
      return Response.json({ error: "Invalid token" }, { status: 401 })
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Fetch all pending transfers for the current user (as requester or recipient)
    // ─────────────────────────────────────────────────────────────────────────
    const snapshot = await adminDb
      .collection("transfers")
      .where("status", "==", "pending")
      .get()

    const transfers = snapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      .filter((t: any) => t.requesterId === currentUserId || t.recipientId === currentUserId)
      .sort((a: any, b: any) => {
        const aTime = a.createdAt?.toMillis?.() || 0
        const bTime = b.createdAt?.toMillis?.() || 0
        return bTime - aTime
      })

    return Response.json({ transfers })
  } catch (err: any) {
    console.error("[GET /api/event/transfer]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * POST /api/event/transfer
 * Create, accept, or reject a transfer request.
 *
 * Body:
 * {
 *   action: "create" | "accept" | "reject",
 *   eventId: string,
 *   recipientEmail?: string,  // for "create"
 *   transferId?: string,       // for "accept" or "reject"
 * }
 */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = authHeader.slice(7)
    let currentUserId: string

    try {
      const decodedToken = await getAuth().verifyIdToken(token)
      currentUserId = decodedToken.uid
    } catch {
      return Response.json({ error: "Invalid token" }, { status: 401 })
    }

    const body = await req.json()
    const { action, eventId, recipientEmail, transferId } = body

    if (!action) {
      return Response.json({ error: "Missing action" }, { status: 400 })
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CREATE: Initiate a new transfer request
    // ─────────────────────────────────────────────────────────────────────────
    if (action === "create") {
      if (!eventId || !recipientEmail) {
        return Response.json({ error: "Missing eventId or recipientEmail" }, { status: 400 })
      }

      // Fetch the event to verify ownership
      const eventSnap = await adminDb.collection("events").doc(eventId).get()
      if (!eventSnap.exists) {
        return Response.json({ error: "Event not found" }, { status: 404 })
      }

      const eventData = eventSnap.data()
      if (eventData?.organizerId !== currentUserId) {
        return Response.json({ error: "Not the event organizer" }, { status: 403 })
      }

      // Search for recipient by email
      const recipientSnapshot = await adminDb
        .collection("users")
        .where("email", "==", recipientEmail)
        .limit(1)
        .get()

      if (recipientSnapshot.empty) {
        return Response.json({ error: "Recipient not found" }, { status: 404 })
      }

      const recipientId = recipientSnapshot.docs[0].id

      // Prevent self-transfer
      if (recipientId === currentUserId) {
        return Response.json({ error: "Cannot transfer to yourself" }, { status: 400 })
      }

      // Check if a pending transfer already exists for this event
      const existingTransfer = await adminDb
        .collection("transfers")
        .where("eventId", "==", eventId)
        .where("status", "==", "pending")
        .limit(1)
        .get()

      if (!existingTransfer.empty) {
        return Response.json({ error: "A pending transfer already exists for this event" }, { status: 409 })
      }

      // Create the transfer request
      const transferRef = await adminDb.collection("transfers").add({
        eventId,
        requesterId: currentUserId,
        recipientId,
        recipientEmail,
        status: "pending",
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days
      })

      return Response.json({ transferId: transferRef.id, status: "pending" }, { status: 201 })
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ACCEPT: Accept a transfer request
    // ─────────────────────────────────────────────────────────────────────────
    if (action === "accept") {
      if (!transferId) {
        return Response.json({ error: "Missing transferId" }, { status: 400 })
      }

      const transferSnap = await adminDb.collection("transfers").doc(transferId).get()
      if (!transferSnap.exists) {
        return Response.json({ error: "Transfer not found" }, { status: 404 })
      }

      const transferData = transferSnap.data() as any
      if (transferData.status !== "pending") {
        return Response.json({ error: "Transfer is no longer pending" }, { status: 400 })
      }

      if (transferData.recipientId !== currentUserId) {
        return Response.json({ error: "You are not the recipient of this transfer" }, { status: 403 })
      }

      // Check expiry
      const expiresAt = transferData.expiresAt?.toDate?.() || new Date(transferData.expiresAt)
      if (expiresAt < new Date()) {
        return Response.json({ error: "Transfer request has expired" }, { status: 410 })
      }

      // Update the event's organizerId atomically
      await adminDb.collection("events").doc(transferData.eventId).update({
        organizerId: currentUserId,
      })

      // Mark transfer as accepted
      await adminDb.collection("transfers").doc(transferId).update({
        status: "accepted",
        acceptedAt: FieldValue.serverTimestamp(),
      })

      return Response.json({ status: "accepted" })
    }

    // ─────────────────────────────────────────────────────────────────────────
    // REJECT: Reject a transfer request
    // ─────────────────────────────────────────────────────────────────────────
    if (action === "reject") {
      if (!transferId) {
        return Response.json({ error: "Missing transferId" }, { status: 400 })
      }

      const transferSnap = await adminDb.collection("transfers").doc(transferId).get()
      if (!transferSnap.exists) {
        return Response.json({ error: "Transfer not found" }, { status: 404 })
      }

      const transferData = transferSnap.data() as any
      if (transferData.status !== "pending") {
        return Response.json({ error: "Transfer is no longer pending" }, { status: 400 })
      }

      if (transferData.recipientId !== currentUserId) {
        return Response.json({ error: "You are not the recipient of this transfer" }, { status: 403 })
      }

      // Mark transfer as rejected
      await adminDb.collection("transfers").doc(transferId).update({
        status: "rejected",
        rejectedAt: FieldValue.serverTimestamp(),
      })

      return Response.json({ status: "rejected" })
    }

    return Response.json({ error: "Invalid action" }, { status: 400 })
  } catch (err: any) {
    console.error("[POST /api/event/transfer]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
