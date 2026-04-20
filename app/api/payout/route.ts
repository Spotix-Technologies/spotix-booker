import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { adminDb } from "@/lib/firebase-admin"
import { verifyAccessToken } from "@/lib/auth-tokens"
import { FieldValue } from "firebase-admin/firestore"

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

async function resolveOwnedEvent(eventId: string, userId: string) {
  const ref = adminDb.collection("events").doc(eventId)
  const snap = await ref.get()
  if (!snap.exists) return fail("Event not found", 404)
  if (snap.data()!.organizerId !== userId) return fail("Forbidden: you do not own this event", 403)
  return { snap, ref }
}

// ─── GET ──────────────────────────────────────────────────────────────────────
// ?eventId=xxx&action=list   → list daily transaction records
// ?eventId=xxx&action=status → list payouts matched per transaction date
export async function GET(req: NextRequest) {
  const auth = await authenticate()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  const { searchParams } = new URL(req.url)
  const eventId = searchParams.get("eventId")
  const action = searchParams.get("action") ?? "list"

  if (!eventId?.trim()) return fail("eventId is required", 400)

  const owned = await resolveOwnedEvent(eventId, userId)
  if (owned instanceof NextResponse) return owned

  // ── action=list ────────────────────────────────────────────────────────────
  if (action === "list") {
    try {
      const snapshot = await adminDb
        .collection("admin")
        .doc("events")
        .collection(eventId)
        .get()

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

  // ── action=status ──────────────────────────────────────────────────────────
  if (action === "status") {
    try {
      // Fetch all payout records for this event belonging to this user
      const payoutsSnap = await adminDb
        .collection("payouts")
        .where("eventId", "==", eventId)
        .where("userId", "==", userId)
        .get()

      if (payoutsSnap.empty) return ok({ payouts: [] })

      const payouts = payoutsSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        // Convert server timestamps to ISO strings for safe serialisation
        createdAt: doc.data().createdAt?.toDate?.()?.toISOString() ?? null,
        updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() ?? null,
        pendingAt: doc.data().pendingAt?.toDate?.()?.toISOString() ?? null,
        processingAt: doc.data().processingAt?.toDate?.()?.toISOString() ?? null,
      }))

      return ok({ payouts })
    } catch (error: any) {
      console.error("[GET /api/payout?action=status] error:", error.code, error.message)
      return fail("Internal Server Error", 500)
    }
  }

  return fail("Invalid action. Use list or status.", 400)
}

