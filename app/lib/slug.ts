/**
 * lib/slug.ts
 *
 * Shared slug helpers for the eventSlug feature (item 5 of the Sep 2026 UI
 * renovation). eventId stays the Firestore document id and the internal key
 * used everywhere (auth, payments, admin, analytics) — eventSlug is purely
 * an additional, human-readable, editable field used to build the public
 * share link: `${NEXT_PUBLIC_SPOTIX_USER}/event/{eventSlug}`.
 *
 * Used both client-side (live preview as the organizer types the event
 * name, and when they hand-edit the slug field) and server-side in
 * app/api/event/one/route.ts (to finalize a unique slug at creation time —
 * never trust the client's uniqueness check alone, it's a UX nicety, not
 * the source of truth).
 */

const MIN_LENGTH = 3
const MAX_LENGTH = 60

/** Turns free text into a URL-safe slug: lowercase, hyphen-separated,
 *  alphanumerics only. Doesn't enforce length — see isValidSlug for that. */
export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_LENGTH)
}

export function isValidSlug(slug: string): boolean {
  if (!slug) return false
  if (slug.length < MIN_LENGTH || slug.length > MAX_LENGTH) return false
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)
}

export const SLUG_RULES_HINT =
  "3–60 characters, lowercase letters, numbers, and hyphens only"

/** Appends a short numeric suffix (event-name-2, event-name-3, ...) when a
 *  slug is already taken. Called in a retry loop server-side. */
export function withSuffix(base: string, attempt: number): string {
  if (attempt <= 1) return base
  const suffix = `-${attempt}`
  const trimmedBase = base.slice(0, MAX_LENGTH - suffix.length)
  return `${trimmedBase}${suffix}`
}
