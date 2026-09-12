/**
 * lib/merch-auth.ts
 *
 * Shared session + ownership check for every /api/listings* route, same
 * spotix_at cookie + verifyAccessToken("spotix-booker") pattern as
 * lib/election-auth.ts.
 */

import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyAccessToken } from "@/lib/auth-tokens"
import { getMerchListingById, type MerchListing } from "@/lib/merch-db"

export async function authenticateMerchRequest(): Promise<{ userId: string; isBooker: boolean } | NextResponse> {
  const cookieStore = await cookies()
  const token = cookieStore.get("spotix_at")?.value
  if (!token) return NextResponse.json({ success: false, error: "No access token" }, { status: 401 })
  try {
    const payload = await verifyAccessToken(token, "spotix-booker")
    return { userId: payload.uid, isBooker: payload.isBooker }
  } catch {
    return NextResponse.json({ success: false, error: "Invalid or expired access token" }, { status: 401 })
  }
}

/**
 * Combined auth + ownership check reused by every /api/listings/{id}/*
 * sub-route. Returns the listing row itself so callers don't have to
 * re-fetch it. A listing that isn't yours 404s rather than 403s, so this
 * never leaks whether a listing id that isn't yours exists.
 */
export async function requireListingOwner(
  listingId: string
): Promise<{ userId: string; listing: MerchListing } | NextResponse> {
  const auth = await authenticateMerchRequest()
  if (auth instanceof NextResponse) return auth

  const listing = await getMerchListingById(listingId)
  if (!listing || listing.bookerId !== auth.userId) {
    return NextResponse.json({ success: false, error: "Listing not found" }, { status: 404 })
  }
  return { userId: auth.userId, listing }
}
