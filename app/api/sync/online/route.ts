/**
 * app/api/sync/online/route.ts
 *
 * POST /api/sync/online
 * Body: { eventId: string }
 *
 * Target hit by pg_cron for ONE event's scheduled auto-sync — not a sweep.
 * Auto sync is no longer "every few minutes for every opted-in event"; an
 * Admin/owner/permitted custom role now schedules a single, specific
 * date/time per event (see scheduleAutoSync in app/lib/checkin-db.ts),
 * which Postgres runs as a genuine one-off pg_cron job
 * (schedule_checkin_autosync in supabase/checkin-registry.sql) that POSTs
 * here with that event's id and then unschedules itself.
 *
 * Direction: Supabase → Firestore. This is the ONLY path check-in state
 * (who's been verified at the door) ever reaches Firestore — checkInTicket()
 * writes exclusively to Supabase, never Firestore, so nothing reaches
 * Firestore until a Push happens, manual or scheduled (pushVerifiedToFirestore).
 * This is deliberately NOT the "pull new ticket sales" direction — that's
 * Firestore → Supabase and stays a manual "Pull" button on the Check-in tab.
 *
 * Auth: NOT a booker session — this is called by Postgres, not a browser.
 * Gated by a shared secret header (`x-cron-secret`, checked against
 * CRON_SYNC_SECRET). Never widen this to accept unauthenticated calls.
 */

import { NextRequest, NextResponse } from "next/server"
import { pushVerifiedToFirestore, clearAutoSyncSchedule } from "@/lib/checkin-db"

const DEV_TAG = "spotix-api-v1"

function ok(data: object) {
  return NextResponse.json({ success: true, developer: DEV_TAG, ...data })
}
function fail(message: string, status: number) {
  return NextResponse.json({ success: false, error: message, developer: DEV_TAG }, { status })
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret")
  if (!secret || secret !== process.env.CRON_SYNC_SECRET) {
    return fail("Unauthorized", 401)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return fail("Invalid JSON body", 400)
  }

  const eventId = (body.eventId as string | undefined)?.trim()
  if (!eventId) return fail("eventId is required", 400)

  try {
    const { pushed } = await pushVerifiedToFirestore(eventId)
    // The job already unscheduled itself in Postgres (it was one-off) —
    // this just clears the Firestore-side "scheduled for <time>" mirror
    // so the Check-in tab reflects that it ran.
    await clearAutoSyncSchedule(eventId)
    return ok({ eventId, pushed })
  } catch (e: any) {
    console.error(`[POST /api/sync/online] push failed for ${eventId}`, e)
    return fail("Push failed", 500)
  }
}
