/**
 * app/api/listings/[listingId]/route.ts
 *
 * GET    /api/listings/[listingId]  → Fetch one listing (owner-only)
 * PATCH  /api/listings/[listingId]  → Update a listing's details/images
 * DELETE /api/listings/[listingId]  → Delete a listing (orders cascade —
 *                                     see /supabase/schema-merch.sql)
 *
 * Note: this route only touches the Supabase row. Deleting the listing's
 * images from Supabase Storage is still done client-side first (see
 * lib/listing-utils.ts and lib/listing-image-uploader.ts).
 */

import { NextRequest, NextResponse } from "next/server"
import { requireListingOwner } from "@/lib/merch-auth"
import { updateMerchListing, deleteMerchListing } from "@/lib/merch-db"

const MAX_IMAGES = 6

function ok(data: object, status = 200) {
  return NextResponse.json({ success: true, ...data }, { status })
}
function fail(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status })
}

type Params = { params: Promise<{ listingId: string }> }

// ─── GET ─────────────────────────────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: Params) {
  const { listingId } = await params
  const auth = await requireListingOwner(listingId)
  if (auth instanceof NextResponse) return auth
  return ok({ listing: auth.listing })
}

// ─── PATCH ───────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: Params) {
  const { listingId } = await params
  const auth = await requireListingOwner(listingId)
  if (auth instanceof NextResponse) return auth

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return fail("Invalid JSON body", 400)
  }

  const updates: Parameters<typeof updateMerchListing>[1] = {}

  if (body.productName !== undefined) {
    const productName = String(body.productName).trim()
    if (!productName) return fail("Product name is required", 400)
    updates.productName = productName
  }
  if (body.description !== undefined) {
    const description = String(body.description).trim()
    if (!description) return fail("Description is required", 400)
    updates.description = description
  }
  if (body.price !== undefined) {
    const price = Number.parseFloat(body.price)
    if (!Number.isFinite(price) || price <= 0) return fail("Valid price is required", 400)
    updates.price = price
  }
  if (body.images !== undefined) {
    const images = Array.isArray(body.images) ? body.images.filter((u: any) => typeof u === "string" && u) : []
    if (images.length === 0) return fail("At least 1 image is required", 400)
    if (images.length > MAX_IMAGES) return fail(`Maximum ${MAX_IMAGES} images allowed`, 400)
    updates.images = images
  }
  if (body.quantity !== undefined) {
    const quantity = Number.parseInt(body.quantity, 10)
    if (!Number.isFinite(quantity) || quantity < 0) return fail("Valid quantity is required", 400)
    updates.quantity = quantity
  }
  if (body.startDate !== undefined) updates.startDate = body.startDate ? String(body.startDate) : null
  if (body.endDate !== undefined) updates.endDate = body.endDate ? String(body.endDate) : null
  if (updates.startDate && updates.endDate && new Date(updates.endDate) < new Date(updates.startDate)) {
    return fail("End date must be on or after the start date", 400)
  }
  if (body.status !== undefined) {
    // "active" — on sale. "inactive" — the booker paused sales; set any
    // time from the manage page. Every new listing starts "active".
    if (body.status !== "active" && body.status !== "inactive") return fail("Invalid status", 400)
    updates.status = body.status
  }
  if (body.feeBurden !== undefined) {
    // Who pays the 5% Spotix fee + the Paystack fee — editable any time.
    if (
      typeof body.feeBurden !== "object" ||
      body.feeBurden === null ||
      typeof body.feeBurden.coversSpotixFee !== "boolean" ||
      typeof body.feeBurden.coversPaystackFee !== "boolean"
    ) {
      return fail("feeBurden must be an object with coversSpotixFee and coversPaystackFee booleans", 400)
    }
    updates.feeBurden = {
      coversSpotixFee: body.feeBurden.coversSpotixFee,
      coversPaystackFee: body.feeBurden.coversPaystackFee,
    }
  }

  try {
    const listing = await updateMerchListing(listingId, updates)
    return ok({ listing })
  } catch (err) {
    console.error("[PATCH /api/listings/:id]", err)
    return fail("Failed to update listing", 500)
  }
}

// ─── DELETE ──────────────────────────────────────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { listingId } = await params
  const auth = await requireListingOwner(listingId)
  if (auth instanceof NextResponse) return auth

  try {
    await deleteMerchListing(listingId)
    return ok({ deleted: true })
  } catch (err) {
    console.error("[DELETE /api/listings/:id]", err)
    return fail("Failed to delete listing", 500)
  }
}
