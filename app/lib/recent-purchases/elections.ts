/**
 * lib/recent-purchases/elections.ts
 *
 * Election candidate form-fee purchases for the Recent Purchases card —
 * see spotix-vote/src/app/api/v1/election/ref/route.ts for how the
 * Reference doc is created (transactionType: "election_form_purchase")
 * and spotix-backend's webhook.js for how it's later marked "successful".
 *
 * NOTE: this is a candidate paying to run for an office, not a voter
 * casting a ballot — election voting (see spotix-vote's
 * api/v1/election/vote/route.ts) is free and never creates a Reference
 * doc, so there's nothing to show here for it. The copy below reflects
 * what's actually paid for; if you wanted "cast a vote" copy specifically,
 * there's no purchase event backing that today.
 *
 * Unlike tickets/merch/votes, the Reference doc for this type carries no
 * creatorId/organizerId field directly — only electionId. Ownership is
 * resolved first via the elections table (Supabase, organizer_id ==
 * userId — see lib/election-db.ts), then the Reference collection is
 * queried with `electionId in [...]`, chunked to 10 ids per query (the
 * historical Firestore `in` cap).
 */

import { adminDb } from "@/lib/firebase-admin"
import { listElectionsForOrganizer } from "@/lib/election-db"
import type { RecentPurchase } from "./types"

const FETCH_LIMIT = 25
const CHUNK_SIZE = 10

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export async function fetchElectionPurchases(userId: string): Promise<RecentPurchase[]> {
  const elections = await listElectionsForOrganizer(userId).catch((err) => {
    console.error("[recent-purchases/elections] failed to list owned elections:", err)
    return []
  })
  const electionIds: string[] = elections.map((e: any) => e.id).filter(Boolean)
  if (electionIds.length === 0) return []

  const idChunks = chunk(electionIds, CHUNK_SIZE)
  const snaps = await Promise.all(
    idChunks.map((ids) =>
      adminDb
        .collection("Reference")
        .where("electionId", "in", ids)
        .where("status", "==", "successful")
        .where("transactionType", "==", "election_form_purchase")
        .limit(FETCH_LIMIT)
        .get()
    )
  )

  const purchases: RecentPurchase[] = []
  for (const snap of snaps) {
    for (const doc of snap.docs) {
      const d = doc.data()
      const buyerName = d.fullName || d.email || "Someone"
      const officeName = d.officeName || "an office"
      const electionName = d.electionName || "an election"

      purchases.push({
        id: doc.id,
        kind: "election",
        buyerName,
        quantity: 1,
        itemLabel: electionName,
        subLabel: officeName,
        message: `${buyerName} just paid the form fee for ${officeName} in ${electionName}`,
        occurredAt: d.paymentCompletedAt || d.updatedAt || d.createdAt || new Date(0).toISOString(),
        amount: d.totalAmount || 0,
      })
    }
  }
  return purchases
}
