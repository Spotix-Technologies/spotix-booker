// app/api/user/me/route.ts
import { type NextRequest, NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"
import { verifyAccessToken } from "@/lib/auth-tokens"
import { Timestamp } from "firebase-admin/firestore"

/** Safely convert any Firestore Timestamp / plain value to an ISO string. */
function toIso(value: unknown): string {
  if (!value) return new Date().toISOString()
  // Firestore Admin SDK Timestamp
  if (value instanceof Timestamp) return value.toDate().toISOString()
  // Serialised Timestamp shape: { _seconds, _nanoseconds }
  if (typeof value === "object" && "_seconds" in (value as any)) {
    return new Date((value as any)._seconds * 1000).toISOString()
  }
  // Already a string or number
  if (typeof value === "string" || typeof value === "number") {
    return new Date(value).toISOString()
  }
  return new Date().toISOString()
}

export async function GET(request: NextRequest) {
  try {
    // Auth: verify the spotix_at cookie server-side — never trust an
    // x-user-id header (see app/api/event/one/route.ts's comment: Next
    // middleware never runs on /api/*, so nothing strips a client-forged
    // header before it reaches this handler — its presence on a request
    // to this route is always attacker-controlled, never your own infra).
    const token = request.cookies.get("spotix_at")?.value
    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Not authenticated" },
        { status: 401 }
      )
    }
    let userId: string
    try {
      const payload = await verifyAccessToken(token, "spotix-booker")
      userId = payload.uid
    } catch {
      return NextResponse.json(
        { error: "Unauthorized", message: "Invalid or expired token" },
        { status: 401 }
      )
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
      createdAt: toIso(userData.createdAt),
      enabledCollaboration: userData.enabledCollaboration || false,
      bookerName: userData.bookerName || userData.fullName || "",
      dateOfBirth: userData.dateOfBirth || "",
    })
  } catch (error) {
    console.error("Error fetching user:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
