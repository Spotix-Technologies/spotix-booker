/**
 * lib/recent-purchases/types.ts
 *
 * Shared shape every source module (tickets.ts, merch.ts, votes.ts,
 * elections.ts) normalises its Reference docs into, before index.ts
 * merges + sorts them into one feed for the "Recent Purchases" card.
 */

export type PurchaseKind = "ticket" | "merch" | "vote" | "election"

export interface RecentPurchase {
  /** Reference doc id (Firestore doc id from the `Reference` collection) */
  id: string
  kind: PurchaseKind
  buyerName: string
  quantity: number
  /** Event / poll / merch product / election name */
  itemLabel: string
  /** Extra context — ticket type, office name, etc. Optional. */
  subLabel?: string
  /** Fully composed, ready-to-render copy for this purchase. */
  message: string
  /** ISO timestamp — paymentCompletedAt (falls back to updatedAt/createdAt) */
  occurredAt: string
  amount: number
}
