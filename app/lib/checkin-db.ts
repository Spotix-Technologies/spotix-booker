// app/lib/checkin-db.ts
//
// Server-side helpers for the online check-in registry — a Supabase mirror
// of an event's Firestore `events/{eventId}/attendees` subcollection (see
// supabase/checkin-registry.sql for the schema + the reasoning for one
// shared table keyed by event_id rather than a table per event).
//
// The whole point of this file is Firestore read/write cost: once an
// event's registry is built, the day-of Check-in tab (QR / manual ticketId
// / email lookup / actually checking someone in) never touches Firestore
// AT ALL — only Supabase. checkInTicket() writes exclusively to
// checkin_registry; Firestore doesn't hear about a check-in until a Push
// happens (manual button or the scheduled auto-sync job).
//
// Two distinct sync directions live here, and they are NOT the same thing:
//   • pullNewSales()          Firestore → Supabase. Brings newly SOLD
//                             tickets into the registry so they're
//                             scannable. Manual "Pull" button only.
//   • pushVerifiedToFirestore()  Supabase → Firestore. The ONLY path by
//                             which check-in state (who's been verified at
//                             the door) ever reaches Firestore, which
//                             stays the source of truth for the Attendees
//                             tab, exports, etc. Driven by the manual
//                             "Push" button and/or the admin-scheduled
//                             one-off pg_cron job (see /api/sync/online) —
//                             never automatically, never per-scan.
//
// Never import this into a "use client" component — it uses supabaseAdmin
// (service role) and adminDb (Firebase Admin SDK), both server-only.

import { supabaseAdmin } from "@/lib/supabase"
import { adminDb } from "@/lib/firebase-admin"

const TABLE = "checkin_registry"
// Firestore page size per read while building/syncing.
const FIRESTORE_BATCH_SIZE = 300
// Rows per Supabase upsert call — keeps request bodies reasonable for
// very large events instead of one giant upsert.
const UPSERT_CHUNK_SIZE = 500

export interface CheckinRegistryRow {
  event_id: string
  ticket_id: string
  full_name: string | null
  email: string | null
  ticket_type: string | null
  purchase_date: string | null
  verified: boolean
  checked_in_at: string | null
  // NOTE: intentionally NOT set by toRow()/upsertRows() below — build and
  // pull only ever touch ticket/attendee fields sourced from Firestore.
  // checked_in_by_uid/name/firestore_synced_at are only ever written by
  // checkInTicket()/pushVerifiedToFirestore(), so a pull (new ticket
  // sales) can never clobber check-in state.
}

function toRow(eventId: string, doc: FirebaseFirestore.QueryDocumentSnapshot): CheckinRegistryRow {
  const a = doc.data()
  const purchaseDate =
    a.purchaseDate && typeof a.purchaseDate.toDate === "function"
      ? a.purchaseDate.toDate().toISOString()
      : null
  return {
    event_id: eventId,
    ticket_id: doc.id,
    full_name: a.fullName ?? null,
    email: a.email ?? null,
    ticket_type: a.ticketType ?? null,
    purchase_date: purchaseDate,
    verified: a.verified ?? false,
    checked_in_at: a.checkedInAt ?? null,
  }
}

async function upsertRows(rows: CheckinRegistryRow[]) {
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE)
    const { error } = await supabaseAdmin
      .from(TABLE)
      .upsert(chunk, { onConflict: "event_id,ticket_id" })
    if (error) throw new Error(`checkin_registry upsert failed: ${error.message}`)
  }
}

// ── Status ──────────────────────────────────────────────────────────────────

export async function getRegistryStatus(eventId: string) {
  const { count, error } = await supabaseAdmin
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
  if (error) throw new Error(`checkin_registry status query failed: ${error.message}`)
  return { exists: (count ?? 0) > 0, count: count ?? 0 }
}

// ── Build (first-time, full) ───────────────────────────────────────────────
// Only meant to run once per event, from the "Start Virtual Registry"
// button. Pages through the whole attendees subcollection oldest-first so
// the incremental sync below has a clean, monotonic purchase_date cursor
// to continue from afterward.

export async function buildVirtualRegistry(eventId: string) {
  const attendeesCol = adminDb.collection("events").doc(eventId).collection("attendees")
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null
  let imported = 0

  while (true) {
    let query = attendeesCol.orderBy("purchaseDate", "asc").limit(FIRESTORE_BATCH_SIZE)
    if (cursor) query = query.startAfter(cursor)

    const snap = await query.get()
    if (snap.empty) break

    await upsertRows(snap.docs.map((d) => toRow(eventId, d)))
    imported += snap.docs.length
    cursor = snap.docs[snap.docs.length - 1]

    if (snap.docs.length < FIRESTORE_BATCH_SIZE) break
  }

  return { imported }
}

