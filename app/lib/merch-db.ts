/**
 * lib/merch-db.ts
 *
 * Supabase query helpers for the "My Store" merch system (booker side —
 * create, list-mine, edit, delete listings; view + update order status).
 * Replaces direct Firestore access that used to live in
 * app/hooks/use-listings.ts, app/lib/listing-utils.ts,
 * app/components/listings/{create-listing-form,edit-listing-modal,listing-card}.tsx
 * and app/listings/manage/orders/[listingId]/page.tsx.
 *
 * See /supabase/schema-merch.sql for table definitions. Order rows
 * themselves are written by whichever service owns buyer-facing checkout
 * (via the record_merch_order() RPC in that schema) — everything in this
 * file is booker-only reads/writes, called from server routes with the
 * service-role client, same as lib/nomination-db.ts and lib/payout-db.ts.
 */

import { supabaseAdmin } from "./supabase"

/** Mirrors the random-id shape Firestore's collection().doc() auto-id used
 *  to produce, so listing/order URLs don't change character. Shared with
 *  genNominationPollId() in lib/nomination-db.ts — duplicated locally so
 *  this file has no cross-feature import. */
function genMerchId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  let id = ""
  for (let i = 0; i < 20; i++) id += chars.charAt(Math.floor(Math.random() * chars.length))
  return id
}

// ─── Listings ───────────────────────────────────────────────────────────────

export interface MerchListing {
  id: string
  bookerId: string
  productName: string
  description: string
  price: number
  images: string[]
  /** Units available. Decremented by a webhook on purchase (not this file). */
  quantity: number
  /** ISO date string, or null if the booker didn't set one. */
  startDate: string | null
  /** ISO date string, or null if the booker didn't set one. */
  endDate: string | null
  totalAmount: number
  totalSold: number
  /** Manual on/off switch — defaults to "active"; the booker can flip it
   *  to "inactive" any time from the manage page to stop selling. */
  status: "active" | "inactive"
  /** Who pays the 5% Spotix platform fee and the Paystack processing fee
   *  on this listing's sales — set at creation, editable any time from
   *  Manage Listings. Defaults to the buyer bearing both. Mirrors
   *  utils/priceUtility.ts's FeeBurden on the spotix-user side, minus
   *  paystackFeeAbsorbedBy (admin-only there; always "organizer" here —
   *  a booker can absorb the Paystack fee themselves, but can't shift it
   *  onto Spotix's own books). */
  feeBurden: { coversSpotixFee: boolean; coversPaystackFee: boolean }
  createdAt: string
}

const LISTING_COLUMNS =
  "id, booker_id, product_name, description, price, images, quantity, start_date, end_date, total_amount, total_sold, status, fee_burden, created_at"

const DEFAULT_FEE_BURDEN = { coversSpotixFee: false, coversPaystackFee: false }

function mapListingRow(row: any): MerchListing {
  return {
    id: row.id,
    bookerId: row.booker_id,
    productName: row.product_name ?? "",
    description: row.description ?? "",
    price: Number(row.price ?? 0),
    images: row.images ?? [],
    quantity: Number(row.quantity ?? 0),
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
    totalAmount: Number(row.total_amount ?? 0),
    totalSold: row.total_sold ?? 0,
    status: (row.status as "active" | "inactive") ?? "active",
    feeBurden:
      row.fee_burden && typeof row.fee_burden === "object"
        ? {
            coversSpotixFee: row.fee_burden.coversSpotixFee === true,
            coversPaystackFee: row.fee_burden.coversPaystackFee === true,
          }
        : DEFAULT_FEE_BURDEN,
    createdAt: row.created_at ?? "",
  }
}

export async function createMerchListing(params: {
  bookerId: string
  productName: string
  description: string
  price: number
  images: string[]
  quantity: number
  startDate?: string | null
  endDate?: string | null
  feeBurden?: { coversSpotixFee: boolean; coversPaystackFee: boolean }
}): Promise<MerchListing> {
  const id = genMerchId()
  const { data, error } = await supabaseAdmin
    .from("merch_listings")
    .insert({
      id,
      booker_id: params.bookerId,
      product_name: params.productName,
      description: params.description,
      price: params.price,
      images: params.images,
      quantity: params.quantity,
      start_date: params.startDate ?? null,
      end_date: params.endDate ?? null,
      fee_burden: params.feeBurden ?? DEFAULT_FEE_BURDEN,
      // status intentionally omitted — the column default ("active")
      // covers every new listing.
    })
    .select(LISTING_COLUMNS)
    .single()

  if (error) throw error
  return mapListingRow(data)
}

