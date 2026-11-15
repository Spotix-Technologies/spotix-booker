/**
 * lib/recent-purchases/tickets.ts
 *
 * Ticket ("event") purchases for the Recent Purchases card. Reads the same
 * `Reference` collection spotix-user's create-pay-ref route writes to and
 * spotix-backend's webhook (ticket_purchase branch) later stamps
 * status: "successful" / paymentCompletedAt onto — see v1/webhook.js.
 *
 * Equality-only query (eventCreatorId + status + transactionType, no
 * orderBy) — Firestore doesn't need a composite index for that, so this
 * works without any index changes. Sorting/slicing to the newest 6 happens
 * once everything is merged in index.ts.
 */

import { adminDb } from "@/lib/firebase-admin"
import type { RecentPurchase } from "./types"

// Pulled per-source, ahead of the final merge-and-slice-to-6 in index.ts —
// a booker could have 6 newer merch sales than ticket sales, so each
// source needs its own small buffer, not just "6".
const FETCH_LIMIT = 25

export async function fetchTicketPurchases(userId: string): Promise<RecentPurchase[]> {
  const snap = await adminDb
    .collection("Reference")
    .where("eventCreatorId", "==", userId)
    .where("status", "==", "successful")
    .where("transactionType", "==", "ticket_purchase")
    .limit(FETCH_LIMIT)
    .get()

  return snap.docs.map((doc) => {
    const d = doc.data()
    const buyerName = d.userFullName || d.userEmail || "Someone"
    const qty = d.totalTicketCount || 0
    const type = d.ticketType || "General"
    const eventName = d.eventName || "an event"

    return {
      id: doc.id,
      kind: "ticket",
      buyerName,
      quantity: qty,
      itemLabel: eventName,
      subLabel: type,
      message: `${buyerName} just copped ${qty} ${type} ticket${qty === 1 ? "" : "s"} to ${eventName}`,
      occurredAt: d.paymentCompletedAt || d.updatedAt || d.createdAt || new Date(0).toISOString(),
      amount: d.totalAmount || 0,
    }
  })
}