// ── Pull (Firestore → Supabase): new ticket sales since last pull ──────────
// Manual only — triggered by the "Pull" button on the Check-in tab. Reads
// only attendees purchased after the newest purchase_date already mirrored,
// never the whole collection again. This is NOT what the scheduler runs;
// see pushVerifiedToFirestore() below for the direction pg_cron drives.

export async function pullNewSales(eventId: string) {
  const { data: latest, error: latestErr } = await supabaseAdmin
    .from(TABLE)
    .select("purchase_date")
    .eq("event_id", eventId)
    .not("purchase_date", "is", null)
    .order("purchase_date", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latestErr) throw new Error(`checkin_registry cursor lookup failed: ${latestErr.message}`)

  // No registry yet for this event — incremental sync doesn't apply; the
  // booker needs to hit "Start Virtual Registry" first.
  if (!latest?.purchase_date) return { imported: 0, skipped: true as const }

  const attendeesCol = adminDb.collection("events").doc(eventId).collection("attendees")
  const cursorDate = new Date(latest.purchase_date as string)

  let imported = 0
  let startAfterDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null

  while (true) {
    let query = attendeesCol.orderBy("purchaseDate", "asc").limit(FIRESTORE_BATCH_SIZE)
    query = startAfterDoc
      ? query.startAfter(startAfterDoc)
      : query.where("purchaseDate", ">", cursorDate)

    const snap = await query.get()
    if (snap.empty) break

    await upsertRows(snap.docs.map((d) => toRow(eventId, d)))
    imported += snap.docs.length
    startAfterDoc = snap.docs[snap.docs.length - 1]

    if (snap.docs.length < FIRESTORE_BATCH_SIZE) break
  }

  return { imported, skipped: false as const }
}

/** Every event that currently has a registry — used by the manual "Pull"
 *  action's callers if ever needed for a sweep (not currently used by any
 *  scheduler — pulling is manual-only, see the module doc comment). */
export async function listRegisteredEventIds(): Promise<string[]> {
  const { data, error } = await supabaseAdmin.from(TABLE).select("event_id")
  if (error) throw new Error(`checkin_registry event list failed: ${error.message}`)
  const ids = new Set((data ?? []).map((r: { event_id: string }) => r.event_id))
  return Array.from(ids)
}

// ── Push (Supabase → Firestore): send verified check-ins back ──────────────
// This is the ONLY path check-in state takes to reach Firestore — see the
// module note at the top of this file. Finds registry rows for this event
// that are verified but haven't been pushed yet (firestore_synced_at IS
// NULL, set the moment a row IS pushed — this function is the only place
// that sets it) and batch-writes them into Firestore. Idempotent and safe
// to run repeatedly or on a schedule.

export async function pushVerifiedToFirestore(eventId: string) {
  const { data: pending, error } = await supabaseAdmin
    .from(TABLE)
    .select("ticket_id, checked_in_at, checked_in_by_name")
    .eq("event_id", eventId)
    .eq("verified", true)
    .is("firestore_synced_at", null)
  if (error) throw new Error(`checkin_registry pending-push query failed: ${error.message}`)
  if (!pending || pending.length === 0) return { pushed: 0 }

  for (let i = 0; i < pending.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = pending.slice(i, i + UPSERT_CHUNK_SIZE)

    const batch = adminDb.batch()
    for (const row of chunk) {
      batch.update(
        adminDb.collection("events").doc(eventId).collection("attendees").doc(row.ticket_id),
        { verified: true, checkedInAt: row.checked_in_at, checkedInBy: row.checked_in_by_name ?? null }
      )
      batch.update(adminDb.collection("tickets").doc(row.ticket_id), { verified: true })
    }
    await batch.commit()

    const nowIso = new Date().toISOString()
    const { error: markErr } = await supabaseAdmin
      .from(TABLE)
      .update({ firestore_synced_at: nowIso })
      .eq("event_id", eventId)
      .in("ticket_id", chunk.map((r) => r.ticket_id))
    if (markErr) throw new Error(`checkin_registry push-marking failed: ${markErr.message}`)
  }

  return { pushed: pending.length }
}

/** Verified rows not yet pushed to Firestore — powers the "N check-ins
 *  haven't synced back yet" indicator on the Check-in tab. */
export async function getPendingPushCount(eventId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("verified", true)
    .is("firestore_synced_at", null)
  if (error) throw new Error(`checkin_registry pending-push count failed: ${error.message}`)
  return count ?? 0
}

