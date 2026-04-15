import { adminDb } from "@/lib/firebase-admin"
import { verifyAccessToken } from "@/lib/auth-tokens"

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/event/transfer/incoming
// Returns all pending transfer requests where the logged-in user is the recipient.
// Uses the denormalized userTransferRequests/{uid}/requests collection —
// O(1) lookup, no collection-group scan needed.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  try {
    const cookieHeader = req.headers.get("cookie") ?? ""
    const match = cookieHeader.match(/spotix_at=([^;]+)/)
    if (!match) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const payload = await verifyAccessToken(match[1], "spotix-booker")
    const userId = payload.uid

    const snap = await adminDb
      .collection("userTransferRequests")
      .doc(userId)
      .collection("requests")
      .where("status", "==", "pending")
      .orderBy("createdAt", "desc")
      .get()

    if (snap.empty) return Response.json({ transfers: [] })

    const transfers = snap.docs.map((doc) => {
      const d = doc.data()
      return {
        id: doc.id,
        transferId: d.transferId ?? doc.id,
        eventId: d.eventId ?? "",
        eventName: d.eventName ?? "",
        organizerUsername: d.organizerUsername ?? "",
        status: d.status ?? "pending",
        createdAt: d.createdAt ?? null,
        // expiresAt is a plain JS Date (not a Firestore Timestamp) since we
        // stored new Date(...) — serialize it to ISO for the client
        expiresAt: d.expiresAt?.toDate
          ? d.expiresAt.toDate().toISOString()
          : d.expiresAt instanceof Date
          ? d.expiresAt.toISOString()
          : d.expiresAt ?? null,
      }
    })

    return Response.json({ transfers })
  } catch (err: any) {
    console.error("[GET /api/event/transfer/incoming]", err)
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }
}