/**
 * app/api/teams/route.ts
 *
 * GET  /api/teams?eventId=<id>&action=list
 *   → Returns all collaborators on an event (owner only)
 *
 * GET  /api/teams?eventId=<id>&action=myAccess
 *   → Returns the calling user's collaboration record + limited event data
 *     Used by collaborators when they open event-info
 *
 * POST /api/teams
 *   Body: { eventId, collaboratorEmail, role }
 *   → Looks up user by email (via /api/whoru), creates collaboration doc
 *     Only event owner can call this.
 *
 * PATCH /api/teams
 *   Body: { collaborationId, role }
 *   → Updates role on an existing collaboration (owner only)
 *
 * DELETE /api/teams
 *   Body: { collaborationId }
 *   → Deletes a collaboration doc. Either the owner or the collaborator
 *     themselves can call this (owner removes someone / member exits team).
 */

import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { adminDb } from "@/lib/firebase-admin"
import { verifyAccessToken } from "@/lib/auth-tokens"

const DEV_TAG = "spotix-api-v1"

function ok(data: object, status = 200) {
  return NextResponse.json({ success: true, developer: DEV_TAG, ...data }, { status })
}
function fail(message: string, status: number) {
  return NextResponse.json({ success: false, error: message, developer: DEV_TAG }, { status })
}

// ── Auth ──────────────────────────────────────────────────────────────────────
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

