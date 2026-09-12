import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { adminDb } from "@/lib/firebase-admin"
import { verifyAccessToken } from "@/lib/auth-tokens"
import { FieldValue } from "firebase-admin/firestore"
import { resolvePayoutAccess } from "@/lib/payout-access"
import { createInitializingPayout, getPayoutsForEvent, hasActiveOrSuccessfulPayout } from "@/lib/payout-db"
import { writePayoutReferenceOnDateDoc, createVaultHold, listVaultPendingForEvent, getVaultHold } from "@/lib/payout-firestore"
import { triggerPayoutProcessing } from "@/lib/payout-backend"
import { requirePayoutAccessKey } from "@/lib/payout-access-gate"
import { claimIdempotencyKey, DuplicateRequestError } from "@/lib/payout-idempotency"

const DEV_TAG = "spotix-api-v1"
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

function ok(data: object, status = 200) {
  return NextResponse.json({ success: true, developer: DEV_TAG, ...data }, { status })
}
function fail(message: string, status: number) {
  return NextResponse.json({ success: false, error: message, developer: DEV_TAG }, { status })
}

async function authenticate(): Promise<{ userId: string } | NextResponse> {
  const cookieStore = await cookies()
  const token = cookieStore.get("spotix_at")?.value
  if (!token) return fail("No access token", 401)
  try {
    const payload = await verifyAccessToken(token, "spotix-booker")
    return { userId: payload.uid }
  } catch {
    return fail("Invalid or expired access token", 401)
  }
}

function maskAccountNumber(accountNumber: string): string {
  const acc = String(accountNumber ?? "")
  if (acc.length <= 4) return acc
  return `${"•".repeat(acc.length - 4)}${acc.slice(-4)}`
}

async function getUserDisplay(uid: string): Promise<{ name: string; email: string }> {
  try {
    const doc = await adminDb.collection("users").doc(uid).get()
    const d = doc.data()
    return { name: d?.fullName || d?.email || "Unknown", email: d?.email || "" }
  } catch {
    return { name: "Unknown", email: "" }
  }
}

//  GET 
// ?eventId=xxx&action=list        → list daily transaction records (Firestore)
// ?eventId=xxx&action=status      → payout history for this event (Supabase)
// ?eventId=xxx&action=vaultPending → Vault holds still awaiting sign-off (Firestore)
export async function GET(req: NextRequest) {
  const gate = requirePayoutAccessKey(req)
  if (gate) return gate

  const auth = await authenticate()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  const { searchParams } = new URL(req.url)
  const eventId = searchParams.get("eventId")
  const action = searchParams.get("action") ?? "list"

  if (!eventId?.trim()) return fail("eventId is required", 400)

  const access = await resolvePayoutAccess(eventId, userId)
  if (!access.ok) return fail(access.error, access.status)

  if (action === "list") {
    try {
      const snapshot = await adminDb.collection("admin").doc("events").collection(eventId).get()
      if (snapshot.empty) return ok({ transactions: [] })
      const transactions = snapshot.docs
        .map((doc) => ({ date: doc.id, ...doc.data() }))
        .sort((a, b) => (a.date as string).localeCompare(b.date as string))
      return ok({ transactions })
    } catch (error: any) {
      console.error("[GET /api/payout?action=list] error:", error.code, error.message)
      return fail("Internal Server Error", 500)
    }
  }

  if (action === "status") {
    try {
      const rows = await getPayoutsForEvent(eventId)
      const payouts = rows.map((r) => ({
        id: r.reference,
        reference: r.reference,
        eventId: r.event_id,
        userId: r.user_id,
        date: r.pay_date,
        amount: r.amount,
        bankName: r.bank_name,
        bankCode: r.bank_code,
        accountNumber: r.account_number,
        accountName: r.account_name,
        status: r.status,
        failureReason: r.failure_reason,
        narration: r.narration,
        durationSeconds: r.duration_seconds,
        createdAt: r.created_at,
        resolvedAt: r.resolved_at,
      }))
      return ok({ payouts, scope: "event" })
    } catch (error: any) {
      console.error("[GET /api/payout?action=status] error:", error.message)
      return fail("Internal Server Error", 500)
    }
  }

  if (action === "vaultPending") {
    try {
      const holds = await listVaultPendingForEvent(eventId)
      return ok({ payouts: holds })
    } catch (error: any) {
      console.error("[GET /api/payout?action=vaultPending] error:", error.message)
      return fail("Internal Server Error", 500)
    }
  }

  return fail("Invalid action. Use list, status, or vaultPending.", 400)
}