export async function listMerchListingsByBooker(bookerId: string): Promise<MerchListing[]> {
  const { data, error } = await supabaseAdmin
    .from("merch_listings")
    .select(LISTING_COLUMNS)
    .eq("booker_id", bookerId)
    .order("created_at", { ascending: false })

  if (error) throw error
  return (data ?? []).map(mapListingRow)
}

/** Owner-scoped fetch — includes bookerId so routes can do their own
 *  "is this actually your listing?" check, same pattern as
 *  getNominationPollById() in lib/nomination-db.ts. */
export async function getMerchListingById(listingId: string): Promise<MerchListing | null> {
  const { data, error } = await supabaseAdmin
    .from("merch_listings")
    .select(LISTING_COLUMNS)
    .eq("id", listingId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  return mapListingRow(data)
}

export async function updateMerchListing(
  listingId: string,
  updates: Partial<{
    productName: string
    description: string
    price: number
    images: string[]
    quantity: number
    startDate: string | null
    endDate: string | null
    status: "active" | "inactive"
    feeBurden: { coversSpotixFee: boolean; coversPaystackFee: boolean }
  }>
): Promise<MerchListing> {
  const row: Record<string, any> = {}
  if (updates.productName !== undefined) row.product_name = updates.productName
  if (updates.description !== undefined) row.description = updates.description
  if (updates.price !== undefined) row.price = updates.price
  if (updates.images !== undefined) row.images = updates.images
  if (updates.quantity !== undefined) row.quantity = updates.quantity
  if (updates.startDate !== undefined) row.start_date = updates.startDate
  if (updates.endDate !== undefined) row.end_date = updates.endDate
  if (updates.status !== undefined) row.status = updates.status
  if (updates.feeBurden !== undefined) row.fee_burden = updates.feeBurden

  const { data, error } = await supabaseAdmin
    .from("merch_listings")
    .update(row)
    .eq("id", listingId)
    .select(LISTING_COLUMNS)
    .single()

  if (error) throw error
  return mapListingRow(data)
}

export async function deleteMerchListing(listingId: string): Promise<void> {
  // Orders cascade via the FK's `on delete cascade` (see schema-merch.sql).
  const { error } = await supabaseAdmin.from("merch_listings").delete().eq("id", listingId)
  if (error) throw error
}

// ─── Orders ─────────────────────────────────────────────────────────────────

export interface MerchOrder {
  id: string
  listingId: string
  buyerUserId: string | null
  fullName: string
  username: string | null
  email: string
  phoneNumber: string
  address: string
  qty: number
  amountPaid: number
  status: "Processing" | "Shipped" | "Delivered"
  orderDate: string
}

const ORDER_COLUMNS =
  "id, listing_id, buyer_user_id, full_name, username, email, phone_number, address, qty, amount_paid, status, order_date"

function mapOrderRow(row: any): MerchOrder {
  return {
    id: row.id,
    listingId: row.listing_id,
    buyerUserId: row.buyer_user_id ?? null,
    fullName: row.full_name ?? "",
    username: row.username ?? null,
    email: row.email ?? "",
    phoneNumber: row.phone_number ?? "",
    address: row.address ?? "",
    qty: row.qty ?? 0,
    amountPaid: Number(row.amount_paid ?? 0),
    status: (row.status as "Processing" | "Shipped" | "Delivered") ?? "Processing",
    orderDate: row.order_date ?? "",
  }
}

export async function listMerchOrdersForListing(listingId: string): Promise<MerchOrder[]> {
  const { data, error } = await supabaseAdmin
    .from("merch_orders")
    .select(ORDER_COLUMNS)
    .eq("listing_id", listingId)
    .order("order_date", { ascending: false })

  if (error) throw error
  return (data ?? []).map(mapOrderRow)
}

/** Ownership is enforced by checking booker_id on the row, so a booker
 *  can't guess another booker's order id and flip its status. */
export async function getMerchOrderById(orderId: string): Promise<(MerchOrder & { bookerId: string }) | null> {
  const { data, error } = await supabaseAdmin
    .from("merch_orders")
    .select(`${ORDER_COLUMNS}, booker_id`)
    .eq("id", orderId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  return { ...mapOrderRow(data), bookerId: data.booker_id }
}

export async function updateMerchOrderStatus(
  orderId: string,
  status: "Processing" | "Shipped" | "Delivered"
): Promise<MerchOrder> {
  const { data, error } = await supabaseAdmin
    .from("merch_orders")
    .update({ status })
    .eq("id", orderId)
    .select(ORDER_COLUMNS)
    .single()

  if (error) throw error
  return mapOrderRow(data)
}
