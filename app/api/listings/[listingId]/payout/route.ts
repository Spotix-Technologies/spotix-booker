/**
 * app/api/listings/[listingId]/payout/route.ts
 *
 * Merch listing payouts — the fourth product type alongside events,
 * polls, and elections. Same Supabase `payouts` table + Fastify
 * processing pipeline (lib/payout-db.ts / lib/payout-backend.ts /
 * lib/payout-firestore.ts, all extended with is_merch/merch_id in this
 * same changeset) and the same shape as the election route, which is
 * the closest precedent: no collaborator system, owner-only, no Vault.
 *
 * Daily sales aggregation comes from admin/merch/{listingId}/{date} in
 * Firestore, written by spotix-backend's updateDailyMerchSales() on
 * every successful merch order — see v1/lib/merch/admin-merch-sales.js.
 * That doc uses `lastUpdated`/`merchSales`/`unitsSold`/`orderCount`
 * (not events' `updatedAt`/`ticketSales`/`ticketCount`), so the 30-hour
 * lock below reads `lastUpdated`.
 *
 * GET  ?action=list    → daily sales aggregation (Firestore)
 * GET  ?action=status  → payout history (Supabase)
 * POST                 → initiate a payout for a given date
 */

import { NextRequest, NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"
import { authenticateMerchRequest } from "@/lib/merch-auth"
import { resolveMerchPayoutAccess } from "@/lib/merch-payout-access"
import { createInitializingPayout, getPayoutsForMerch, hasActiveOrSuccessfulPayout } from "@/lib/payout-db"
import { writePayoutReferenceOnDateDoc } from "@/lib/payout-firestore"
import { triggerPayoutProcessing } from "@/lib/payout-backend"
import { requirePayoutAccessKey } from "@/lib/payout-access-gate"
import { claimIdempotencyKey, DuplicateRequestError } from "@/lib/payout-idempotency"

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

function ok(data: object, status = 200) {
  return NextResponse.json({ success: true, ...data }, { status })
}
function fail(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status })
}

