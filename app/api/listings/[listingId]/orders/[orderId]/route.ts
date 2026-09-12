/**
 * app/api/listings/[listingId]/orders/[orderId]/route.ts
 *
 * PATCH /api/listings/[listingId]/orders/[orderId] → Update an order's
 * fulfillment status (Processing / Shipped / Delivered). Replaces the
 * updateOrderStatus() Firestore updateDoc() call in
 * app/listings/manage/orders/[listingId]/page.tsx.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireListingOwner } from "@/lib/merch-auth"
import { getMerchOrderById, updateMerchOrderStatus } from "@/lib/merch-db"

const VALID_STATUSES = ["Processing", "Shipped", "Delivered"] as const

function ok(data: object, status = 200) {
  return NextResponse.json({ success: true, ...data }, { status })
}
function fail(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status })
}

type Params = { params: Promise<{ listingId: string; orderId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const { listingId, orderId } = await params
  const auth = await requireListingOwner(listingId)
  if (auth instanceof NextResponse) return auth

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return fail("Invalid JSON body", 400)
  }

  const status = body?.status
  if (!VALID_STATUSES.includes(status)) return fail("Invalid status", 400)

  // Ownership is already established via the listing (requireListingOwner),
  // but confirm the order actually belongs to THIS listing before touching
  // it — same 404-not-403 treatment as a listing that isn't yours.
  const order = await getMerchOrderById(orderId)
  if (!order || order.listingId !== listingId || order.bookerId !== auth.userId) {
    return fail("Order not found", 404)
  }

  try {
    const updated = await updateMerchOrderStatus(orderId, status)
    return ok({ order: updated })
  } catch (err) {
    console.error("[PATCH /api/listings/:id/orders/:orderId]", err)
    return fail("Failed to update order", 500)
  }
}
