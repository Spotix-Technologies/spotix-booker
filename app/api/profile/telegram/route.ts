// app/api/profile/telegram/route.ts

import { adminDb } from "@/lib/firebase-admin"
import { verifyAccessToken } from "@/lib/auth-tokens"
import { type NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { FieldValue, Timestamp } from "firebase-admin/firestore"

// ─── GET: fetch telegram connection status for the user ───────────────────────
export async function GET(request: NextRequest) {
  try {
    const xUserId = await resolveUserId(request)
    if (!xUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = request.nextUrl.searchParams.get("userId")
    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    if (xUserId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const userDoc = await adminDb.collection("users").doc(userId).get()
    if (!userDoc.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const telegram = userDoc.data()?.telegram || null

    // Check if there is a pending (unexpired) token for this user
    const now = Timestamp.now()
    const tokenSnap = await adminDb
      .collection("telegramTokens")
      .where("userId", "==", userId)
      .where("expiresAt", ">", now)
      .limit(1)
      .get()

    const hasPendingToken = !tokenSnap.empty
    const pendingToken = hasPendingToken ? tokenSnap.docs[0].id : null

    return NextResponse.json({
      connected: telegram?.connected === true,
      telegramUsername: telegram?.telegramUsername || null,
      linkedAt: telegram?.linkedAt || null,
      hasPendingToken,
      pendingToken,
    })
  } catch (error) {
    console.error("[GET /api/profile/telegram] Error:", error)
    return NextResponse.json({ error: "Failed to fetch Telegram status" }, { status: 500 })
  }
}

// ─── POST: generate a new telegram link token for the user ────────────────────
export async function POST(request: NextRequest) {
  try {
    const xUserId = await resolveUserId(request)
    if (!xUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const userId = body?.userId

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    if (xUserId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Delete any existing unexpired tokens for this user to avoid stale ones
    const existing = await adminDb
      .collection("telegramTokens")
      .where("userId", "==", userId)
      .get()

    const batch = adminDb.batch()
    existing.docs.forEach((doc) => batch.delete(doc.ref))
    await batch.commit()

    // Generate a new token valid for 15 minutes
    const token = randomUUID()
    const expiresAt = Timestamp.fromDate(new Date(Date.now() + 15 * 60 * 1000))

    await adminDb.collection("telegramTokens").doc(token).set({
      userId,
      expiresAt,
      createdAt: FieldValue.serverTimestamp(),
    })

    return NextResponse.json({ token }, { status: 201 })
  } catch (error) {
    console.error("[POST /api/profile/telegram] Error:", error)
    return NextResponse.json({ error: "Failed to create token" }, { status: 500 })
  }
}

// ─── Shared auth helper (mirrors the bvt route pattern) ──────────────────────
async function resolveUserId(request: NextRequest): Promise<string | null> {
  const xUserId = request.headers.get("x-user-id")
  if (xUserId) return xUserId

  const token = request.cookies.get("spotix_at")?.value
  if (!token) return null

  try {
    const payload = await verifyAccessToken(token, "spotix-booker")
    return payload.uid
  } catch {
    return null
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const xUserId = await resolveUserId(request)
    if (!xUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
 
    const body = await request.json()
    const userId = body?.userId
 
    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }
 
    if (xUserId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
 
    // Remove telegram field from user doc
    await adminDb.collection("users").doc(userId).update({
      telegram: FieldValue.delete(),
    })
 
    // Also clean up any pending tokens
    const tokenSnap = await adminDb
      .collection("telegramTokens")
      .where("userId", "==", userId)
      .get()
 
    const batch = adminDb.batch()
    tokenSnap.docs.forEach((doc) => batch.delete(doc.ref))
    await batch.commit()
 
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[DELETE /api/profile/telegram] Error:", error)
    return NextResponse.json({ error: "Failed to disconnect Telegram" }, { status: 500 })
  }
}