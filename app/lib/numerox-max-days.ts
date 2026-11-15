// app/lib/numerox-max-days.ts
// The all-events aggregate view (app/api/observability/route.ts) does
// NOT consult per-event overrides — it always uses the 5-day default,
// regardless of what any individual event's override says. Overrides
// exist for drilling into one event's history (e.g. post-event
// reporting), not for inflating the org-wide aggregate.

export const DEFAULT_OBSERVABILITY_MAX_DAYS = 5
// Mirrors numerox's own ABSOLUTE_MAX_DAYS_FETCH ceiling — an admin
// override can never exceed this regardless of what's written to
// Firestore (defense in depth; spotix-admin's PATCH route also caps it
// at write time).
export const OBSERVABILITY_MAX_DAYS_CEILING = 366

/** Reads the effective maxDaysFetch for one event from its own document
 * data (already fetched by the caller via resolveEventAccess — this
 * does no I/O itself, just interprets the field). */
export function resolveEventMaxDaysFetch(eventData: Record<string, unknown> | undefined): number {
  const raw = eventData?.numeroxMaxDaysFetch
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) {
    return DEFAULT_OBSERVABILITY_MAX_DAYS
  }
  return Math.min(raw, OBSERVABILITY_MAX_DAYS_CEILING)
}
