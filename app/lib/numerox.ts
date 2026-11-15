// app/lib/numerox.ts
//
// Server-side Numerox client for spotix-booker. This is the one app in
// the Spotix ecosystem that reads funnel stats back (the Observability
// tab/page) — spotix-user and spotix-backend are track-only.
//
// Deliberately built WITHOUT a Numerox `authorizer`. Booker already has
// its own, richer per-event access control — resolveEventAccess() /
// hasTab() in app/lib/event-access.ts, which understands not just the
// event owner but collaborators granted the "observability" tab. That
// check happens in every route BEFORE numerox.stats.get() is ever
// called (see app/api/event/list/[eventId]/observability/route.ts and
// app/api/observability/route.ts), so by the time this client is used
// the caller is already known to be allowed to see this data — passing
// no authorizer here is the documented "trusted caller" mode from
// numerox's own README, not an oversight.
//
// One important correction from Numerox's original build spec: Spotix's
// event ownership field is `organizerId`, not `creatorId` — irrelevant
// to this file specifically (no authorizer configured), but worth
// knowing if an authorizer is ever added here later.
//
// `maxDaysFetch` is intentionally NOT fixed here — it varies per
// request (an event's own admin-configured retention override, or 5 for
// the all-events aggregate view). See lib/numerox-max-days.ts. Each
// route builds its own short-lived client via getNumeroxClient(), all
// sharing this one Firestore store instance.

import { createNumeroxClient, type NumeroxClient } from "@drexx-codes/numerox"
import { FirestoreNumeroxStore } from "@drexx-codes/numerox/firestore"
import { adminDb } from "@/lib/firebase-admin"

const numeroxStore = new FirestoreNumeroxStore({ db: adminDb })

const numeroxLogger = {
  debug: () => {},
  info: () => {},
  warn: (message: string, meta?: Record<string, unknown>) => console.warn(`[numerox] ${message}`, meta ?? ""),
  error: (message: string, meta?: Record<string, unknown>) => console.error(`[numerox] ${message}`, meta ?? ""),
}

/** Builds a Numerox client scoped to a specific maxDaysFetch ceiling.
 * Cheap — shares the one Firestore store instance above, just wires a
 * new StatsService around it. Call this per-request with whatever
 * ceiling applies (see lib/numerox-max-days.ts), never cache the
 * result across requests with different callers/events. */
export function getNumeroxClient(maxDaysFetch: number): NumeroxClient {
  return createNumeroxClient({
    store: numeroxStore,
    maxDaysFetch,
    appName: "spotix-booker",
    environment: process.env.NODE_ENV === "production" ? "production" : "development",
    logger: numeroxLogger,
  })
}