//  POST 
export async function POST(req: NextRequest) {
  const gate = requirePayoutAccessKey(req)
  if (gate) return gate

  const auth = await authenticate()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  //  Idempotency-Key — claimed BEFORE any business logic runs. 5 rapid
  // clicks from the same confirmation dialog send 5 requests carrying the
  // SAME key (minted once, when the dialog opened its submit flow); only
  // the first to atomically claim it proceeds. Every other duplicate
  // — including two truly-simultaneous requests — gets 409 here, before
  // touching Firestore or Supabase business logic at all.
  const idempotencyKey = req.headers.get("idempotency-key")
  if (!idempotencyKey?.trim()) return fail("Idempotency-Key header is required", 400)
  try {
    await claimIdempotencyKey(idempotencyKey, userId)
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

  const { eventId, date, amount, methodId: requestedMethodId } = body
  if (!eventId?.trim()) return fail("eventId is required", 400)
  if (!date?.trim()) return fail("date is required", 400)
  if (amount === undefined || amount === null) return fail("amount is required", 400)
  if (typeof amount !== "number" || amount <= 0) return fail("amount must be a positive number", 400)

  const access = await resolvePayoutAccess(eventId, userId)
  if (!access.ok) return fail(access.error, access.status)
  const { eventSnap, methodsOwnerId, role: initiatorRole } = access

  if (initiatorRole !== "owner" && initiatorRole !== "admin") {
    return fail(
      "Forbidden: your role can view payout records but cannot initiate a payout. Only the Event Creator or an Admin can request a payout.",
      403
    )
  }

  if (eventSnap.data()!.flagged === true) {
    return fail(
      "Looks like we flagged your event. Please contact customer support with your eventId for more information.",
      403
    )
  }

  const globalSnap = await adminDb.collection("admin").doc("global").get()
  if (globalSnap.exists) {
    const global = globalSnap.data()!
    if (global.isPayoutAllowed === false) {
      const reason = global.isPayoutNotAllowedReason ? ` Reason: ${global.isPayoutNotAllowedReason}` : ""
      return fail(`We are currently not processing payouts, check back later.${reason}`, 503)
    }
  }

  const salesDocRef = adminDb.collection("admin").doc("events").collection(eventId).doc(date)
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

  let methodDoc: FirebaseFirestore.DocumentSnapshot | null = null
  if (requestedMethodId?.trim()) {
    const specificSnap = await adminDb.collection("payoutMethods").doc(methodsOwnerId).collection("methods").doc(requestedMethodId.trim()).get()
    if (specificSnap.exists) methodDoc = specificSnap
  }
  if (!methodDoc) {
    const primarySnap = await adminDb
      .collection("payoutMethods")
      .doc(methodsOwnerId)
      .collection("methods")
      .where("primary", "==", true)
      .limit(1)
      .get()
    if (!primarySnap.empty) methodDoc = primarySnap.docs[0]
  }
  if (!methodDoc) return fail("No payout method found. Please add a bank account first.", 400)

  const primaryMethod = methodDoc.data()!
  const methodId = methodDoc.id

  //  Duplicate guard — checks both the Supabase payouts table (anything
  // not "failed") AND any still-open Vault hold for this date.
  const alreadyActive = await hasActiveOrSuccessfulPayout({ eventId }, date)
  if (alreadyActive) return fail("A payout request for this date has already been submitted.", 409)

  const existingHold = await adminDb
    .collection("vaultHolds")
    .where("eventId", "==", eventId)
    .where("date", "==", date)
    .where("status", "==", "vault_pending")
    .limit(1)
    .get()
  if (!existingHold.empty) return fail("A payout request for this date has already been submitted.", 409)

  let eventName = ""
  try {
    const eventDocSnap = await adminDb.collection("admin").doc("events").collection(eventId).doc(date).get()
    if (eventDocSnap.exists) eventName = eventDocSnap.data()?.eventName ?? ""
  } catch (err) {
    console.warn("[POST /api/payout] failed to fetch eventName:", err)
  }

  //  The Vault — multi-signature hold 
  const vaultSnap = await adminDb.collection("vaults").doc(eventId).get()
  const vaultEnabled = vaultSnap.exists && vaultSnap.data()!.enabledVault === true
  const vaultParticipantRecords: any[] = vaultEnabled ? (vaultSnap.data()!.participants ?? []) : []
  const vaultParticipants: string[] = vaultParticipantRecords.map((p: any) => p.uid)

  if (vaultEnabled && vaultParticipants.length === 0) {
    return fail("The Vault is enabled but has no participants assigned yet. Ask the Event Creator to add at least one Admin.", 409)
  }
  if (vaultEnabled) {
    const withoutKey = vaultParticipantRecords.filter((p: any) => !p.keyHash)
    if (withoutKey.length > 0) {
      const pending = withoutKey.map((p: any) => p.email || p.uid).join(", ")
      return fail(
        `The Vault is enabled but ${withoutKey.length} participant(s) haven't set their Vault Key yet (${pending}). Every Vault participant must set their key before a payout can be requested.`,
        409
      )
    }
  }

  const initiator = await getUserDisplay(userId)
  const roleLabel = initiatorRole === "owner" ? "Event Creator" : initiatorRole === "admin" ? "Admin" : "Team member"

  //  Vault-enabled: create a Firestore hold. NOTHING touches Paystack or
  // Supabase yet — "the payout" only begins once the last participant
  // signs off (see PATCH /api/payout/vault).
  if (vaultEnabled) {
    try {
      const holdId = await createVaultHold({
        eventId,
        eventName,
        userId,
        date,
        amount,
        methodId,
        bankName: primaryMethod.bankName ?? "",
        bankCode: primaryMethod.bankCode ?? "",
        accountNumber: primaryMethod.accountNumber ?? "",
        accountName: primaryMethod.accountName ?? "",
        recipientCode: primaryMethod.recipientCode ?? null,
        vaultParticipants,
        vaultSubmissions: {},
        vaultSubmissionLog: {},
        status: "vault_pending",
        initiatedByName: initiator.name,
        initiatedByEmail: initiator.email,
        logs: [
          {
            type: "initiated",
            at: new Date().toISOString(),
            byUid: userId,
            byName: initiator.name,
            byEmail: initiator.email,
            message: `Payout requested by ${initiator.name} (${roleLabel}) — awaiting Vault sign-off`,
          },
        ],
      })

      return ok({
        message: `Payout request submitted and is awaiting sign-off from ${vaultParticipants.length} Vault participant(s).`,
        vaultLocked: true,
        holdId,
      })
    } catch (err: any) {
      console.error("[POST /api/payout] vault hold write error:", err)
      return fail("Failed to submit payout request", 500)
    }
  }

  //  No Vault — the payout begins right now 
  try {
    const row = await createInitializingPayout({
      isEvent: true,
      isPoll: false,
      eventId,
      eventName,
      payDate: date,
      userId,
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

    await writePayoutReferenceOnDateDoc({ eventId }, date, row.reference)
    triggerPayoutProcessing(row.reference)

    return ok({
      message: "Payout request submitted successfully",
      vaultLocked: false,
      reference: row.reference,
    })
  } catch (err: any) {
    if (err instanceof DuplicateRequestError) return fail(err.message, 409)
    console.error("[POST /api/payout] write error:", err)
    return fail("Failed to submit payout request", 500)
  }
}

export async function PATCH(req: NextRequest) {
  const gate = requirePayoutAccessKey(req)
  if (gate) return gate
  // No retries — a failed payout can never be re-run. The only path
  // forward on a failure is contacting Spotix support with the
  // reference (shown in the payout state dialog and the log).
  return fail("Failed payouts cannot be retried. Please contact Spotix support with your payout reference.", 405)
}

export async function PUT(req: NextRequest) {
  const gate = requirePayoutAccessKey(req)
  if (gate) return gate
  return fail("Method Not Allowed", 405)
}

//  DELETE — cancel or reject a Vault hold that hasn't cleared yet 
// This is the only pre-payout state left to cancel: once a hold is
// released (or a non-Vault payout is created), money is already in
// flight and cannot be stopped from here.
export async function DELETE(req: NextRequest) {
  const gate = requirePayoutAccessKey(req)
  if (gate) return gate

  const auth = await authenticate()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return fail("Invalid JSON body", 400)
  }

  const { holdId } = body
  if (!holdId?.trim()) return fail("holdId is required", 400)

  try {
    const hold = await getVaultHold(holdId)
    if (!hold) return fail("Payout hold not found", 404)
    const { ref, data: payout } = hold

    const access = await resolvePayoutAccess(payout.eventId, userId)
    if (!access.ok) return fail(access.error, access.status)
    if (access.role !== "owner" && access.role !== "admin") {
      return fail("Only the Event Creator or an Admin can cancel or reject a payout", 403)
    }

    if (payout.status !== "vault_pending") {
      return fail(`Cannot act on a payout hold with status: ${payout.status}`, 400)
    }

    const isInitiator = payout.userId === userId
    const finalStatus = isInitiator ? "cancelled" : "rejected"
    const roleLabel = access.role === "owner" ? "Event Creator" : "Admin"

    const actor = await getUserDisplay(userId)
    const actionLog = isInitiator
      ? {
          type: "cancelled",
          at: new Date().toISOString(),
          byUid: userId,
          byName: actor.name,
          byEmail: actor.email,
          message: `Payout stopped by ${actor.name} (${roleLabel}) while awaiting Vault sign-off`,
        }
      : {
          type: "rejected",
          at: new Date().toISOString(),
          byUid: userId,
          byName: actor.name,
          byEmail: actor.email,
          message: `Payout rejected by ${actor.name} (${roleLabel}) — this payout can no longer proceed`,
        }

    await ref.update({
      status: finalStatus,
      cancelledAt: FieldValue.serverTimestamp(),
      cancelledBy: userId,
      cancelledByName: actor.name,
      logs: FieldValue.arrayUnion(actionLog),
    })

    return ok({
      message: isInitiator
        ? "Payout cancelled. It remains visible in the logs."
        : "Payout rejected. It can no longer proceed and remains visible in the logs.",
      status: finalStatus,
    })
  } catch (err: any) {
    console.error("[DELETE /api/payout] error:", err)
    return fail("Failed to cancel/reject payout", 500)
  }
}