// ─── POST ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await authenticate()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

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
  if (typeof amount !== "number" || amount <= 0)
    return fail("amount must be a positive number", 400)

  // ── 1. Ownership ───────────────────────────────────────────────────────────
  const owned = await resolveOwnedEvent(eventId, userId)
  if (owned instanceof NextResponse) return owned
  const { snap: eventSnap, ref: eventRef } = owned

  // ── 2. Flagged event check ─────────────────────────────────────────────────
  if (eventSnap.data()!.flagged === true) {
    return fail(
      "Looks like we flagged your event. Please contact customer support with your eventId for more information.",
      403
    )
  }

  // ── 3. Global payout switch ────────────────────────────────────────────────
  const globalSnap = await adminDb.collection("admin").doc("global").get()
  if (globalSnap.exists) {
    const global = globalSnap.data()!
    if (global.isPayoutAllowed === false) {
      const reason = global.isPayoutNotAllowedReason
        ? ` Reason: ${global.isPayoutNotAllowedReason}`
        : ""
      return fail(`We are currently not processing payouts, check back later.${reason}`, 503)
    }
  }

  // ── 4. Transaction record exists ───────────────────────────────────────────
  const salesDocRef = adminDb
    .collection("admin")
    .doc("events")
    .collection(eventId)
    .doc(date)

  const salesDoc = await salesDocRef.get()
  if (!salesDoc.exists) return fail("Transaction date record not found", 404)
  const salesData = salesDoc.data()!

  // ── 5. 30-hour rule ────────────────────────────────────────────────────────
  const updatedAt = salesData.updatedAt
    ? new Date(salesData.updatedAt)
    : new Date(`${date}T00:00:00`)
  const diffHours = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60)

  if (diffHours < 30) {
    const remainingMs = updatedAt.getTime() + 30 * 60 * 60 * 1000 - Date.now()
    const h = Math.floor(remainingMs / (1000 * 60 * 60))
    const m = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60))
    return fail(
      `Withdrawal not yet available. Available in ${h}h ${m}m (30 hours after last purchase).`,
      403
    )
  }

  // ── 6. Restricted specific date check ─────────────────────────────────────
  // Firestore path: admin/global/restrictedDate/{yyyy-mm-dd}
  // Document field: isRestricted: true | false, reason?: string
  const restrictedDateSnap = await adminDb
    .collection("admin")
    .doc("global")
    .collection("restrictedDate")
    .doc(date)
    .get()

  if (restrictedDateSnap.exists && restrictedDateSnap.data()!.isRestricted === true) {
    const reason =
      restrictedDateSnap.data()!.reason ??
      `Payouts for ${date} are currently restricted. Please try again later.`
    return fail(reason, 403)
  }

  // ── 7. Restricted day-of-week check ───────────────────────────────────────
  // Firestore path: admin/global/restrictedDays/{DayName}
  // Day names: Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday
  // Document field: isRestricted: true | false, reason?: string
  // Uses noon to avoid DST-related off-by-one on the day boundary
  const txnDayOfWeek = DAYS[new Date(`${date}T12:00:00`).getDay()]

  const restrictedDaySnap = await adminDb
    .collection("admin")
    .doc("global")
    .collection("restrictedDays")
    .doc(txnDayOfWeek)
    .get()

  if (restrictedDaySnap.exists && restrictedDaySnap.data()!.isRestricted === true) {
    const reason =
      restrictedDaySnap.data()!.reason ??
      `Payouts for transactions on ${txnDayOfWeek}s are currently restricted. Please try again later.`
    return fail(reason, 403)
  }

  // ── 8. Payout method — use user-selected method if provided, else primary ──
  let methodDoc: FirebaseFirestore.DocumentSnapshot | null = null

  if (requestedMethodId?.trim()) {
    // User explicitly selected a method — verify it belongs to them
    const specificSnap = await adminDb
      .collection("payoutMethods")
      .doc(userId)
      .collection("methods")
      .doc(requestedMethodId.trim())
      .get()
    if (specificSnap.exists) {
      methodDoc = specificSnap
    }
  }

  if (!methodDoc) {
    // Fall back to primary method
    const primarySnap = await adminDb
      .collection("payoutMethods")
      .doc(userId)
      .collection("methods")
      .where("primary", "==", true)
      .limit(1)
      .get()
    if (!primarySnap.empty) {
      methodDoc = primarySnap.docs[0]
    }
  }

  if (!methodDoc) {
    return fail("No payout method found. Please add a bank account first.", 400)
  }

  const primaryMethod = methodDoc.data()!
  const methodId = methodDoc.id


  // ── 9. Duplicate guard ────────────────────────────────────────────────────
  const existingPayout = await adminDb
    .collection("payouts")
    .where("eventId", "==", eventId)
    .where("date", "==", date)
    .where("userId", "==", userId)
    .limit(1)
    .get()

  if (!existingPayout.empty) {
    return fail("A payout request for this date has already been submitted.", 409)
  }


  // ── 10. Fetch event name from admin/events/{eventId}/{date} ───────────────
  let eventName = ""
  try {
    const eventDocRef = adminDb
      .collection("admin")
      .doc("events")
      .collection(eventId)
      .doc(date)
    const eventDocSnap = await eventDocRef.get()
    if (eventDocSnap.exists) {
      eventName = eventDocSnap.data()?.eventName ?? ""
    }
  } catch (err) {
    console.warn("[POST /api/payout] failed to fetch eventName:", err)
    // Non-critical — proceed without eventName
  }

  try {
    const payoutRef = await adminDb.collection("payouts").add({
  eventId,
  userId,
  date,
  amount,
  eventName,
  methodId,                              
  bankName: primaryMethod.bankName ?? "",
  bankCode: primaryMethod.bankCode ?? "",
  accountNumber: primaryMethod.accountNumber ?? "",
  accountName: primaryMethod.accountName ?? "",
  recipientCode: primaryMethod.recipientCode ?? null, 
  status: "pending",
  createdAt: FieldValue.serverTimestamp(),
  pendingAt: FieldValue.serverTimestamp(),
})


    return ok({
      message: "Payout request submitted successfully",
      payoutId: payoutRef.id,
    })
  } catch (err: any) {
    console.error("[POST /api/payout] write error:", err)
    return fail("Failed to submit payout request", 500)
  }
}


export async function PATCH(req: NextRequest) {
  const auth = await authenticate()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return fail("Invalid JSON body", 400)
  }

  const { payoutId } = body
  if (!payoutId?.trim()) return fail("payoutId is required", 400)

  try {
    const payoutRef = adminDb.collection("payouts").doc(payoutId)
    const payoutSnap = await payoutRef.get()

    if (!payoutSnap.exists) return fail("Payout record not found", 404)

    const payout = payoutSnap.data()!

    // Only the owner can re-run their payout
    if (payout.userId !== userId) return fail("Forbidden", 403)

    // Only failed payouts can be re-run
    if (payout.status !== "failed") {
      return fail(`Cannot re-run a payout with status: ${payout.status}`, 400)
    }

    await payoutRef.update({
      status: "pending",
      updatedAt: FieldValue.serverTimestamp(),
      pendingAt: FieldValue.serverTimestamp(),
    })

    return ok({ message: "Payout re-queued successfully" })
  } catch (err: any) {
    console.error("[PATCH /api/payout] error:", err)
    return fail("Failed to re-run payout", 500)
  }
}

export async function PUT() {
  return fail("Method Not Allowed", 405)
}
export async function DELETE() {
  return fail("Method Not Allowed", 405)
}
