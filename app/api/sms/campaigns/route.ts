/**
 * GET  /api/sms/campaigns?limit=                → this booker's bulk SMS campaigns (newest first)
 * POST /api/sms/campaigns { eventId, name, message, numbers: string[] }
 *
 * POST is the final "Upload" step of the bulk SMS wizard: the backend
 * re-validates every number, writes them to ONE .txt file (one number per
 * line) in Supabase Storage, saves the file url on the sms_campaign row and
 * reserves the booker's SMS credits — all in one go.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireBooker, requireOwnedEvent, getBookerIdentity } from "@/lib/booker-session"
import { callCampaignBackend } from "@/lib/campaign-backend"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const session = await requireBooker()
  if ("error" in session) return session.error
  // Optional ?limit= (the dashboard asks for just the latest 5).
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit")) || 50, 1), 100)
  try {
    const { res, data } = await callCampaignBackend(
      `/sms/campaigns?organizerId=${encodeURIComponent(session.uid)}&limit=${limit}`
    )
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: "Failed to load bulk SMS campaigns" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await requireBooker()
  if ("error" in session) return session.error

  const body = await req.json().catch(() => ({}))
  const { eventId, name, message, numbers } = body || {}
  if (!eventId || !name || !message || !Array.isArray(numbers)) {
    return NextResponse.json({ success: false, error: "eventId, name, message and numbers are required" }, { status: 400 })
  }

  const owned = await requireOwnedEvent(session.uid, eventId)
  if ("error" in owned) return owned.error

  // Username + email for the approved/rejected emails — same users-doc
  // fields /api/user/me returns, read server-side, never from the browser.
  const identity = await getBookerIdentity(session.uid, session.email)

  try {
    const { res, data } = await callCampaignBackend("/sms/campaigns", {
      method: "POST",
      body: JSON.stringify({
        organizerId: session.uid,
        organizerEmail: identity.email,
        organizerUsername: identity.username,
        eventId,
        eventName: owned.event.eventName,
        name,
        message,
        numbers,
      }),
    })
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: "Failed to create bulk SMS" }, { status: 500 })
  }
}
