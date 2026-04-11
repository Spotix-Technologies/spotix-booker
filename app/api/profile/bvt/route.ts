// app/api/profile/bvt/route.ts

import { adminDb } from "@/lib/firebase-admin"
import { verifyAccessToken } from "@/lib/auth-tokens"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    // Resolve user ID from middleware header or cookie fallback
    let xUserId = request.headers.get("x-user-id")

    if (!xUserId) {
      const token = request.cookies.get("spotix_at")?.value
      if (!token) {
        return NextResponse.json(
          { error: "Unauthorized", message: "Not authenticated" },
          { status: 401 }
        )
      }
      try {
        const payload = await verifyAccessToken(token, "spotix-booker")
        xUserId = payload.uid
      } catch {
        return NextResponse.json(
          { error: "Unauthorized", message: "Invalid or expired token" },
          { status: 401 }
        )
      }
    }

    const userId = request.nextUrl.searchParams.get("userId")

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    // Ensure the requesting user matches the requested userId (prevent cross-user data access)
    if (xUserId !== userId) {
      console.warn(`[Server] User ${xUserId} attempted to access data for ${userId}`)
      return NextResponse.json(
        { error: "Forbidden", message: "You can only access your own data" },
        { status: 403 }
      )
    }

    const userRef = adminDb.collection("users").doc(userId)
    const userDoc = await userRef.get()

    if (!userDoc.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const userData = userDoc.data()
    const bvt = userData?.bvt || null

    const verificationRef = adminDb.collection("verification").where("uid", "==", userId)
    const verificationSnapshot = await verificationRef.get()

    let isVerified = false
    let verificationState = "Not Verified"

    if (!verificationSnapshot.empty) {
      const verificationData = verificationSnapshot.docs[0].data()
      verificationState = verificationData.verificationState || "Not Verified"
      isVerified = userData?.isVerified || false
    }

    return NextResponse.json(
      { bvt, isVerified, verificationState },
      { status: 200 }
    )
  } catch (error) {
    console.error("BVT fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch BVT" }, { status: 500 })
  }
}