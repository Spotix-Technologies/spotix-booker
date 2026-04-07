import { adminDb } from "@/lib/firebase-admin"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    // Defensive check: Verify that middleware has injected auth headers
    // (middleware validates the token and injects x-user-id)
    const xUserId = request.headers.get("x-user-id")
    if (!xUserId) {
      console.warn(
        "[api/profile/bvt] Missing x-user-id header — middleware may have failed to authenticate"
      )
      return NextResponse.json(
        { error: "Unauthorized", message: "Missing authentication headers" },
        { status: 401 }
      )
    }

    const userId = request.nextUrl.searchParams.get("userId")

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    // Ensure the requesting user matches the requested userId (prevent cross-user data access)
    if (xUserId !== userId) {
      console.warn(`[api/profile/bvt] User ${xUserId} attempted to access data for ${userId}`)
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
      {
        bvt,
        isVerified,
        verificationState,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error("BVT fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch BVT" }, { status: 500 })
  }
}