type Params = { params: Promise<{ listingId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const gate = requirePayoutAccessKey(req)
  if (gate) return gate

  const auth = await authenticateMerchRequest()
  if (auth instanceof NextResponse) return auth
  const { listingId } = await params

  const access = await resolveMerchPayoutAccess(listingId, auth.userId)
  if (!access.ok) return fail(access.error, access.status)

  const { searchParams } = new URL(req.url)
  const action = searchParams.get("action") ?? "list"

  if (action === "list") {
    try {
      const snapshot = await adminDb.collection("admin").doc("merch").collection(listingId).get()
      if (snapshot.empty) return ok({ transactions: [] })
      const transactions = snapshot.docs
        .map((doc) => ({ date: doc.id, ...doc.data() }))
        .sort((a, b) => (a.date as string).localeCompare(b.date as string))
      return ok({ transactions })
    } catch (error: any) {
      console.error("[GET /api/listings/[id]/payout?action=list] error:", error.message)
      return fail("Internal Server Error", 500)
    }
  }

  if (action === "status") {
    try {
      const rows = await getPayoutsForMerch(listingId)
      const payouts = rows.map((r) => ({
        id: r.reference,
        reference: r.reference,
        merchId: r.merch_id,
        date: r.pay_date,
        amount: r.amount,
        bankName: r.bank_name,
        accountNumber: r.account_number,
        accountName: r.account_name,
        status: r.status,
        failureReason: r.failure_reason,
        narration: r.narration,
        durationSeconds: r.duration_seconds,
        createdAt: r.created_at,
        resolvedAt: r.resolved_at,
      }))
      return ok({ payouts, scope: "merch" })
    } catch (error: any) {
      console.error("[GET /api/listings/[id]/payout?action=status] error:", error.message)
      return fail("Internal Server Error", 500)
    }
  }

  return fail("Invalid action. Use list or status.", 400)
}

export async function POST(req: NextRequest, { params }: Params) {
  const gate = requirePayoutAccessKey(req)
  if (gate) return gate

  const auth = await authenticateMerchRequest()
  if (auth instanceof NextResponse) return auth
  const { listingId } = await params

  const idempotencyKey = req.headers.get("idempotency-key")
  if (!idempotencyKey?.trim()) return fail("Idempotency-Key header is required", 400)
  try {
    await claimIdempotencyKey(idempotencyKey, auth.userId)
  } catch (err) {
    if (err instanceof DuplicateRequestError) return fail(err.message, 409)
    return fail("Could not verify request uniqueness. Please try again.", 500)
  }

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return fail("Invalid JSON body", 400)
  }

  const { date, amount, methodId: requestedMethodId } = body
  if (!date?.trim()) return fail("date is required", 400)
  if (typeof amount !== "number" || amount <= 0) return fail("amount must be a positive number", 400)

  const access = await resolveMerchPayoutAccess(listingId, auth.userId)
  if (!access.ok) return fail(access.error, access.status)

  if (access.listing.flagged === true) {
    const reason = access.listing.flaggedReason ? ` Reason: ${access.listing.flaggedReason}` : ""
    return fail(
      `This listing has been flagged and payouts are on hold. Please contact customer support with your listing ID for more information.${reason}`,
      403
    )
  }

  const globalSnap = await adminDb.collection("admin").doc("global").get()
  if (globalSnap.exists && globalSnap.data()!.isPayoutAllowed === false) {
    const reason = globalSnap.data()!.isPayoutNotAllowedReason ? ` Reason: ${globalSnap.data()!.isPayoutNotAllowedReason}` : ""
    return fail(`We are currently not processing payouts, check back later.${reason}`, 503)
  }

  // ── The 30-hour rule — same shape as events/polls/elections, against
  // this listing's own daily aggregation doc.
  const salesDocRef = adminDb.collection("admin").doc("merch").collection(listingId).doc(date)
  const salesDoc = await salesDocRef.get()
  if (!salesDoc.exists) return fail("Transaction date record not found", 404)
  const salesData = salesDoc.data()!

  const lastUpdated = salesData.lastUpdated ? new Date(salesData.lastUpdated) : new Date(`${date}T00:00:00`)
  const diffHours = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60)
  if (diffHours < 30) {
    const remainingMs = lastUpdated.getTime() + 30 * 60 * 60 * 1000 - Date.now()
    const h = Math.floor(remainingMs / (1000 * 60 * 60))
    const m = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60))
    return fail(`Withdrawal not yet available. Available in ${h}h ${m}m (30 hours after last order).`, 403)
  }

  // ── Restricted date / day — platform-wide switches, same collections
  // the event payout route checks.
  const restrictedDateSnap = await adminDb.collection("admin").doc("global").collection("restrictedDate").doc(date).get()
  if (restrictedDateSnap.exists && restrictedDateSnap.data()!.isRestricted === true) {
    const reason = restrictedDateSnap.data()!.reason ?? `Payouts for ${date} are currently restricted. Please try again later.`
    return fail(reason, 403)
  }

  const txnDayOfWeek = DAYS[new Date(`${date}T12:00:00`).getDay()]
  const todayDayOfWeek = DAYS[new Date().getDay()]
  if (txnDayOfWeek === todayDayOfWeek) {
    const restrictedDaySnap = await adminDb.collection("admin").doc("global").collection("restrictedDays").doc(txnDayOfWeek).get()
    if (restrictedDaySnap.exists && restrictedDaySnap.data()!.isRestricted === true) {
      const reason =
        restrictedDaySnap.data()!.reason ?? `Payouts for transactions on ${txnDayOfWeek}s are currently restricted. Please try again later.`
      return fail(reason, 403)
    }
  }

  // ── Payout method — a booker's own methods, same as the profile-level
  // /api/payout/method list (listings have no collaborator concept, so
  // there's no "settle to the Creator's methods" branch to resolve here).
  let methodDoc: FirebaseFirestore.DocumentSnapshot | null = null
  if (requestedMethodId?.trim()) {
    const specificSnap = await adminDb.collection("payoutMethods").doc(auth.userId).collection("methods").doc(requestedMethodId.trim()).get()
    if (specificSnap.exists) methodDoc = specificSnap
  }
  if (!methodDoc) {
    const primarySnap = await adminDb
      .collection("payoutMethods")
      .doc(auth.userId)
      .collection("methods")
      .where("primary", "==", true)
      .limit(1)
      .get()
    if (!primarySnap.empty) methodDoc = primarySnap.docs[0]
  }
  if (!methodDoc) return fail("No payout method found. Please add a bank account first.", 400)

  const primaryMethod = methodDoc.data()!
  const methodId = methodDoc.id

  const alreadyActive = await hasActiveOrSuccessfulPayout({ merchId: listingId }, date)
  if (alreadyActive) return fail("A payout request for this date has already been submitted.", 409)

  try {
    const row = await createInitializingPayout({
      isEvent: false,
      isPoll: false,
      isElection: false,
      isMerch: true,
      merchId: listingId,
      merchName: access.listing.productName,
      payDate: date,
      userId: auth.userId,
      amount,
      method: {
        methodId,
        bankName: primaryMethod.bankName ?? "",
        bankCode: primaryMethod.bankCode ?? "",
        accountNumber: primaryMethod.accountNumber ?? "",
        accountName: primaryMethod.accountName ?? "",
        recipientCode: primaryMethod.recipientCode ?? null,
      },
      vaultLocked: false,
    })

    await writePayoutReferenceOnDateDoc({ merchId: listingId }, date, row.reference)
    triggerPayoutProcessing(row.reference)

    return ok({ message: "Payout request submitted successfully", reference: row.reference })
  } catch (err: any) {
    if (err instanceof DuplicateRequestError) return fail(err.message, 409)
    console.error("[POST /api/listings/[id]/payout] write error:", err)
    return fail("Failed to submit payout request", 500)
  }
}