// ── Built-in role permission map (same as client-side) ────────────────────────
const BUILT_IN_ROLES = ["admin", "checkin", "accountant"]

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await authenticate()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  const { searchParams } = new URL(req.url)
  const eventId = searchParams.get("eventId")
  const action  = searchParams.get("action") ?? "list"

  if (!eventId?.trim()) return fail("eventId is required", 400)

  // ── myAccess: called by a collaborator opening an event they don't own ──────
  if (action === "myAccess") {
    try {
      // Find their collab record for this event.
      // Query on two equality fields only — filter isActive in memory
      // to avoid requiring a composite Firestore index.
      const collabSnap = await adminDb
        .collection("collaborations")
        .where("eventId", "==", eventId)
        .where("collaboratorId", "==", userId)
        .get()

      const activeDoc = collabSnap.docs.find((d) => d.data().isActive === true) ?? null

      if (!activeDoc) {
        return fail("You are not a collaborator on this event", 403)
      }
      // Re-alias so the rest of the handler is unchanged
      const collabSnap_active = { docs: [activeDoc], empty: false }

      const collabDoc  = collabSnap_active.docs[0]
      const collabData = collabDoc.data()

      // Fetch the event doc (no ownership check needed — collab grants read)
      const eventDoc = await adminDb.collection("events").doc(eventId).get()
      if (!eventDoc.exists) return fail("Event not found", 404)

      const ev = eventDoc.data()!

      // Fetch attendees so the checkin role can see them
      const attendeesSnap = await adminDb
        .collection("events")
        .doc(eventId)
        .collection("attendees")
        .get()

      const attendees = attendeesSnap.docs.map((d) => {
        const a = d.data()
        return {
          id: d.id,
          fullName: a.fullName ?? "Unknown",
          email: a.email ?? "",
          ticketType: a.ticketType ?? "Standard",
          verified: a.verified ?? false,
          purchaseDate: a.purchaseDate ?? "",
          purchaseTime: a.purchaseTime ?? "",
          ticketReference: a.ticketReference ?? "",
          facialEnroll: a.faceEmbedding ? "enrolled" : "unenrolled",
        }
      })

      return ok({
        collaboration: {
          collaborationId: collabDoc.id,
          role: collabData.role,
          ownerId: collabData.ownerId,
          addedAt: collabData.addedAt ?? null,
          // permissions array — present for custom roles, null for built-in
          permissions: collabData.permissions ?? null,
        },
        eventData: {
          id: eventDoc.id,
          eventName: ev.eventName ?? "",
          eventVenue: ev.eventVenue ?? "",
          eventDate: ev.eventDate ? (ev.eventDate.toDate?.() ?? new Date(ev.eventDate)).toISOString() : "",
          eventType: ev.eventType ?? "",
          eventDescription: ev.eventDescription ?? "",
          isFree: ev.isFree ?? true,
          ticketPrices: ev.ticketPrices ?? [],
          createdBy: ev.organizerId ?? "",
          totalCapacity: ev.totalCapacity ?? 0,
          ticketsSold: ev.ticketsSold ?? 0,
          totalRevenue: ev.revenue ?? 0,
          status: ev.status ?? "active",
          eventStart: ev.eventStart ?? "",
          eventEnd: ev.eventEnd ?? "",
          eventEndDate: ev.eventEndDate ?? "",
          enableMaxSize: ev.enableMaxSize ?? false,
          maxSize: ev.maxSize ?? "",
          enableColorCode: ev.enableColorCode ?? false,
          colorCode: ev.colorCode ?? "",
          enableStopDate: ev.enableStopDate ?? false,
          stopDate: ev.stopDate ?? "",
          payId: ev.payId ?? "",
          eventImage: ev.eventImage ?? "",
        },
        attendees,
      })
    } catch (e: any) {
      console.error("[GET /api/teams myAccess]", e)
      return fail("Internal server error", 500)
    }
  }

  // ── list: owner fetches all collaborators for an event ─────────────────────
  if (action === "list") {
    // Verify ownership
    const eventDoc = await adminDb.collection("events").doc(eventId).get()
    if (!eventDoc.exists) return fail("Event not found", 404)
    if (eventDoc.data()!.organizerId !== userId) return fail("Forbidden", 403)

    try {
      // Query single field, filter isActive in memory to avoid composite index
      const collabSnap = await adminDb
        .collection("collaborations")
        .where("eventId", "==", eventId)
        .get()

      const activeCollabs = collabSnap.docs.filter((d) => d.data().isActive === true)

      const collaborators = await Promise.all(
        activeCollabs.map(async (doc) => {
          const d = doc.data()
          // Fetch collaborator display name
          let displayName = d.collaboratorEmail ?? ""
          try {
            const userDoc = await adminDb.collection("users").doc(d.collaboratorId).get()
            if (userDoc.exists) {
              displayName = userDoc.data()?.fullName ?? displayName
            }
          } catch { /* non-critical */ }

          return {
            collaborationId: doc.id,
            collaboratorId: d.collaboratorId,
            collaboratorEmail: d.collaboratorEmail ?? "",
            displayName,
            role: d.role,
            permissions: d.permissions ?? null,
            addedAt: d.addedAt ?? null,
          }
        })
      )

      return ok({ collaborators })
    } catch (e: any) {
      console.error("[GET /api/teams list]", e)
      return fail("Internal server error", 500)
    }
  }

  return fail("Invalid action. Use 'list' or 'myAccess'.", 400)
}