// ── Auto sync (admin-scheduled, one specific date/time) ─────────────────────
// NOT a recurring "every few minutes" toggle. An Admin/owner/permitted
// custom role picks an exact date and time; that's handed to Postgres as a
// genuine one-off pg_cron job (pg_cron supports scheduling a job at a
// specific timestamp instead of a recurring cron expression — it runs
// once and pg_cron unschedules it automatically). The job POSTs to
// /api/sync/online for THIS event only, which runs pushVerifiedToFirestore()
// — never pullNewSales(). Stored on the Firestore event doc
// (checkinAutoSyncAt: ISO string | null) so the Check-in tab can show
// "scheduled for <time>" without an extra Supabase round trip, and the
// actual scheduling lives in Postgres via the schedule_checkin_autosync /
// unschedule_checkin_autosync functions (see supabase/checkin-registry.sql)
// — called here through supabaseAdmin.rpc(), not raw SQL, since this app
// only ever talks to Supabase through the JS client.

function autoSyncEndpoint(): string {
  const base = process.env.BOOKER_BASE_URL
  if (!base) throw new Error("BOOKER_BASE_URL is not set — cannot schedule auto sync")
  return `${base.replace(/\/$/, "")}/api/sync/online`
}

export async function scheduleAutoSync(eventId: string, runAt: Date) {
  const secret = process.env.CRON_SYNC_SECRET
  if (!secret) throw new Error("CRON_SYNC_SECRET is not set — cannot schedule auto sync")

  const { error } = await supabaseAdmin.rpc("schedule_checkin_autosync", {
    p_event_id: eventId,
    p_run_at: runAt.toISOString(),
    p_endpoint_url: autoSyncEndpoint(),
    p_cron_secret: secret,
  })
  if (error) throw new Error(`Failed to schedule auto sync: ${error.message}`)

  await adminDb.collection("events").doc(eventId).update({ checkinAutoSyncAt: runAt.toISOString() })
}

export async function cancelAutoSync(eventId: string) {
  const { error } = await supabaseAdmin.rpc("unschedule_checkin_autosync", { p_event_id: eventId })
  if (error) throw new Error(`Failed to cancel auto sync: ${error.message}`)

  await adminDb.collection("events").doc(eventId).update({ checkinAutoSyncAt: null })
}

/** Called by /api/sync/online once the scheduled push actually runs, so
 *  the Check-in tab stops showing "scheduled for <time>" for a job that
 *  already fired (pg_cron already unscheduled itself — this just clears
 *  the Firestore-side mirror of that fact). */
export async function clearAutoSyncSchedule(eventId: string) {
  await adminDb.collection("events").doc(eventId).update({ checkinAutoSyncAt: null })
}

// ── Lookup (QR / manual ticketId / email) ───────────────────────────────────

export async function lookupTicket(eventId: string, opts: { ticketId?: string; email?: string }) {
  let q = supabaseAdmin.from(TABLE).select("*").eq("event_id", eventId)
  if (opts.ticketId?.trim()) q = q.eq("ticket_id", opts.ticketId.trim())
  else if (opts.email?.trim()) q = q.ilike("email", opts.email.trim())
  else throw new Error("ticketId or email is required")

  const { data, error } = await q
  if (error) throw new Error(`checkin_registry lookup failed: ${error.message}`)
  return data ?? []
}

// ── Check a ticket in ────────────────────────────────────────────────────────
// Supabase ONLY. Firestore is intentionally NOT touched here — the whole
// point of the online registry is that a busy door never pays a Firestore
// write per scan. checked_in_at/by/via land in checkin_registry and
// firestore_synced_at is left null (i.e. "pending push"), so the ticket
// only reaches Firestore later, via the manual "Push" button or the
// scheduled auto-sync job (pushVerifiedToFirestore, below) — never as a
// side effect of the scan itself.

export async function checkInTicket(
  eventId: string,
  ticketId: string,
  via: "qr" | "manual" | "email",
  checkedInBy: { uid: string; name: string }
) {
  const nowIso = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update({
      verified: true,
      checked_in_at: nowIso,
      checked_in_via: via,
      checked_in_by_uid: checkedInBy.uid,
      checked_in_by_name: checkedInBy.name,
      // Deliberately left null — see the module note above. This row now
      // sits in pushVerifiedToFirestore()'s "pending" set until a Push
      // (manual or scheduled) actually sends it to Firestore.
      firestore_synced_at: null,
    })
    .eq("event_id", eventId)
    .eq("ticket_id", ticketId)
    .select()
    .maybeSingle()
  if (error) throw new Error(`checkin_registry check-in failed: ${error.message}`)
  if (!data) return null // not in this event's registry

  return data
}
