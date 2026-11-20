/**
 * app/api/event/[eventId]/referrals/route.ts
 *
 * GET    /api/event/[eventId]/referrals
 *   → Returns all referral codes and their usages for the event
 *
 * POST   /api/event/[eventId]/referrals
 *   Body { code: string } → Add a new referral code
 *
 * DELETE /api/event/[eventId]/referrals
 *   Body { code: string } → Delete a referral code
 *
 * All handlers:
 *   - Auth via spotix_at httpOnly cookie
 *   - Access enforced via resolveEventAccess: Creator, Admin, or any
 *     collaborator (built-in or custom) granted the "referrals" tab —
 *     see app/lib/event-access.ts and app/lib/team-tabs.ts
 *   - Admin SDK only — no client SDK
 *
 * Firestore structure:
 *   events/{eventId}/referrals/{code}
 *   events/{eventId}/referrals/{code}/usages/{ticketId}  (written by
 *     spotix-backend v1/lib/ticket/referral.js at purchase time)
 */

import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { adminDb } from "@/lib/firebase-admin"
import { verifyAccessToken } from "@/lib/auth-tokens"
import { FieldValue } from "firebase-admin/firestore"
import { resolveEventAccess, hasTab } from "@/lib/event-access"
import { recordEditHistory, actorFromAccess, type EditActor } from "@/lib/edit-history"

const DEV_TAG = "spotix-api-v1"

function ok(data: object, status = 200) {
  return NextResponse.json({ success: true, developer: DEV_TAG, ...data }, { status })
}

function fail(message: string, status: number) {
  return NextResponse.json({ success: false, error: message, developer: DEV_TAG }, { status })
}

// ─── Auth ──────────────────────────────────────────────────────────────────────
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

// ─── Access guard — Creator, Admin, or any collaborator (built-in or custom)
// granted the "referrals" tab ──────────────────────────────────────────────
async function resolveReferralsAccess(
  eventId: string,
  userId: string
): Promise<{ ref: FirebaseFirestore.DocumentReference; organizerId: string; actor: EditActor } | NextResponse> {
  const access = await resolveEventAccess(eventId, userId)
  if (!access.ok) return fail(access.error, access.status)
  if (!hasTab(access, "referrals")) {
    return fail("Forbidden: your role does not have access to Referrals on this event", 403)
  }
  return { ref: access.eventRef, organizerId: access.organizerId, actor: actorFromAccess(access, userId) }
}

// ─── GET ───────────────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const auth = await authenticate()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  const { eventId } = await params
  if (!eventId?.trim()) return fail("eventId is required", 400)

  const owned = await resolveReferralsAccess(eventId, userId)
  if (owned instanceof NextResponse) return owned
  const { ref: eventRef } = owned

  try {
    const referralsSnap = await eventRef.collection("referrals").get()

    // Usages are written by the backend (v1/lib/ticket/referral.js) as a
    // SUBCOLLECTION — events/{eventId}/referrals/{code}/usages/{ticketId} —
    // one doc per ticket, not an array field on the referral doc itself
    // (that would hit Firestore's 1MiB doc limit and cause lost updates
    // under concurrent purchases). Fetch each code's usages subcollection
    // in parallel so the dialog on the Referrals tab actually has data to
    // show instead of an empty array.
    const referrals = await Promise.all(
      referralsSnap.docs.map(async (d) => {
        const data = d.data()
        const usagesSnap = await d.ref.collection("usages").orderBy("purchaseDate", "desc").get().catch(
          // orderBy requires purchaseDate on every doc — fall back to
          // unordered fetch if any legacy doc is missing it.
          () => d.ref.collection("usages").get()
        )
        const usages = usagesSnap.docs.map((u) => {
          const ud = u.data()
          return {
            name: ud.name ?? "Unknown",
            ticketType: ud.ticketType ?? "Standard",
            purchaseDate: ud.purchaseDate ?? null,
          }
        })
        return {
          code: d.id,
          usages,
          totalTickets: data.totalTickets ?? usages.length,
        }
      })
    )

    return ok({ referrals })
  } catch (e) {
    console.error("[GET referrals] failed", e)
    return fail("Failed to fetch referrals", 500)
  }
}

// ─── POST ──────────────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const auth = await authenticate()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  const { eventId } = await params
  if (!eventId?.trim()) return fail("eventId is required", 400)

  let body: Record<string, any>
  try { body = await req.json() } catch { return fail("Invalid JSON body", 400) }

  const { code } = body
  if (!code?.trim()) return fail("code is required", 400)
  if (/\s/.test(code.trim())) return fail("Referral code cannot contain spaces", 400)

  const owned = await resolveReferralsAccess(eventId, userId)
  if (owned instanceof NextResponse) return owned
  const { ref: eventRef, organizerId, actor } = owned

  const referralsRef = eventRef.collection("referrals")

  // Check for duplicate (case-insensitive)
  const allDocs = await referralsRef.get()
  const duplicate = allDocs.docs.some(
    (d) => d.id.toLowerCase() === code.trim().toLowerCase()
  )
  if (duplicate) return fail("This referral code already exists", 409)

  try {
    // NOTE: no `usages` array field here — usages live in the
    // {code}/usages subcollection (one doc per ticket, written by the
    // backend at purchase time). Writing a stale empty array field would
    // just be dead data that's never read (see GET above).
    await referralsRef.doc(code.trim()).set({
      totalTickets: 0,
      createdAt: FieldValue.serverTimestamp(),
    })

    recordEditHistory({
      eventId,
      organizerId,
      action: "referral_added",
      actor,
      changes: { referralCode: { before: null, after: code.trim() } },
    })

    return ok(
      {
        message: "Referral code added successfully",
        referral: { code: code.trim(), usages: [], totalTickets: 0 },
      },
      201
    )
  } catch (e) {
    console.error("[POST referrals] failed", e)
    return fail("Failed to add referral code", 500)
  }
}

// ─── DELETE ────────────────────────────────────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const auth = await authenticate()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  const { eventId } = await params
  if (!eventId?.trim()) return fail("eventId is required", 400)

  let body: Record<string, any>
  try { body = await req.json() } catch { return fail("Invalid JSON body", 400) }

  const { code } = body
  if (!code?.trim()) return fail("code is required", 400)

  const owned = await resolveReferralsAccess(eventId, userId)
  if (owned instanceof NextResponse) return owned
  const { ref: eventRef, organizerId, actor } = owned

  const referralRef = eventRef.collection("referrals").doc(code.trim())
  const snap = await referralRef.get()
  if (!snap.exists) return fail("Referral code not found", 404)

  try {
    // Delete the usages subcollection too — otherwise re-adding the same
    // code later would resurrect old usage history under the new doc.
    const usagesSnap = await referralRef.collection("usages").get()
    if (!usagesSnap.empty) {
      const batch = adminDb.batch()
      usagesSnap.docs.forEach((d) => batch.delete(d.ref))
      await batch.commit()
    }
    await referralRef.delete()
    recordEditHistory({
      eventId,
      organizerId,
      action: "referral_removed",
      actor,
      changes: { referralCode: { before: code.trim(), after: null } },
    })
    return ok({ message: "Referral code deleted successfully" })
  } catch (e) {
    console.error("[DELETE referrals] failed", e)
    return fail("Failed to delete referral code", 500)
  }
}