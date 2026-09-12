// app/lib/team-tabs.ts
//
// Single source of truth for "which tabs can a collaborator see/use on an
// event" — shared between the client (app/event-info/[eventId]/page.tsx,
// app/teams/page.tsx) and every server route that gates access per-tab
// (app/api/event/list/[eventId]/**, app/api/teams).
//
// Previously this map was duplicated inline in page.tsx AND every API
// route re-implemented its own `organizerId === userId` owner-only check,
// which is how Admin ended up with full UI tab access but 403s from most
// of the underlying APIs, and Accountant/Check-in got a stripped-down
// bundle with hardcoded-empty discounts/payouts/charts. Route logic and UI
// visibility must stay in lockstep, hence one shared file for both.

export const ALL_TABS = [
  "overview", "eventlink", "payouts", "attendees", "checkin",
  "discounts", "merch", "referrals", "form", "responses",
  "weather", "transfer", "edit", "teams", "agentRequests", "apiAccess",
] as const

export type TabId = typeof ALL_TABS[number]

// ── Built-in role → allowed tab IDs ───────────────────────────────────────────
// Admin collaborators have the same event-management controls as organizers,
// including event editing and discount management.
//
// "checkin" (the tab — event-day QR/manual/email check-in tooling) is
// visible by default to the Check-in role, same as Attendees. Admin also
// gets it by default since Admin is meant to see everything short of
// edit/teams/payout-method-creation. It is intentionally NOT in
// `accountant`'s default set, but an owner/Admin can still hand it to a
// custom role via the "checkin" permission below.
export const BUILT_IN_ROLE_TABS: Record<string, TabId[]> = {
  admin: [
    "overview", "eventlink", "payouts", "attendees", "checkin", "discounts", "merch",
    "referrals", "form", "responses", "weather", "transfer", "edit",
    "teams", "agentRequests", "apiAccess",
  ],
  checkin:    ["attendees", "checkin", "eventlink", "weather", "form", "responses"],
  accountant: ["overview", "eventlink", "payouts", "discounts", "merch"],
}

// Maps permission IDs (stored in Firestore for custom roles) → TabId.
// Note "edit", "teams", and "agentRequests" are intentionally NOT
// mappable — a custom role can never be granted event-editing, team
// management, or agent-request handling; those stay owner/admin-only.
export const PERMISSION_TO_TAB: Record<string, TabId> = {
  overview:  "overview",
  attendees: "attendees",
  checkin:   "checkin",
  payouts:   "payouts",
  discounts: "discounts",
  merch:     "merch",
  referrals: "referrals",
  form:      "form",
  responses: "responses",
  weather:   "weather",
  share:     "eventlink",
  transfer:  "transfer",
  apiAccess: "apiAccess",
}

export type CollabRoleKind = "owner" | "admin" | "checkin" | "accountant" | "custom"

export function roleKind(role: string): CollabRoleKind {
  if (role === "admin" || role === "checkin" || role === "accountant") return role
  return "custom"
}

// ── Resolve which tabs a user can see/use ─────────────────────────────────────
export function resolveVisibleTabs(
  isOwner: boolean,
  role: string | null,
  permissions: string[] | null
): TabId[] {
  if (isOwner) return [...ALL_TABS]
  if (!role) return []

  if (role in BUILT_IN_ROLE_TABS) return BUILT_IN_ROLE_TABS[role]

  if (Array.isArray(permissions) && permissions.length > 0) {
    return permissions
      .map((p) => PERMISSION_TO_TAB[p.toLowerCase()])
      .filter((t): t is TabId => Boolean(t))
  }

  return []
}