// ── POST — add collaborator ───────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await authenticate()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  let body: Record<string, any>
  try { body = await req.json() } catch { return fail("Invalid JSON body", 400) }

  const { eventId, collaboratorEmail, role } = body

  if (!eventId?.trim())           return fail("eventId is required", 400)
  if (!collaboratorEmail?.trim()) return fail("collaboratorEmail is required", 400)
  if (!role?.trim())              return fail("role is required", 400)

  // Verify ownership
  const eventDoc = await adminDb.collection("events").doc(eventId).get()
  if (!eventDoc.exists) return fail("Event not found", 404)
  if (eventDoc.data()!.organizerId !== userId) return fail("Only the event owner can add team members", 403)

  // Check collaboration is enabled on the owner's profile
  const ownerDoc = await adminDb.collection("users").doc(userId).get()
  if (!ownerDoc.data()?.enabledCollaboration) {
    return fail("You must enable collaboration in your profile settings first", 400)
  }

  try {
    // Look up the collaborator by email
    const usersSnap = await adminDb
      .collection("users")
      .where("email", "==", collaboratorEmail.trim().toLowerCase())
      .limit(1)
      .get()

    if (usersSnap.empty) return fail("No Spotix account found with that email address", 404)

    const collaboratorDoc  = usersSnap.docs[0]
    const collaboratorId   = collaboratorDoc.id

    if (collaboratorId === userId) return fail("You cannot add yourself as a collaborator", 400)

    // Check not already active
    const existingSnap = await adminDb
      .collection("collaborations")
      .where("eventId", "==", eventId)
      .where("collaboratorId", "==", collaboratorId)
      .where("isActive", "==", true)
      .limit(1)
      .get()

    if (!existingSnap.empty) return fail("This person is already a collaborator on this event", 409)

    // Create collaboration doc
    // permissions is only set for custom roles; built-in roles use the
    // hardcoded map on the client so we store null for them
    const isBuiltIn = ["admin", "checkin", "accountant"].includes(role.trim())
    const collabRef = await adminDb.collection("collaborations").add({
      collaboratorId,
      collaboratorEmail: collaboratorEmail.trim().toLowerCase(),
      ownerId: userId,
      eventId,
      role: role.trim(),
      permissions: isBuiltIn ? null : (body.permissions ?? []),
      isActive: true,
      addedAt: new Date().toISOString(),
    })

    return ok({
      message: "Collaborator added successfully",
      collaborationId: collabRef.id,
      collaboratorId,
      displayName: collaboratorDoc.data()?.fullName ?? collaboratorEmail,
      role: role.trim(),
    }, 201)
  } catch (e: any) {
    console.error("[POST /api/teams]", e)
    return fail("Internal server error", 500)
  }
}

// ── PATCH — update role ───────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const auth = await authenticate()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  let body: Record<string, any>
  try { body = await req.json() } catch { return fail("Invalid JSON body", 400) }

  const { collaborationId, role, permissions: bodyPermissions } = body
  // Re-expose as body.permissions for the update call below
  body.permissions = bodyPermissions
  if (!collaborationId?.trim()) return fail("collaborationId is required", 400)
  if (!role?.trim())            return fail("role is required", 400)

  try {
    const collabRef  = adminDb.collection("collaborations").doc(collaborationId)
    const collabSnap = await collabRef.get()

    if (!collabSnap.exists) return fail("Collaboration not found", 404)
    if (collabSnap.data()!.ownerId !== userId) return fail("Only the event owner can change roles", 403)

    const isBuiltIn = ["admin", "checkin", "accountant"].includes(role.trim())
    await collabRef.update({
      role: role.trim(),
      permissions: isBuiltIn ? null : (body.permissions ?? []),
    })

    return ok({ message: "Role updated successfully", role: role.trim(), permissions: isBuiltIn ? null : (body.permissions ?? []) })
  } catch (e: any) {
    console.error("[PATCH /api/teams]", e)
    return fail("Internal server error", 500)
  }
}

// ── DELETE — remove collaborator or exit team ─────────────────────────────────
export async function DELETE(req: NextRequest) {
  const auth = await authenticate()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  let body: Record<string, any>
  try { body = await req.json() } catch { return fail("Invalid JSON body", 400) }

  const { collaborationId } = body
  if (!collaborationId?.trim()) return fail("collaborationId is required", 400)

  try {
    const collabRef  = adminDb.collection("collaborations").doc(collaborationId)
    const collabSnap = await collabRef.get()

    if (!collabSnap.exists) return fail("Collaboration not found", 404)

    const collab = collabSnap.data()!

    // Allow both the event owner AND the collaborator themselves to delete
    const isOwner        = collab.ownerId === userId
    const isCollaborator = collab.collaboratorId === userId

    if (!isOwner && !isCollaborator) {
      return fail("You do not have permission to remove this collaboration", 403)
    }

    await collabRef.delete()

    return ok({ message: isCollaborator ? "You have exited the team" : "Collaborator removed successfully" })
  } catch (e: any) {
    console.error("[DELETE /api/teams]", e)
    return fail("Internal server error", 500)
  }
}