/**
 * lib/recent-purchases/merch.ts
 *
 * Merch purchases for the Recent Purchases card — see
 * spotix-user/src/app/api/v1/create-merch-ref/route.ts for how the
 * Reference doc is created, and spotix-backend's webhook.js
 * (merch_purchase branch) for how it's later marked "successful".
 *
 * A merch order can contain several distinct listings (merchItems[]).
 * The copy focuses on the first line item — same convention as tickets
 * showing a single primaryTicketType — and appends "(+N more item(s))"
 * when the cart had more than one line, so nothing's silently dropped.
 */

import { adminDb } from "@/lib/firebase-admin"
import type { RecentPurchase } from "./types"

const FETCH_LIMIT = 25

interface MerchLine {
  productName?: string
  quantity?: number
}

export async function fetchMerchPurchases(userId: string): Promise<RecentPurchase[]> {
  const snap = await adminDb
    .collection("Reference")
    .where("eventCreatorId", "==", userId)
    .where("status", "==", "successful")
    .where("transactionType", "==", "merch_purchase")
    .limit(FETCH_LIMIT)
    .get()

  return snap.docs.map((doc) => {
    const d = doc.data()
    const items: MerchLine[] = Array.isArray(d.merchItems) ? d.merchItems : []
    const primary = items[0]

    const buyerName = d.userFullName || d.userEmail || "Someone"
    const qty = primary?.quantity ?? d.totalUnitsCount ?? 0
    const productName = primary?.productName || "merch"
    const extraLines = items.length > 1 ? items.length - 1 : 0
    const extra = extraLines > 0 ? ` (+${extraLines} more item${extraLines === 1 ? "" : "s"})` : ""

    return {
      id: doc.id,
      kind: "merch",
      buyerName,
      quantity: qty,
      itemLabel: productName,
      message: `${buyerName} just bought ${qty} of ${productName}${extra}`,
      occurredAt: d.paymentCompletedAt || d.updatedAt || d.createdAt || new Date(0).toISOString(),
      amount: d.totalAmount || 0,
    }
  })
}
