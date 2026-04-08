/**
 * app/api/payout/method/route.ts
 *
 * GET    /api/payout/method             → List all payout methods for authenticated user
 * GET    /api/payout/method?resource=banks → Fetch Nigerian banks list from Paystack
 * POST   /api/payout/method             → Create a new payout method
 * PATCH  /api/payout/method             → Set a method as primary
 * DELETE /api/payout/method             → Delete a payout method
 *
 * Firestore: payoutMethods/{uid}/methods/{doc.id}
 */

import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { adminDb } from "@/lib/firebase-admin"
import { verifyAccessToken } from "@/lib/auth-tokens"
import { FieldValue } from "firebase-admin/firestore"

const DEV_TAG = "spotix-api-v1"

function ok(data: object, status = 200) {
  return NextResponse.json({ success: true, developer: DEV_TAG, ...data }, { status })
}

function fail(message: string, status: number) {
  return NextResponse.json({ success: false, error: message, developer: DEV_TAG }, { status })
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
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

// ─── GET ──────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const resource = searchParams.get("resource")

  // ── Public: fetch banks from Paystack ─────────────────────────────────────
  if (resource === "banks") {
    try {
      const paystackRes = await fetch(
        "https://api.paystack.co/bank?country=nigeria&use_cursor=false&perPage=100",
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          },
          next: { revalidate: 86400 }, // cache for 24h
        }
      )

      if (!paystackRes.ok) {
        throw new Error(`Paystack responded with ${paystackRes.status}`)
      }

      const data = await paystackRes.json()
      const banks = (data.data ?? []).map((b: any) => ({
        name: b.name,
        code: b.code,
      }))

      return ok({ banks })
    } catch (err: any) {
      console.error("[GET /api/payout/method banks] error:", err)
      return fail("Failed to fetch banks from Paystack", 502)
    }
  }

  // ── Authenticated: list user's payout methods ──────────────────────────────
  const auth = await authenticate()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  try {
    const snapshot = await adminDb
      .collection("payoutMethods")
      .doc(userId)
      .collection("methods")
      .orderBy("createdAt", "asc")
      .get()

    const methods = snapshot.docs.map((doc) => {
      const d = doc.data()
      return {
        id: doc.id,
        accountNumber: d.accountNumber ?? "",
        bankName: d.bankName ?? "",
        bankCode: d.bankCode ?? "",
        accountName: d.accountName ?? "",
        primary: d.primary ?? false,
        createdAt: d.createdAt?.toDate?.()?.toISOString() ?? d.createdAt ?? "",
      }
    })

    return ok({ methods })
  } catch (err: any) {
    console.error("[GET /api/payout/method] error:", err)
    return fail("Failed to fetch payout methods", 500)
  }
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

  const { accountNumber, bankName, bankCode, accountName } = body

  if (!accountNumber?.trim()) return fail("accountNumber is required", 400)
  if (accountNumber.length !== 10) return fail("accountNumber must be 10 digits", 400)
  if (!bankName?.trim()) return fail("bankName is required", 400)
  if (!bankCode?.trim()) return fail("bankCode is required", 400)
  if (!accountName?.trim()) return fail("accountName is required", 400)

  try {
    const methodsRef = adminDb
      .collection("payoutMethods")
      .doc(userId)
      .collection("methods")

    // Check for duplicate account number + bank combination
    const existing = await methodsRef
      .where("accountNumber", "==", accountNumber)
      .where("bankCode", "==", bankCode)
      .limit(1)
      .get()

    if (!existing.empty) {
      return fail("This account is already saved as a payout method", 409)
    }

    // Check if this is the first method — auto-set as primary if so
    const allMethods = await methodsRef.limit(1).get()
    const isPrimary = allMethods.empty

    const docRef = await methodsRef.add({
      accountNumber,
      bankName,
      bankCode,
      accountName,
      primary: isPrimary,
      createdAt: FieldValue.serverTimestamp(),
    })

    return ok(
      {
        message: "Payout method added successfully",
        method: {
          id: docRef.id,
          accountNumber,
          bankName,
          bankCode,
          accountName,
          primary: isPrimary,
        },
      },
      201
    )
  } catch (err: any) {
    console.error("[POST /api/payout/method] error:", err)
    return fail("Failed to save payout method", 500)
  }
}

// ─── PATCH ────────────────────────────────────────────────────────────────────
// action: "setPrimary" → set one method as primary, unset all others
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

  const { action, methodId } = body
  if (action !== "setPrimary") return fail(`Unknown action: ${action}`, 400)
  if (!methodId) return fail("methodId is required", 400)

  try {
    const methodsRef = adminDb
      .collection("payoutMethods")
      .doc(userId)
      .collection("methods")

    const allSnap = await methodsRef.get()

    // Verify the target method exists and belongs to this user
    const targetDoc = allSnap.docs.find((d) => d.id === methodId)
    if (!targetDoc) return fail("Payout method not found", 404)

    // Batch update: unset all, then set target
    const batch = adminDb.batch()
    for (const doc of allSnap.docs) {
      batch.update(doc.ref, { primary: doc.id === methodId })
    }
    await batch.commit()

    return ok({ message: "Primary payout method updated" })
  } catch (err: any) {
    console.error("[PATCH /api/payout/method] error:", err)
    return fail("Failed to update primary method", 500)
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const auth = await authenticate()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return fail("Invalid JSON body", 400)
  }

  const { methodId } = body
  if (!methodId) return fail("methodId is required", 400)

  try {
    const methodsRef = adminDb
      .collection("payoutMethods")
      .doc(userId)
      .collection("methods")

    const docRef = methodsRef.doc(methodId)
    const docSnap = await docRef.get()

    if (!docSnap.exists) return fail("Payout method not found", 404)

    const wasPrimary = docSnap.data()?.primary === true

    await docRef.delete()

    // If deleted method was primary, auto-promote the oldest remaining method
    if (wasPrimary) {
      const remaining = await methodsRef.orderBy("createdAt", "asc").limit(1).get()
      if (!remaining.empty) {
        await remaining.docs[0].ref.update({ primary: true })
      }
    }

    return ok({ message: "Payout method deleted successfully" })
  } catch (err: any) {
    console.error("[DELETE /api/payout/method] error:", err)
    return fail("Failed to delete payout method", 500)
  }
}