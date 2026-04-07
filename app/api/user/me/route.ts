import { type NextRequest, NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"

/**
 * GET /api/user/me
 *
 * Returns the current authenticated user's data.
 * Requires middleware authentication (x-user-id header).
 */
export async function GET(request: NextRequest) {
  try {
    // Get user ID from middleware-injected header
    const userId = request.headers.get("x-user-id")

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Missing authentication headers" },
        { status: 401 }
      )
    }

    // Fetch user document from Firestore
    const userDoc = await adminDb.collection("users").doc(userId).get()

    if (!userDoc.exists) {
      return NextResponse.json(
        { error: "Not found", message: "User document not found" },
        { status: 404 }
      )
    }

    const userData = userDoc.data()!

    // Return essential user data
    return NextResponse.json({
      id: userId,
      uid: userId,
      email: userData.email || "",
      fullName: userData.fullName || "",
      username: userData.username || "",
      profilePicture: userData.profilePicture || "",
      isBooker: userData.isBooker || userData.role === "booker",
      isVerified: userData.isVerified || false,
      createdAt: userData.createdAt || new Date().toISOString(),
    })
  } catch (error) {
    console.error("Error fetching user:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
