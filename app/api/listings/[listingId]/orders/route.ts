/**
 * app/api/listings/[listingId]/orders/route.ts
 *
 * GET /api/listings/[listingId]/orders → Owner-only order list for one
 * listing, plus the listing itself (so the orders page can render its
 * header/stats card from a single request, matching the old
 * loadListingAndOrders() Firestore call).
 */

import { NextRequest, NextResponse } from "next/server"
import { requireListingOwner } from "@/lib/merch-auth"
import { listMerchOrdersForListing } from "@/lib/merch-db"

function ok(data: object, status = 200) {
  return NextResponse.json({ success: true, ...data }, { status })
}

type Params = { params: Promise<{ listingId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { listingId } = await params
  const auth = await requireListingOwner(listingId)
  if (auth instanceof NextResponse) return auth

  const orders = await listMerchOrdersForListing(listingId)
  return ok({ listing: auth.listing, orders })
}
