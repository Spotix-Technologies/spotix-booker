/**
 * lib/poll-drafts.ts
 *
 * Save-as-draft for poll creation. Drafts live entirely in Redis (Upstash)
 * — not Firestore — since they're throwaway working state, not committed
 * poll data. Each draft expires on its own after DRAFT_TTL_SECONDS so
 * abandoned drafts don't accumulate forever.
 *
 * Keys:
 *   poll-draft:{userId}:{draftId}        → JSON: { kind, label, data, updatedAt }
 *   poll-drafts-index:{userId}:{kind}    → Set of draftIds for that user+kind
 *
 * The index is pruned lazily on read (if a draft key expired, its id is
 * removed from the index the next time the list is fetched).
 */

import { randomUUID } from "crypto"
import { redis } from "./redis"

export type DraftKind = "poll" | "nomination" | "event"

export const DRAFT_TTL_SECONDS = 60 * 60 * 24 * 14 // 14 days

export interface PollDraft {
  draftId: string
  kind: DraftKind
  label: string
  data: unknown
  updatedAt: string
}

function draftKey(userId: string, draftId: string) {
  return `poll-draft:${userId}:${draftId}`
}
function indexKey(userId: string, kind: DraftKind) {
  return `poll-drafts-index:${userId}:${kind}`
}

/** Generates a short, URL-safe draft id. */
export function genDraftId(): string {
  return `dr-${randomUUID().replace(/-/g, "").slice(0, 16)}`
}

/**
 * Creates a new draft or overwrites an existing one (if draftId is passed
 * and belongs to the same user — callers must verify ownership first via
 * getDraft if updating).
 */
export async function saveDraft(
  userId: string,
  kind: DraftKind,
  data: unknown,
  label: string,
  draftId?: string
): Promise<{ draftId: string; updatedAt: string }> {
  const id = draftId || genDraftId()
  const updatedAt = new Date().toISOString()
  const record: PollDraft = { draftId: id, kind, label, data, updatedAt }

  await redis.set(draftKey(userId, id), record, { ex: DRAFT_TTL_SECONDS })
  await redis.sadd(indexKey(userId, kind), id)
  // Keep the index itself from living forever if the user never comes back.
  await redis.expire(indexKey(userId, kind), DRAFT_TTL_SECONDS)

  return { draftId: id, updatedAt }
}

export async function getDraft(userId: string, draftId: string): Promise<PollDraft | null> {
  try {
    const record = await redis.get<PollDraft>(draftKey(userId, draftId))
    return record ?? null
  } catch (err) {
    console.error("[poll-drafts] getDraft failed:", err)
    return null
  }
}

export async function deleteDraft(userId: string, kind: DraftKind, draftId: string): Promise<void> {
  await redis.del(draftKey(userId, draftId))
  await redis.srem(indexKey(userId, kind), draftId)
}

export async function listDrafts(userId: string, kind: DraftKind): Promise<PollDraft[]> {
  const ids = await redis.smembers(indexKey(userId, kind))
  if (!ids || ids.length === 0) return []

  const keys = ids.map((id) => draftKey(userId, id))
  const records = await redis.mget<PollDraft[]>(...keys)

  const valid: PollDraft[] = []
  const expiredIds: string[] = []

  records.forEach((record, i) => {
    if (record) valid.push(record)
    else expiredIds.push(ids[i])
  })

  if (expiredIds.length > 0) {
    await redis.srem(indexKey(userId, kind), ...expiredIds)
  }

  return valid.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}
