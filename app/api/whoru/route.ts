/**
 * GET /api/whoru?type={type}&value={value}&limit={limit}
 *
 * Looks up a Spotix user by email, name, phone, or uid.
 *
 * Accepts either:
 *   - Authorization: Bearer <ACCESS_TOKEN_SECRET>  (server-to-server / bots)
 *   - spotix_at cookie                             (browser / Teams page)
 *
 * Response fields: userId, email, fullName, phoneNumber, username
 */

import { NextRequest } from "next/server"
import { cookies } from "next/headers"
import { adminDb } from "@/lib/firebase-admin"
import { verifyAccessToken } from "@/lib/auth-tokens"

type LookupType = "email" | "name" | "phone" | "uid"

async function isAuthorized(req: NextRequest): Promise<boolean> {
  // 1. Server-secret (existing integrations)
  const authHeader = req.headers.get("authorization")
  if (authHeader?.startsWith("Bearer ")) {
    if (authHeader.slice(7) === process.env.ACCESS_TOKEN_SECRET) return true
  }
  // 2. Cookie-based booker JWT (Teams page / browser)
  try {
    const cookieStore = await cookies()
    const jwt = cookieStore.get("spotix_at")?.value
    if (jwt) { await verifyAccessToken(jwt, "spotix-booker"); return true }
  } catch { /* invalid */ }
  return false
}

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const type       = searchParams.get("type") as LookupType | null
  const value      = searchParams.get("value")
  const limitParam = searchParams.get("limit")

  if (!type || !value || !limitParam) {
    return Response.json({ error: "Missing required query params: type, value, limit" }, { status: 400 })
  }

  const validTypes: LookupType[] = ["email", "name", "phone", "uid"]
  if (!validTypes.includes(type)) {
    return Response.json({ error: `Invalid type. Must be one of: ${validTypes.join(", ")}` }, { status: 400 })
  }

  const limit = parseInt(limitParam, 10)
  if (isNaN(limit) || limit < 1) {
    return Response.json({ error: "limit must be a positive integer" }, { status: 400 })
  }

  try {
    let docs: FirebaseFirestore.DocumentSnapshot[] = []

    if (type === "uid") {
      const doc = await adminDb.collection("users").doc(value).get()
      if (doc.exists) docs = [doc]
    } else {
      const fieldMap: Record<Exclude<LookupType, "uid">, string> = {
        email: "email", name: "fullName", phone: "phoneNumber",
      }
      const snapshot = await adminDb
        .collection("users")
        .where(fieldMap[type as Exclude<LookupType, "uid">], "==", value)
        .limit(limit)
        .get()
      docs = snapshot.docs
    }

    if (docs.length === 0) {
      return Response.json({ error: "User not found" }, { status: 404 })
    }

    const users = docs.map((doc) => {
      const d = doc.data() ?? {}
      return {
        userId: doc.id,
        email: d.email ?? "",
        fullName: d.fullName ?? "",
        phoneNumber: d.phoneNumber ?? "",
        username: d.username ?? "",
        createdAt: d.createdAt ?? null,
      }
    })

    return Response.json(limit === 1 ? users[0] : { users })
  } catch (err: any) {
    console.error("[GET /api/whoru]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
