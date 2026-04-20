// app/api/user/me/route.ts
import { type NextRequest, NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"
import { verifyAccessToken } from "@/lib/auth-tokens"

export async function GET(request: NextRequest) {
  try {
    // Prefer middleware-injected header (when called server-side)
    // Fall back to cookie verification (when called from client)
    let userId = request.headers.get("x-user-id")

    if (!userId) {
      const token = request.cookies.get("spotix_at")?.value
      if (!token) {
        return NextResponse.json(
          { error: "Unauthorized", message: "Not authenticated" },
          { status: 401 }
        )
      }

      try {
        const payload = await verifyAccessToken(token, "spotix-booker")
        userId = payload.uid
      } catch {
        return NextResponse.json(
          { error: "Unauthorized", message: "Invalid or expired token" },
          { status: 401 }
        )
      }
    }

    const userDoc = await adminDb.collection("users").doc(userId).get()
    if (!userDoc.exists) {
      return NextResponse.json(
        { error: "Not found", message: "User document not found" },
        { status: 404 }
      )
    }

    const userData = userDoc.data()!
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
      enabledCollaboration: userData.enabledCollaboration || false,
    })
  } catch (error) {
    console.error("Error fetching user:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}