/**
 * lib/payout-db.ts
 *
 * All booker-side reads/writes against the Supabase `payouts` table
 * (see /supabase/payout-schema.sql). This is now the single source of
 * truth for an actual payout attempt — the Firestore `payouts`
 * collection is gone; only `vaultHolds` remains in Firestore, for the
 * pre-payout Vault sign-off phase (see lib/vault-holds.ts).
 *
 * Uses the same service-role `supabaseAdmin` client already set up for
 * the nominations system (lib/supabase.ts) — same Supabase project.
 */

import { supabaseAdmin } from "@/lib/supabase"
import { generatePayoutReference } from "@/lib/payout-reference"
import { buildNarration } from "@/lib/payout-backend"
import { DuplicateRequestError, isPayoutUniqueViolation } from "@/lib/payout-idempotency"

export interface PayoutMethodSnapshot {
  methodId: string
  bankName: string
  bankCode: string
  accountNumber: string
  accountName: string
  recipientCode: string | null
}

export interface CreatePayoutRowInput {
  isEvent: boolean
  isPoll: boolean
  isElection?: boolean
  isMerch?: boolean
  eventId?: string | null
  pollId?: string | null
  electionId?: string | null
  merchId?: string | null
  eventName?: string | null
  pollName?: string | null
  electionName?: string | null
  merchName?: string | null
  payDate: string
  userId: string
  amount: number
  method: PayoutMethodSnapshot
  vaultLocked: boolean
}

export interface PayoutRow {
  id: string
  reference: string
  is_event: boolean
  is_poll: boolean
  is_election: boolean
  is_merch: boolean
  event_id: string | null
  poll_id: string | null
  election_id: string | null
  merch_id: string | null
  event_name: string | null
  poll_name: string | null
  election_name: string | null
  merch_name: string | null
  pay_date: string
  user_id: string
  amount: number
  bank_name: string | null
  bank_code: string | null
  account_number: string | null
  account_name: string | null
  recipient_code: string | null
  method_id: string | null
  vault_locked: boolean
  status: "initializing" | "processing" | "successful" | "failed"
  failure_reason: string | null
  transfer_code: string | null
  paystack_reference: string | null
  narration: string | null
  duration_seconds: number
  created_at: string
  processing_at: string | null
  resolved_at: string | null
  updated_at: string
}

/**
 * Inserts a new "initializing" row and returns it. This is the moment
 * "the payout" formally begins — call this only after every Firebase
 * business-rule check (30h rule, restricted dates, flagged/suspended,
 * global switch, duplicate guard, Vault readiness) has already passed.
 */
export async function createInitializingPayout(input: CreatePayoutRowInput): Promise<PayoutRow> {
  const reference = generatePayoutReference()
  const narration = buildNarration({
    isEvent: input.isEvent,
    isPoll: input.isPoll,
    isElection: input.isElection ?? false,
    isMerch: input.isMerch ?? false,
    eventName: input.eventName,
    pollName: input.pollName,
    electionName: input.electionName,
    merchName: input.merchName,
    payDate: input.payDate,
  })

  const { data, error } = await supabaseAdmin
    .from("payouts")
    .insert({
      reference,
      is_event: input.isEvent,
      is_poll: input.isPoll,
      is_election: input.isElection ?? false,
      is_merch: input.isMerch ?? false,
      event_id: input.eventId ?? null,
      poll_id: input.pollId ?? null,
      election_id: input.electionId ?? null,
      merch_id: input.merchId ?? null,
      event_name: input.eventName ?? null,
      poll_name: input.pollName ?? null,
      election_name: input.electionName ?? null,
      merch_name: input.merchName ?? null,
      pay_date: input.payDate,
      user_id: input.userId,
      amount: input.amount,
      bank_name: input.method.bankName,
      bank_code: input.method.bankCode,
      account_number: input.method.accountNumber,
      account_name: input.method.accountName,
      recipient_code: input.method.recipientCode,
      method_id: input.method.methodId,
      vault_locked: input.vaultLocked,
      status: "initializing",
      narration,
    })
    .select()
    .single()

  if (error) {
    if (isPayoutUniqueViolation(error)) {
      throw new DuplicateRequestError("A payout for this date is already in progress or has already succeeded.")
    }
    throw new Error(error.message || "Failed to create payout record")
  }
  return data as PayoutRow
}

export async function getPayoutsForEvent(eventId: string): Promise<PayoutRow[]> {
  const { data, error } = await supabaseAdmin
    .from("payouts")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as PayoutRow[]
}

export async function getPayoutsForPoll(pollId: string): Promise<PayoutRow[]> {
  const { data, error } = await supabaseAdmin
    .from("payouts")
    .select("*")
    .eq("poll_id", pollId)
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as PayoutRow[]
}

export async function getPayoutsForElection(electionId: string): Promise<PayoutRow[]> {
  const { data, error } = await supabaseAdmin
    .from("payouts")
    .select("*")
    .eq("election_id", electionId)
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as PayoutRow[]
}

export async function getPayoutsForMerch(merchId: string): Promise<PayoutRow[]> {
  const { data, error } = await supabaseAdmin
    .from("payouts")
    .select("*")
    .eq("merch_id", merchId)
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as PayoutRow[]
}

export async function getPayoutByReference(reference: string): Promise<PayoutRow | null> {
  const { data, error } = await supabaseAdmin
    .from("payouts")
    .select("*")
    .eq("reference", reference)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as PayoutRow) ?? null
}

/**
 * True if any non-terminal (still initializing/processing) or
 * successful payout already exists for this event/poll + date — used
 * as the duplicate-request guard in place of the old Firestore
 * `payouts` query. A failed attempt does NOT block a fresh request for
 * the same date (there's nothing to retry, but the date itself isn't
 * poisoned).
 */
export async function hasActiveOrSuccessfulPayout(
  scope: { eventId?: string; pollId?: string; electionId?: string; merchId?: string },
  payDate: string
): Promise<boolean> {
  let query = supabaseAdmin.from("payouts").select("id, status").eq("pay_date", payDate)
  if (scope.eventId) query = query.eq("event_id", scope.eventId)
  else if (scope.pollId) query = query.eq("poll_id", scope.pollId)
  else if (scope.electionId) query = query.eq("election_id", scope.electionId)
  else query = query.eq("merch_id", scope.merchId!)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).some((r) => r.status !== "failed")
}
