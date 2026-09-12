/**
 * app/api/listings/route.ts
 *
 * POST /api/listings  → Create a new merch listing
 * GET  /api/listings  → List merch listings owned by the caller
 *
 * Data source: Supabase (merch_listings table). See lib/merch-db.ts and
 * /supabase/schema-merch.sql. Replaces direct Firestore access from
 * create-listing-form.tsx and hooks/use-listings.ts.
 */

import { NextRequest, NextResponse } from "next/server"
import { authenticateMerchRequest } from "@/lib/merch-auth"
import { createMerchListing, listMerchListingsByBooker } from "@/lib/merch-db"

const MAX_IMAGES = 6

function ok(data: object, status = 200) {
  return NextResponse.json({ success: true, ...data }, { status })
}
function fail(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status })
}

// ─── POST ────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await authenticateMerchRequest()
  if (auth instanceof NextResponse) return auth
  const { userId, isBooker } = auth
  if (!isBooker) return fail("Only booker accounts can create listings", 403)

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return fail("Invalid JSON body", 400)
  }

  const productName = String(body?.productName ?? "").trim()
  const description = String(body?.description ?? "").trim()
  const price = Number.parseFloat(body?.price)
  const images = Array.isArray(body?.images) ? body.images.filter((u: any) => typeof u === "string" && u) : []
  const quantity = Number.parseInt(body?.quantity, 10)
  const startDate = body?.startDate ? String(body.startDate) : null
  const endDate = body?.endDate ? String(body.endDate) : null

  // Who pays the 5% Spotix fee + the Paystack fee on this listing's sales.
  // Defaults to the buyer bearing both when omitted.
  let feeBurden = { coversSpotixFee: false, coversPaystackFee: false }
  if (body?.feeBurden !== undefined) {
    if (
      typeof body.feeBurden !== "object" ||
      body.feeBurden === null ||
      typeof body.feeBurden.coversSpotixFee !== "boolean" ||
      typeof body.feeBurden.coversPaystackFee !== "boolean"
    ) {
      return fail("feeBurden must be an object with coversSpotixFee and coversPaystackFee booleans", 400)
    }
    feeBurden = {
      coversSpotixFee: body.feeBurden.coversSpotixFee,
      coversPaystackFee: body.feeBurden.coversPaystackFee,
    }
  }

  if (!productName) return fail("Product name is required", 400)
  if (!description) return fail("Description is required", 400)
  if (!Number.isFinite(price) || price <= 0) return fail("Valid price is required", 400)
  if (images.length === 0) return fail("At least 1 image is required", 400)
  if (images.length > MAX_IMAGES) return fail(`Maximum ${MAX_IMAGES} images allowed`, 400)
  if (!Number.isFinite(quantity) || quantity < 0) return fail("Valid quantity is required", 400)
  if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
    return fail("End date must be on or after the start date", 400)
  }

  try {
    const listing = await createMerchListing({
      bookerId: userId,
      productName,
      description,
      price,
      images,
      quantity,
      startDate,
      endDate,
      feeBurden,
    })
    return ok({ listing }, 201)
  } catch (err) {
    console.error("[POST /api/listings]", err)
    return fail("Failed to create listing", 500)
  }
}

// ─── GET ─────────────────────────────────────────────────────────────────────
export async function GET() {
  const auth = await authenticateMerchRequest()
  if (auth instanceof NextResponse) return auth

  try {
    const listings = await listMerchListingsByBooker(auth.userId)
    return ok({ listings })
  } catch (err) {
    console.error("[GET /api/listings]", err)
    return fail("Failed to load listings", 500)
  }
}
