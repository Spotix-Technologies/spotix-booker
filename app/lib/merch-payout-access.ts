/**
 * lib/merch-payout-access.ts
 *
 * Ownership check for merch listing payouts — same shape as
 * lib/election-payout-access.ts. Listings don't have a collaborator
 * system (no equivalent of `collaborations` for merch), so this is a
 * straight owner check, reusing getMerchListingById() rather than
 * duplicating the Supabase query.
 */

import { getMerchListingById, type MerchListing } from "@/lib/merch-db"

export type MerchPayoutAccessResult =
  | { ok: true; bookerId: string; listing: MerchListing }
  | { ok: false; error: string; status: number }

export async function resolveMerchPayoutAccess(listingId: string, userId: string): Promise<MerchPayoutAccessResult> {
  const listing = await getMerchListingById(listingId)
  // 404, not 403 — never confirms a listing id that isn't yours exists,
  // same convention as requireListingOwner() in lib/merch-auth.ts.
  if (!listing || listing.bookerId !== userId) {
    return { ok: false, error: "Listing not found", status: 404 }
  }
  return { ok: true, bookerId: userId, listing }
}
