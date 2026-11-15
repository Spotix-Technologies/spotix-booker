/**
 * lib/maps/limits.ts
 *
 * Picks which map provider an organizer's map-picker session should use,
 * and tracks daily usage — cheaply.
 *
 * COST MODEL — why a "session", not a call:
 * Every provider here bills (or free-tier-meters) per *search session*
 * when you use session tokens correctly (this is literally what Google's
 * Places Autocomplete session-token billing is for: unlimited keystrokes
 * + one Place Details call = one billed session, instead of one billed
 * call per keystroke). So the daily counter in Firestore is incremented
 * exactly ONCE per map-picker session (when the modal opens and reserves
 * a provider) — not once per keystroke, drag, or reverse-geocode. The
 * `sessionToken` handed back to the client is threaded through every
 * autocomplete/reverse/place-details call for that session so the
 * provider itself can bill/group it as one unit.
 *
 * FIRESTORE READS/WRITES — kept to the minimum per session:
 *   - 2 reads (in parallel): per-user overrides doc + today's counts doc
 *   - 1 write: increment the chosen provider's counter for today
 * No reads/writes happen on autocomplete keystrokes, drags, or reverse
 * geocodes — those go straight to the provider via the server proxy
 * routes, keyed off the sessionToken already issued.
 *
 * STORAGE SHAPE:
 *   users/{userId}/settings/mapAccess   — admin-controlled overrides
 *     { google?: { enabled?, dailyLimit? }, mapbox?: {...}, geoapify?: {...} }
 *   users/{userId}/limits/{YYYY-MM-DD}  — today's usage counters
 *     { google?: number, mapbox?: number, geoapify?: number, updatedAt }
 *   Old date docs are small and naturally stop being read/written once
 *   the day passes — no cron cleanup needed for this to stay cheap.
 */

import { randomUUID } from "crypto"
import { adminDb } from "@/lib/firebase-admin"
import { FieldValue } from "firebase-admin/firestore"
import {
  PROVIDER_ORDER,
  NO_PROVIDER_MESSAGE,
  isProviderEnabledByEnv,
  envMaxCalls,
  browserKeyFor,
  todayKey,
} from "./config"
import type { MapAccessOverrides, MapProvider, MapSessionResult } from "./types"

function userDoc(userId: string) {
  return adminDb.collection("users").doc(userId)
}
function mapAccessDoc(userId: string) {
  return userDoc(userId).collection("settings").doc("mapAccess")
}
function limitsDoc(userId: string, dateKey: string) {
  return userDoc(userId).collection("limits").doc(dateKey)
}

/**
 * Reserves one map-provider "session" for this user: checks availability
 * + today's usage for each provider in priority order, increments the
 * first one that has room, and returns the client-facing key/token for
 * it. Returns ok:false with the support message if every provider is
 * unavailable or exhausted.
 */
export async function reserveMapProviderSession(userId: string): Promise<MapSessionResult> {
  const dateKey = todayKey()
  const [overridesSnap, countsSnap] = await Promise.all([
    mapAccessDoc(userId).get(),
    limitsDoc(userId, dateKey).get(),
  ])

  const overrides = (overridesSnap.exists ? overridesSnap.data() : {}) as MapAccessOverrides
  const counts = (countsSnap.exists ? countsSnap.data() : {}) as Partial<Record<MapProvider, number>>

  for (const provider of PROVIDER_ORDER) {
    const override = overrides?.[provider]

    const enabled = override?.enabled ?? isProviderEnabledByEnv(provider)
    if (!enabled) continue

    // A per-user override limit fully replaces the env limit for this
    // user (per the "if a user has a limit on their account, don't use
    // the env limits" rule) — it does not need enabled to also be overridden.
    const limit = override?.dailyLimit ?? envMaxCalls(provider)
    const used = counts?.[provider] ?? 0
    if (used >= limit) continue

    const clientKey = browserKeyFor(provider)
    if (!clientKey) {
      // Misconfigured (no key set for a provider marked available) —
      // skip it rather than handing the client a broken session.
      console.error(`[maps/limits] ${provider} is enabled but has no configured key — skipping`)
      continue
    }

    await limitsDoc(userId, dateKey).set(
      { [provider]: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    )

    return { ok: true, provider, clientKey, sessionToken: randomUUID() }
  }

  return { ok: false, message: NO_PROVIDER_MESSAGE }
}

// ── Admin-facing helpers (read/write overrides from spotix-admin) ──────────

export async function getMapAccessOverrides(userId: string): Promise<MapAccessOverrides> {
  const snap = await mapAccessDoc(userId).get()
  return snap.exists ? (snap.data() as MapAccessOverrides) : {}
}

export async function setMapAccessOverrides(
  userId: string,
  overrides: MapAccessOverrides,
  updatedBy?: string
): Promise<void> {
  await mapAccessDoc(userId).set(
    { ...overrides, updatedAt: FieldValue.serverTimestamp(), updatedBy: updatedBy ?? null },
    { merge: false } // full replace — the admin UI always sends the complete set of 3 providers
  )
}
