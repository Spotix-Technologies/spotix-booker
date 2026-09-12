// app/lib/event-access.ts
//
// Shared server-side "can this user act on this event, and with which
// tabs" resolver. Every event-info sub-route (main bundle, referrals,
// merch, agent-requests, teams) should resolve access through this
// instead of re-implementing its own `organizerId === userId` check —
// that pattern is how Admin collaborators ended up 403'd everywhere
// despite having full tab access in the UI.
//
// Mirrors app/lib/payout-access.ts's shape/spirit but for the general
// event-info surface (payouts keeps its own resolver since it has an
// extra "whose bank account" concern that doesn't apply here).

import { adminDb } from "@/lib/firebase-admin"
import { BUILT_IN_ROLE_TABS, PERMISSION_TO_TAB, ALL_TABS, TabId, CollabRoleKind } from "@/lib/team-tabs"

export type EventAccessResult =
  | {
      ok: true
      isOwner: boolean
      /** The event's actual creator — use this (not the caller's uid) for
       *  anything that should be identical regardless of who's viewing,
       *  e.g. bookerBVT, "organizerId" fields written back onto records. */
      organizerId: string
      /** The calling user's relationship to this event. */
      role: CollabRoleKind
      /** Raw role string as stored on the collaboration doc — same as
       *  `role` for built-ins, but preserves the actual custom role name
       *  (e.g. "Marketing") when role === "custom". Empty string for owner. */
      rawRole: string
      /** Raw collaboration doc id — null for the owner. */
      collaborationId: string | null
      /** Permissions array for custom roles, null for built-ins/owner. */
      permissions: string[] | null
      tabs: TabId[]
      eventRef: FirebaseFirestore.DocumentReference
      eventSnap: FirebaseFirestore.DocumentSnapshot
    }
  | {
      ok: false
      error: string
      status: number
    }

export async function resolveEventAccess(
  eventId: string,
  userId: string
): Promise<EventAccessResult> {
  const eventRef = adminDb.collection("events").doc(eventId)
  const eventSnap = await eventRef.get()
  if (!eventSnap.exists) return { ok: false, error: "Event not found", status: 404 }

  const organizerId = eventSnap.data()!.organizerId as string

  if (organizerId === userId) {
    return {
      ok: true, isOwner: true, organizerId, role: "owner", rawRole: "owner",
      collaborationId: null, permissions: null, tabs: [...ALL_TABS], eventRef, eventSnap,
    }
  }

  const collabSnap = await adminDb
    .collection("collaborations")
    .where("eventId", "==", eventId)
    .where("collaboratorId", "==", userId)
    .where("isActive", "==", true)
    .limit(1)
    .get()

  if (collabSnap.empty) {
    return { ok: false, error: "Forbidden: you do not have access to this event", status: 403 }
  }

  const collabDoc = collabSnap.docs[0]
  const collab = collabDoc.data()
  const role: CollabRoleKind =
    collab.role === "admin" || collab.role === "checkin" || collab.role === "accountant"
      ? collab.role
      : "custom"

  const permissions: string[] | null = role === "custom" ? (Array.isArray(collab.permissions) ? collab.permissions : []) : null

  const tabs: TabId[] =
    role in BUILT_IN_ROLE_TABS
      ? BUILT_IN_ROLE_TABS[role]
      : (permissions ?? [])
          .map((p: string) => PERMISSION_TO_TAB[p.toLowerCase()])
          .filter((t: TabId | undefined): t is TabId => Boolean(t))

  return {
    ok: true, isOwner: false, organizerId, role, rawRole: collab.role, collaborationId: collabDoc.id,
    permissions, tabs, eventRef, eventSnap,
  }
}

/** True if this access grant includes the given tab. */
export function hasTab(access: Extract<EventAccessResult, { ok: true }>, tab: TabId): boolean {
  return access.tabs.includes(tab)
}

/** Owner or Admin only — used for actions with full-parity-minus-edit semantics
 *  (toggling discounts, apiAccess settings, agent activity, teams management). */
export function isOwnerOrAdmin(access: Extract<EventAccessResult, { ok: true }>): boolean {
  return access.role === "owner" || access.role === "admin"
}

/** Who can schedule/cancel the Check-in tab's auto-sync-back-to-Firestore
 *  job: the owner, the built-in Admin role, or a CUSTOM role that's been
 *  explicitly granted the "checkin" permission. Deliberately excludes the
 *  built-in "checkin" role (door staff) and "accountant" — scheduling an
 *  automated Firestore write is a step above day-of scanning. */
export function canManageCheckinAutoSync(access: Extract<EventAccessResult, { ok: true }>): boolean {
  if (access.role === "owner" || access.role === "admin") return true
  if (access.role === "custom") return access.tabs.includes("checkin")
  return false
}
