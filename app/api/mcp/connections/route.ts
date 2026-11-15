/**
 * app/api/mcp/connections/route.ts
 *
 * GET    /api/mcp/connections            — list the signed-in booker's connected MCP apps
 * DELETE /api/mcp/connections?clientId=…  — revoke one
 *
 * Same pattern as app/api/mcp/authorize/route.ts: verify the booker's own
 * spotix_at session here, then call spotix-backend's internal
 * /v1/mcp/oauth/connections endpoints with MCP_OAUTH_INTERNAL_SECRET.
 * spotix-backend stays the only writer of the mcpConnections collection.
 */

import { NextRequest, NextResponse } from "next/server"
import { verifyAccessToken } from "@/lib/auth-tokens"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const DEV_TAG = "API developed and maintained by Spotix Technologies"

function err(error: string, message: string, status: number) {
  return NextResponse.json({ error, message, developer: DEV_TAG }, { status })
}

async function resolveUid(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get("spotix_at")?.value
  if (!token) return null
  try {
    const payload = await verifyAccessToken(token, "spotix-booker")
    return payload.uid
  } catch {
    return null
  }
}

function backendConfig() {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL
  const internalSecret = process.env.MCP_OAUTH_INTERNAL_SECRET
  if (!backendUrl || !internalSecret) return null
  return { backendUrl, internalSecret }
}

export async function GET(request: NextRequest) {
  const uid = await resolveUid(request)
  if (!uid) return err("Unauthorized", "Please sign in to continue", 401)

  const config = backendConfig()
  if (!config) return err("Server Error", "This isn't available right now", 500)

  try {
    const res = await fetch(`${config.backendUrl}/v1/mcp/oauth/connections?uid=${encodeURIComponent(uid)}`, {
      headers: { "x-mcp-internal-secret": config.internalSecret },
      cache: "no-store",
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return err("Bad Request", data.error || "Failed to load connected apps", res.status)
    return NextResponse.json({ success: true, connections: data.connections || [], developer: DEV_TAG })
  } catch (error) {
    console.error("[mcp/connections] GET failed:", error)
    return err("Internal Server Error", "Failed to load connected apps", 500)
  }
}

export async function DELETE(request: NextRequest) {
  const uid = await resolveUid(request)
  if (!uid) return err("Unauthorized", "Please sign in to continue", 401)

  const clientId = request.nextUrl.searchParams.get("clientId")
  if (!clientId) return err("Bad Request", "clientId is required", 400)

  const config = backendConfig()
  if (!config) return err("Server Error", "This isn't available right now", 500)

  try {
    const res = await fetch(
      `${config.backendUrl}/v1/mcp/oauth/connections/${encodeURIComponent(clientId)}?uid=${encodeURIComponent(uid)}`,
      { method: "DELETE", headers: { "x-mcp-internal-secret": config.internalSecret } }
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return err("Bad Request", data.error || "Failed to revoke this connection", res.status)
    return NextResponse.json({ success: true, message: "Connection revoked", developer: DEV_TAG })
  } catch (error) {
    console.error("[mcp/connections] DELETE failed:", error)
    return err("Internal Server Error", "Failed to revoke this connection", 500)
  }
}
