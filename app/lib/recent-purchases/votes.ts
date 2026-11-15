/**
 * lib/recent-purchases/votes.ts
 *
 * Paid poll votes for the Recent Purchases card — see
 * spotix-vote/src/app/api/v1/vote/payref/route.ts for how the Reference
 * doc is created (transactionType: "voting_purchase", creatorId ==
 * the poll's owner) and spotix-backend's webhook.js for how it's later
 * marked "successful".
 */

import { adminDb } from "@/lib/firebase-admin"
import type { RecentPurchase } from "./types"

const FETCH_LIMIT = 25

export async function fetchVotePurchases(userId: string): Promise<RecentPurchase[]> {
  const snap = await adminDb
    .collection("Reference")
    .where("creatorId", "==", userId)
    .where("status", "==", "successful")
    .where("transactionType", "==", "voting_purchase")
    .limit(FETCH_LIMIT)
    .get()

  return snap.docs.map((doc) => {
    const d = doc.data()
    const buyerName = d.payerName || d.guestName || "Someone"
    const qty = d.voteCount || 0
    const pollName = d.pollName || "a poll"

    return {
      id: doc.id,
      kind: "vote",
      buyerName,
      quantity: qty,
      itemLabel: pollName,
      subLabel: d.contestantName || undefined,
      message: `${buyerName} just casted ${qty} vote${qty === 1 ? "" : "s"} in ${pollName}`,
      occurredAt: d.paymentCompletedAt || d.updatedAt || d.createdAt || new Date(0).toISOString(),
      amount: d.totalAmount || 0,
    }
  })
}
