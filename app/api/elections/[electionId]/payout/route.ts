/**
 * app/api/elections/[electionId]/payout/route.ts
 *
 * Election-form-fee payouts. Same 30-hour-after-last-purchase rule,
 * same duplicate guard, and same Supabase `payouts` table + Fastify
 * processing pipeline as /api/payout (events/polls) — see
 * lib/payout-db.ts / lib/payout-backend.ts / lib/payout-firestore.ts,
 * all extended with is_election/election_id in this same changeset.
 *
 * Deliberately NOT included in this pass: the Vault multi-signature
 * hold that events support (see the Vault section of /api/payout).
 * Only the election's own organizer can request its payout for now —
 * see lib/election-payout-access.ts for why, and the note on this in
 * the chat write-up if you want that extended later.
 *
 * GET  ?action=list    → daily form-fee aggregation (Firestore, admin/elections/{electionId}/{date})
 * GET  ?action=status  → payout history (Supabase)
 * POST                 → initiate a payout for a given date
 */

import { NextRequest, NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"
import { resolveElectionPayoutAccess } from "@/lib/election-payout-access"
import { createInitializingPayout, getPayoutsForElection, hasActiveOrSuccessfulPayout } from "@/lib/payout-db"
import { writePayoutReferenceOnDateDoc } from "@/lib/payout-firestore"
import { triggerPayoutProcessing } from "@/lib/payout-backend"
import { requirePayoutAccessKey } from "@/lib/payout-access-gate"
import { claimIdempotencyKey, DuplicateRequestError } from "@/lib/payout-idempotency"
import { authenticateElectionRequest } from "@/lib/election-auth"

function ok(data: object, status = 200) {
  return NextResponse.json({ success: true, ...data }, { status })
}
function fail(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ electionId: string }> }) {
  const gate = requirePayoutAccessKey(req)
  if (gate) return gate

  const auth = await authenticateElectionRequest()
  if (auth instanceof NextResponse) return auth
  const { electionId } = await params

  const access = await resolveElectionPayoutAccess(electionId, auth.userId)
  if (!access.ok) return fail(access.error, access.status)

  const { searchParams } = new URL(req.url)
  const action = searchParams.get("action") ?? "list"

  if (action === "list") {
    try {
      const snapshot = await adminDb.collection("admin").doc("elections").collection(electionId).get()
      if (snapshot.empty) return ok({ transactions: [] })
      const transactions = snapshot.docs
        .map((doc) => ({ date: doc.id, ...doc.data() }))
        .sort((a, b) => (a.date as string).localeCompare(b.date as string))
      return ok({ transactions })
    } catch (error: any) {
      console.error("[GET /api/elections/[id]/payout?action=list] error:", error.message)
      return fail("Internal Server Error", 500)
    }
  }

  if (action === "status") {
    try {
      const rows = await getPayoutsForElection(electionId)
      const payouts = rows.map((r) => ({
        id: r.reference,
        reference: r.reference,
        electionId: r.election_id,
        date: r.pay_date,
        amount: r.amount,
        bankName: r.bank_name,
        accountNumber: r.account_number,
        accountName: r.account_name,
        status: r.status,
        failureReason: r.failure_reason,
        narration: r.narration,
        createdAt: r.created_at,
        resolvedAt: r.resolved_at,
      }))
      return ok({ payouts, scope: "election" })
    } catch (error: any) {
      console.error("[GET /api/elections/[id]/payout?action=status] error:", error.message)
      return fail("Internal Server Error", 500)
    }
  }

  return fail("Invalid action. Use list or status.", 400)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ electionId: string }> }) {
  const gate = requirePayoutAccessKey(req)
  if (gate) return gate

  const auth = await authenticateElectionRequest()
  if (auth instanceof NextResponse) return auth
  const { electionId } = await params

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

  const access = await resolveElectionPayoutAccess(electionId, auth.userId)
  if (!access.ok) return fail(access.error, access.status)

  // Suspended elections can't withdraw — see Admin Dashboard's election
  // suspend/unsuspend action (app/lib/election-moderation.ts there).
  // Checked here, not just surfaced as a UI banner, since this is the
  // one place that actually moves money.
  if (access.election?.suspended) {
    return fail(
      "This election has been suspended by Spotix and can't be paid out right now. Contact Spotix support for details.",
      403,
    )
  }

  const globalSnap = await adminDb.collection("admin").doc("global").get()
  if (globalSnap.exists && globalSnap.data()!.isPayoutAllowed === false) {
    const reason = globalSnap.data()!.isPayoutNotAllowedReason ? ` Reason: ${globalSnap.data()!.isPayoutNotAllowedReason}` : ""
    return fail(`We are currently not processing payouts, check back later.${reason}`, 503)
  }

  // ── The 30-hour rule — identical check to events/polls, against this
  // election's own daily aggregation doc (written by spotix-backend's
  // updateDailyElectionFormFees on every successful form-fee payment).
  const salesDocRef = adminDb.collection("admin").doc("elections").collection(electionId).doc(date)
  const salesDoc = await salesDocRef.get()
  if (!salesDoc.exists) return fail("Transaction date record not found", 404)
  const salesData = salesDoc.data()!

  const updatedAt = salesData.updatedAt ? new Date(salesData.updatedAt) : new Date(`${date}T00:00:00`)
  const diffHours = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60)
  if (diffHours < 30) {
    const remainingMs = updatedAt.getTime() + 30 * 60 * 60 * 1000 - Date.now()
    const h = Math.floor(remainingMs / (1000 * 60 * 60))
    const m = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60))
    return fail(`Withdrawal not yet available. Available in ${h}h ${m}m (30 hours after last purchase).`, 403)
  }

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

  const alreadyActive = await hasActiveOrSuccessfulPayout({ electionId }, date)
  if (alreadyActive) return fail("A payout request for this date has already been submitted.", 409)

  try {
    const row = await createInitializingPayout({
      isEvent: false,
      isPoll: false,
      isElection: true,
      electionId,
      electionName: access.election?.name ?? "",
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

    await writePayoutReferenceOnDateDoc({ electionId }, date, row.reference)
    triggerPayoutProcessing(row.reference)

    return ok({ message: "Payout request submitted successfully", reference: row.reference })
  } catch (err: any) {
    if (err instanceof DuplicateRequestError) return fail(err.message, 409)
    console.error("[POST /api/elections/[id]/payout] write error:", err)
    return fail("Failed to submit payout request", 500)
  }
}
