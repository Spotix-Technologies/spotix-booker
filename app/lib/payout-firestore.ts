/**
 * lib/payout-firestore.ts
 *
 * The only two Firestore responsibilities left in the payout system:
 *
 *   1. Stamping the Supabase payout reference onto the per-day
 *      transaction doc (admin/events|votes/{id}/{date}) so the
 *      Transactions view can show "this day is being paid out under
 *      ref X" without a round-trip to Supabase.
 *
 *   2. Vault holds — the pre-payout multi-signature sign-off state.
 *      Nothing in a Vault hold ever touches Paystack; a hold only ever
 *      RESOLVES into a real Supabase `payouts` row (see
 *      app/api/payout/vault/route.ts) once every participant has
 *      signed off. This replaces the old Firestore `payouts` collection
 *      at status "vault_pending" — same idea, new name, so it's never
 *      confused with the Supabase payouts table.
 */

import { adminDb } from "@/lib/firebase-admin"
import { FieldValue } from "firebase-admin/firestore"

// ── 1. Date-doc reference stamping ──────────────────────────────────────────

export async function writePayoutReferenceOnDateDoc(
  scope: { eventId?: string; pollId?: string; electionId?: string; merchId?: string },
  date: string,
  reference: string
): Promise<void> {
  const root = scope.eventId ? "events" : scope.pollId ? "votes" : scope.electionId ? "elections" : "merch"
  const id = scope.eventId ?? scope.pollId ?? scope.electionId ?? scope.merchId!
  const ref = adminDb.collection("admin").doc(root).collection(id).doc(date)
  try {
    await ref.update({ payoutReference: reference, payoutReferenceAt: FieldValue.serverTimestamp() })
  } catch (err) {
    // Non-critical — the Supabase row is still the source of truth; this
    // is a convenience mirror for the Transactions view only.
    console.warn(`[payout-firestore] Failed to stamp reference on ${root}/${id}/${date}:`, err)
  }
}

// ── 2. Vault holds ───────────────────────────────────────────────────────

export type VaultHoldStatus = "vault_pending" | "released" | "cancelled" | "rejected"

export interface VaultHoldLog {
  type: string
  at: string
  byUid?: string
  byName?: string
  byEmail?: string
  message: string
}

export interface VaultHoldData {
  eventId: string
  eventName: string
  userId: string // initiator
  date: string
  amount: number
  methodId: string
  bankName: string
  bankCode: string
  accountNumber: string
  accountName: string
  recipientCode: string | null
  vaultParticipants: string[]
  vaultSubmissions: Record<string, boolean>
  vaultSubmissionLog: Record<string, string>
  status: VaultHoldStatus
  initiatedByName: string
  initiatedByEmail: string
  createdAt: FirebaseFirestore.FieldValue
  logs: VaultHoldLog[]
  releasedReference?: string | null
}

export async function createVaultHold(data: Omit<VaultHoldData, "createdAt">): Promise<string> {
  const ref = await adminDb.collection("vaultHolds").add({
    ...data,
    createdAt: FieldValue.serverTimestamp(),
  })
  return ref.id
}

export async function getVaultHold(holdId: string) {
  const snap = await adminDb.collection("vaultHolds").doc(holdId).get()
  if (!snap.exists) return null
  return { id: snap.id, ref: snap.ref, data: snap.data() as VaultHoldData }
}

export async function listVaultPendingForEvent(eventId: string) {
  const snap = await adminDb
    .collection("vaultHolds")
    .where("eventId", "==", eventId)
    .where("status", "==", "vault_pending")
    .get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}
