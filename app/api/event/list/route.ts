// app/api/events/list/route.ts
// Auth: reads the spotix_at httpOnly cookie and verifies it directly.
// Middleware headers (x-user-id etc.) are NOT used here because this route
// is called from the client browser — middleware headers are only available
// to server components / server actions in the same request chain.

import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { adminDb } from "@/lib/firebase-admin"
import { verifyAccessToken } from "@/lib/auth-tokens"

const DEV_TAG = "spotix-api-v1"

function ok(data: object) {
  return NextResponse.json({ success: true, developer: DEV_TAG, ...data })
}

function fail(message: string, status: number) {
  return NextResponse.json({ success: false, error: message, developer: DEV_TAG }, { status })
}

// ─── Auth helper ─────────────────────────────────────────────────────────────
async function authenticate(): Promise<{ userId: string } | NextResponse> {
  const cookieStore = await cookies()
  const token = cookieStore.get("spotix_at")?.value

  if (!token) return fail("No access token", 401)

  try {
    const payload = await verifyAccessToken(token, "spotix-booker")
    return { userId: payload.uid }
  } catch {
    return fail("Invalid or expired access token", 401)
  }
}

// ─── GET /api/events/list?action=owned|collaborated ───────────────────────────
export async function GET(req: NextRequest) {
  const auth = await authenticate()
  if (auth instanceof NextResponse) return auth

  const { userId } = auth
  const action = new URL(req.url).searchParams.get("action") ?? "owned"

  try {
    if (action === "owned")        return await handleOwned(userId)
    if (action === "collaborated") return await handleCollaborated(userId)
    return fail("Invalid action. Use 'owned' or 'collaborated'.", 400)
  } catch (e) {
    console.error("[/api/events/list]", e)
    return fail("Internal server error", 500)
  }
}

// ─── PATCH /api/events/list — pause or resume an event ───────────────────────
// Body: { eventId: string, action: "pause" | "resume" }
export async function PATCH(req: NextRequest) {
  const auth = await authenticate()
  if (auth instanceof NextResponse) return auth

  const { userId } = auth

  let body: { eventId?: string; action?: string }
  try {
    body = await req.json()
  } catch {
    return fail("Invalid JSON body", 400)
  }

  const { eventId, action } = body

  if (!eventId) return fail("eventId is required", 400)
  if (action !== "pause" && action !== "resume") {
    return fail("action must be 'pause' or 'resume'", 400)
  }

  try {
    const eventRef = adminDb.collection("events").doc(eventId)
    const eventDoc = await eventRef.get()

    if (!eventDoc.exists) return fail("Event not found", 404)

    const data = eventDoc.data()!

    // Ownership check — only the organizer can pause/resume
    if (data.organizerId !== userId) {
      return fail("Forbidden: you do not own this event", 403)
    }

    // Date check — only future events can be paused or resumed
    const eventDate: Date = data.eventDate?.toDate?.() ?? new Date(data.eventDate)
    if (eventDate <= new Date()) {
      return fail("Only future events can be paused or resumed", 400)
    }

    if (action === "pause") {
      if (data.status !== "active") {
        return fail("Only active events can be paused", 400)
      }
      await eventRef.update({ status: "inactive" })
      return ok({ message: "Event paused successfully" })
    }

    // action === "resume"
    if (data.status !== "inactive") {
      return fail("Only inactive events can be resumed", 400)
    }
    await eventRef.update({ status: "active" })
    return ok({ message: "Event resumed successfully" })

  } catch (e) {
    console.error("[/api/events/list PATCH]", e)
    return fail("Internal server error", 500)
  }
}

// ─── Owned events ─────────────────────────────────────────────────────────────
async function handleOwned(userId: string) {
  const snapshot = await adminDb
    .collection("events")
    .where("organizerId", "==", userId)
    .get()

  const now = new Date()
  const events = snapshot.docs.map((doc) => shapeEvent(doc.id, doc.data(), now))

  return ok({ events })
}

// ─── Collaborated events ──────────────────────────────────────────────────────
async function handleCollaborated(userId: string) {
  const collabSnap = await adminDb
    .collection("collaborations")
    .where("collaboratorId", "==", userId)
    .where("isActive", "==", true)
    .get()

  if (collabSnap.empty) return ok({ events: [] })

  const now = new Date()

  const fetches = collabSnap.docs.map(async (collabDoc) => {
    const { eventId, ownerId, role } = collabDoc.data()
    try {
      const eventDoc = await adminDb.collection("events").doc(eventId).get()
      if (!eventDoc.exists) return null

      const data = eventDoc.data()!
      if (data.enabledCollaboration !== true) return null

      return {
        ...shapeEvent(eventDoc.id, data, now),
        ownerId,
        role: role ?? "viewer",
      }
    } catch {
      return null
    }
  })

  const results = await Promise.all(fetches)
  const events = results.filter(Boolean)

  return ok({ events })
}

// ─── Shared shaper ────────────────────────────────────────────────────────────
function shapeEvent(id: string, data: FirebaseFirestore.DocumentData, now: Date) {
  const eventDate = data.eventDate?.toDate?.() ?? new Date(data.eventDate)
  const isPast = eventDate < now

  return {
    id,
    eventName:     data.eventName    ?? "Unnamed Event",
    eventDate:     eventDate.toISOString(),
    eventType:     data.eventType    ?? "Other",
    isFree:        data.isFree       ?? false,
    ticketsSold:   data.ticketsSold  ?? 0,
    totalCapacity: data.enableMaxSize ? parseInt(data.maxSize, 10) : null,
    revenue:       data.totalRevenue      ?? 0,
    status:        mapStatus(data.status, isPast),
    eventVenue:    data.eventVenue   ?? "No venue specified",
    hasMaxSize:    data.enableMaxSize ?? false,
  }
}

function mapStatus(
  s: string | undefined,
  isPast: boolean
): "active" | "past" | "inactive" | "cancelled" | "completed" {
  if (s === "cancelled") return "cancelled"
  if (s === "completed") return "completed"
  if (s === "inactive")  return "inactive"
  return isPast ? "past" : "active"
}