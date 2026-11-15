/**
 * app/api/mcp/authorize/route.ts
 *
 * POST /api/mcp/authorize
 *
 * Called by app/mcp/authorize/client.tsx AFTER the booker has (a) an
 * active spotix_at session and (b) clicked "Allow" on the consent
 * screen. This route is the ONLY thing standing between "booker clicked
 * Allow" and an authorization code existing — it:
 *
 *   1. Verifies the booker's own session cookie (spotix_at) server-side,
 *      never trusting anything the client claims about who's logged in.
 *   2. Forwards the already-validated OAuth request parameters plus the
 *      resolved uid/email/username to spotix-backend's internal
 *      POST /v1/mcp/oauth/authorize, authenticated with a dedicated
 *      shared secret (MCP_OAUTH_INTERNAL_SECRET — deliberately separate
 *      from CRON_SECRET, see lib/payout-backend.ts for the more common
 *      x-internal-secret/CRON_SECRET pattern this intentionally does NOT
 *      reuse, to keep this integration's blast radius contained).
 *   3. Returns the redirect URL spotix-backend built (client_id's
 *      redirect_uri + ?code=&state=) — the browser does the actual
 *      redirect, not this route (keeps the 3xx / CORS story simple and
 *      matches how every other OAuth AS's hosted login page works).
 *
 * spotix-backend remains the sole writer of the mcpAuthCodes collection
 * (and every other MCP OAuth collection) — this route never touches
 * Firestore for that directly.
 */

import { NextRequest, NextResponse } from "next/server"
import { verifyAccessToken } from "@/lib/auth-tokens"
import { adminDb } from "@/lib/firebase-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const DEV_TAG = "API developed and maintained by Spotix Technologies"

function err(error: string, message: string, status: number) {
  return NextResponse.json({ error, message, developer: DEV_TAG }, { status })
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("spotix_at")?.value
    if (!token) return err("Unauthorized", "Please sign in to continue", 401)

    let uid: string
    let email: string
    try {
      const payload = await verifyAccessToken(token, "spotix-booker")
      uid = payload.uid
      email = payload.email
    } catch {
      return err("Unauthorized", "Your session has expired — please sign in again", 401)
    }

    const userDoc = await adminDb.collection("users").doc(uid).get()
    if (!userDoc.exists) return err("Not Found", "User profile not found", 404)
    const userData = userDoc.data()!
    const isBooker = userData.isBooker || userData.role === "booker"
    if (!isBooker) {
      return err("Forbidden", "This connection is for Spotix Booker accounts only", 403)
    }
    const username: string = userData.username || userData.bookerName || userData.fullName || ""

    const body = await request.json().catch(() => ({}))
    const { clientId, redirectUri, scope, codeChallenge, codeChallengeMethod, state } = body || {}

    if (!clientId || !redirectUri || !codeChallenge || !codeChallengeMethod) {
      return err("Bad Request", "Missing required authorization parameters", 400)
    }

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL
    const internalSecret = process.env.MCP_OAUTH_INTERNAL_SECRET
    if (!backendUrl || !internalSecret) {
      console.error("[mcp/authorize] NEXT_PUBLIC_BACKEND_URL or MCP_OAUTH_INTERNAL_SECRET missing")
      return err("Server Error", "This connection can't be completed right now", 500)
    }

    const backendResponse = await fetch(`${backendUrl}/v1/mcp/oauth/authorize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mcp-internal-secret": internalSecret,
      },
      body: JSON.stringify({
        uid,
        email,
        username,
        clientId,
        redirectUri,
        scope,
        codeChallenge,
        codeChallengeMethod,
        state,
      }),
    })

    const backendData = await backendResponse.json().catch(() => ({}))

    if (!backendResponse.ok) {
      return err(
        backendData.error || "Bad Request",
        backendData.error_description || backendData.message || "This connection request couldn't be completed",
        backendResponse.status
      )
    }

    return NextResponse.json({ success: true, redirectUrl: backendData.redirectUrl, developer: DEV_TAG })
  } catch (error) {
    console.error("[mcp/authorize] Unexpected error:", error)
    return err("Internal Server Error", "An unexpected error occurred", 500)
  }
}
