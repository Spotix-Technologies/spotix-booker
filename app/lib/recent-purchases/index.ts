/**
 * lib/recent-purchases/index.ts
 *
 * Main process for the "Recent Purchases" dashboard card. Fetches all
 * four purchase kinds in parallel from their own modular source file,
 * merges them into one feed, and returns the 6 most recent overall —
 * regardless of kind.
 *
 *   tickets.ts   -> ticket_purchase (event ticket sales)
 *   merch.ts     -> merch_purchase
 *   votes.ts     -> voting_purchase (paid poll votes)
 *   elections.ts -> election_form_purchase (candidate form fees)
 *
 * Each source module is independently fault-tolerant here — one failing
 * (e.g. a transient Supabase hiccup in elections.ts) degrades that one
 * source to an empty list rather than failing the whole card.
 */

import { fetchTicketPurchases } from "./tickets"
import { fetchMerchPurchases } from "./merch"
import { fetchVotePurchases } from "./votes"
import { fetchElectionPurchases } from "./elections"
import type { RecentPurchase } from "./types"

export type { RecentPurchase, PurchaseKind } from "./types"

const RESULT_LIMIT = 6

function safely(label: string, fn: () => Promise<RecentPurchase[]>): Promise<RecentPurchase[]> {
  return fn().catch((err) => {
    console.error(`[recent-purchases] ${label} source failed:`, err)
    return []
  })
}

export async function getRecentPurchases(userId: string): Promise<RecentPurchase[]> {
  const [tickets, merch, votes, elections] = await Promise.all([
    safely("tickets", () => fetchTicketPurchases(userId)),
    safely("merch", () => fetchMerchPurchases(userId)),
    safely("votes", () => fetchVotePurchases(userId)),
    safely("elections", () => fetchElectionPurchases(userId)),
  ])

  return [...tickets, ...merch, ...votes, ...elections]
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, RESULT_LIMIT)
}
