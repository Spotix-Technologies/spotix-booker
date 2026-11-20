/**
 * lib/edit-history.ts
 *
 * Records "who changed what" on an event into Supabase, orchestrated by
 * spotix-backend (POST /v1/edit-history). Same trusted-relay convention as
 * lib/campaign-backend.ts: this file never touches Supabase itself.
 *
 * Design rules:
 *  - Recording must NEVER slow down or fail the edit it describes. Callers
 *    invoke recordEditHistory() after the Firestore write succeeded and do
 *    not await it; it hands the network call to Next's after() so it runs
 *    once the response has been sent, and swallows every error.
 *  - The backend does the diffing (before/after → changed fields only), so
 *    route handlers just pass the two snapshots.
 */

import { after } from "next/server"

export type EditActor = {
  uid: string
  /** "organizer" = the event's creator; "event_teammate" = collaborator. */
  type: "organizer" | "event_teammate"
  /** owner | admin | checkin | accountant | <custom role name> */
  role: string
  name?: string
}

export type EditHistoryInput = {
  eventId: string
  /** The event's creator uid (NOT necessarily the actor). */
  organizerId: string
  /** snake_case verb, e.g. event_updated, slug_changed, discount_created */
  action: string
  actor: EditActor
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  /** Optional allow-list of keys to diff. */
  fields?: string[]
  /** Pre-computed { field: { before, after } } — used instead of before/after. */
  changes?: Record<string, { before: unknown; after: unknown }>
  reason?: string
}

const TIMEOUT_MS = 4000

/** Firestore Timestamps / Dates → ISO strings, recursively, so they survive JSON. */
export function toPlain(value: unknown, depth = 0): unknown {
  if (value === undefined || value === null) return null
  if (depth > 5) return null
  if (typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString()
  }
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map((v) => toPlain(v, depth + 1))
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toPlain(v, depth + 1)]))
  }
  return value
}

/** Picks `keys` from a doc and makes them JSON-safe. */
export function pickFields(source: Record<string, unknown> | undefined, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of keys) out[key] = toPlain(source?.[key])
  return out
}

/** The event creator acting on their own event. */
export function ownerActor(uid: string): EditActor {
  return { uid, type: "organizer", role: "owner" }
}

/** Actor derived from lib/event-access.ts's resolved access grant. */
export function actorFromAccess(access: { isOwner: boolean; role: string; rawRole: string }, uid: string): EditActor {
  if (access.isOwner) return ownerActor(uid)
  return { uid, type: "event_teammate", role: access.rawRole || access.role }
}

async function send(input: EditHistoryInput) {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL
  const secret = process.env.CRON_SECRET
  if (!backendUrl || !secret) {
    console.error("[edit-history] backend URL or internal secret missing — edit not recorded")
    return
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${backendUrl}/v1/edit-history`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": secret },
      body: JSON.stringify({
        ...input,
        before: input.before ? toPlain(input.before) : undefined,
        after: input.after ? toPlain(input.after) : undefined,
        changes: input.changes ? toPlain(input.changes) : undefined,
        source: "booker",
      }),
      cache: "no-store",
      signal: controller.signal,
    })
    if (!res.ok) console.error(`[edit-history] backend responded ${res.status} for ${input.action} on ${input.eventId}`)
  } catch (err) {
    console.error(`[edit-history] failed to record ${input.action} on ${input.eventId}`, err)
  } finally {
    clearTimeout(timer)
  }
}

/** Fire-and-forget. Safe to call without await; never throws. */
export function recordEditHistory(input: EditHistoryInput): void {
  const task = send(input)
  try {
    after(() => task)
  } catch {
    // Called outside a request scope (e.g. a script) — the promise already runs.
    void task
  }
}

/** Reads a page of history through the backend (used by the history API route). */
export async function fetchEditHistory(eventId: string, opts: { limit?: number; before?: string | null } = {}) {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL
  const secret = process.env.CRON_SECRET
  if (!backendUrl || !secret) throw new Error("Server configuration error: backend URL or internal secret missing")
  const qs = new URLSearchParams({ eventId, limit: String(opts.limit ?? 25) })
  if (opts.before) qs.set("before", opts.before)
  const res = await fetch(`${backendUrl}/v1/edit-history?${qs}`, {
    headers: { "x-internal-secret": secret },
    cache: "no-store",
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `History request failed (${res.status})`)
  return data as { entries: unknown[]; nextCursor: string | null }
}
