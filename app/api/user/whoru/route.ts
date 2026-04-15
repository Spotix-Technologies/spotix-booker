import { adminDb } from "@/lib/firebase"

/**
 * GET /api/user/whoru?email={email}&token={ACCESS_TOKEN_SECRET}
 * Searches for a user by email, ensuring the request is authenticated with ACCESS_TOKEN_SECRET.
 * Returns user ID and basic info, or 404 if not found.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const email = searchParams.get("email")
  const token = searchParams.get("token")

  // ─────────────────────────────────────────────────────────────────────────
  // Validation
  // ─────────────────────────────────────────────────────────────────────────
  if (!email || !token) {
    return Response.json({ error: "Missing email or token" }, { status: 400 })
  }

  if (token !== process.env.ACCESS_TOKEN_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // Search for user by email in the users collection
    // ─────────────────────────────────────────────────────────────────────────
    const snapshot = await adminDb
      .collection("users")
      .where("email", "==", email)
      .limit(1)
      .get()

    if (snapshot.empty) {
      return Response.json({ error: "User not found" }, { status: 404 })
    }

    const doc = snapshot.docs[0]
    const userId = doc.id
    const userData = doc.data()

    return Response.json({
      userId,
      email: userData.email || "",
      firstName: userData.firstName || "",
      lastName: userData.lastName || "",
      profileImage: userData.profileImage || null,
    })
  } catch (err: any) {
    console.error("[GET /api/user/whoru]", err)
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
