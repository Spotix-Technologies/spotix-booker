/**
 * lib/election-db.ts
 *
 * Organiser-side (Booker) reads/writes against the election_* tables —
 * see /supabase/election-schema.sql. This is the write side; the public
 * voter/candidate reads live in spotix-vote's lib/election/db.ts against
 * the exact same tables, same Supabase project.
 */

import { supabaseAdmin } from "@/lib/supabase"

/**
 * Retries a Supabase call a couple of times on a transient network
 * failure ("TypeError: fetch failed" — DNS hiccup, dropped connection,
 * dev-server going through a slow HMR recompile while a poll request is
 * in flight) before giving up. Doesn't retry actual query errors (bad
 * filter, RLS denial, etc.) — supabase-js resolves those to
 * `{ data: null, error }` rather than throwing, so they never hit this
 * catch at all; only a genuinely failed fetch throws.
 */
async function withFetchRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const isFetchFailure = err instanceof Error && /fetch failed/i.test(err.message)
      if (!isFetchFailure || i === attempts - 1) throw err
      await new Promise((r) => setTimeout(r, 300 * (i + 1)))
    }
  }
  throw lastErr
}

function genId(prefix: string): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  let id = `${prefix}-`
  for (let i = 0; i < 10; i++) id += chars.charAt(Math.floor(Math.random() * chars.length))
  return id
}

export interface VoterFieldSpec {
  key: string
  label: string
  required: boolean
}

// ── Elections ──────────────────────────────────────────────────────────────

export async function createElection(input: {
  organizerId: string
  name: string
  description?: string
  image?: string
  votingStartsAt?: string | null
  votingEndsAt?: string | null
  editGraceDays?: number
}) {
  const id = genId("sp-elec")
  const { data, error } = await supabaseAdmin
    .from("elections")
    .insert({
      id,
      organizer_id: input.organizerId,
      name: input.name,
      description: input.description ?? "",
      image: input.image ?? "",
      status: "draft",
      voting_starts_at: input.votingStartsAt ?? null,
      voting_ends_at: input.votingEndsAt ?? null,
      edit_grace_days: input.editGraceDays ?? 0,
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function listElectionsForOrganizer(organizerId: string) {
  const { data, error } = await supabaseAdmin
    .from("elections")
    .select("*")
    .eq("organizer_id", organizerId)
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getElection(electionId: string) {
  const { data, error } = await withFetchRetry(() =>
    supabaseAdmin.from("elections").select("*").eq("id", electionId).maybeSingle()
  )
  if (error) throw new Error(error.message)
  return data
}

export async function updateElectionStatus(electionId: string, status: "draft" | "scheduled" | "active" | "ended") {
  const { error } = await supabaseAdmin.from("elections").update({ status, updated_at: new Date().toISOString() }).eq("id", electionId)
  if (error) throw new Error(error.message)
}

/** Only the grace period is adjustable post-creation for now — name/dates aren't wired to an edit UI yet. */
export async function updateEditGraceDays(electionId: string, editGraceDays: number) {
  if (!Number.isInteger(editGraceDays) || editGraceDays < 0) {
    throw new Error("editGraceDays must be a non-negative integer")
  }
  const { error } = await supabaseAdmin
    .from("elections")
    .update({ edit_grace_days: editGraceDays, updated_at: new Date().toISOString() })
    .eq("id", electionId)
  if (error) throw new Error(error.message)
}

/**
 * General-purpose election details editor — name, description, image,
 * the voting window, and the candidate edit-grace window, all in one
 * PATCH. Superset of updateEditGraceDays above (kept separate since a
 * couple of other call sites only ever touch that one field). Every
 * field is optional; only the ones present in `input` are written.
 *
 * Changing votingStartsAt/votingEndsAt after candidates/voters already
 * exist is allowed on purpose — organisers routinely need to push a
 * voting window back a day, and nothing here depends on the original
 * dates (unlike edit_grace_days, which is read relative to each
 * candidate's own created_at, not the election's dates).
 */
export async function updateElection(
  electionId: string,
  input: Partial<{
    name: string
    description: string
    image: string
    votingStartsAt: string | null
    votingEndsAt: string | null
    editGraceDays: number
    allowVoterPrefill: boolean
  }>
) {
  const patch: Record<string, any> = {}

  if (input.name !== undefined) {
    if (!input.name.trim()) throw new Error("name can't be empty")
    patch.name = input.name.trim()
  }
  if (input.description !== undefined) patch.description = input.description
  if (input.image !== undefined) patch.image = input.image
  if (input.votingStartsAt !== undefined) patch.voting_starts_at = input.votingStartsAt
  if (input.votingEndsAt !== undefined) patch.voting_ends_at = input.votingEndsAt
  if (input.editGraceDays !== undefined) {
    if (!Number.isInteger(input.editGraceDays) || input.editGraceDays < 0) {
      throw new Error("editGraceDays must be a non-negative integer")
    }
    patch.edit_grace_days = input.editGraceDays
  }
  // Allow Voters Pre-fill — see spotix-vote's /election/{electionId}/open
  // page, which only accepts self-enlisted voters while this is true.
  // The organiser-facing toggle (EditElectionDialog / VotersTab) is
  // responsible for surfacing the "Spotix is not responsible for
  // unauthorized voting..." warning before this ever gets set to true;
  // this function itself doesn't gate on anything beyond the boolean check.
  if (input.allowVoterPrefill !== undefined) {
    if (typeof input.allowVoterPrefill !== "boolean") throw new Error("allowVoterPrefill must be a boolean")
    patch.allow_voter_prefill = input.allowVoterPrefill
  }

  if (Object.keys(patch).length === 0) return

  // Validate the resulting start/end pair even when only one side of it
  // is being changed this call — fetch whichever side isn't in `patch`
  // so e.g. pushing just votingEndsAt earlier than an already-saved
  // votingStartsAt still gets caught here instead of silently saving.
  if (patch.voting_starts_at !== undefined || patch.voting_ends_at !== undefined) {
    let effectiveStart = patch.voting_starts_at
    let effectiveEnd = patch.voting_ends_at
    if (effectiveStart === undefined || effectiveEnd === undefined) {
      const { data: current, error: fetchErr } = await supabaseAdmin
        .from("elections")
        .select("voting_starts_at, voting_ends_at")
        .eq("id", electionId)
        .maybeSingle()
      if (fetchErr) throw new Error(fetchErr.message)
      if (effectiveStart === undefined) effectiveStart = current?.voting_starts_at ?? null
      if (effectiveEnd === undefined) effectiveEnd = current?.voting_ends_at ?? null
    }
    if (effectiveStart && effectiveEnd && new Date(effectiveEnd).getTime() <= new Date(effectiveStart).getTime()) {
      throw new Error("Voting end must be after voting start")
    }
  }

  patch.updated_at = new Date().toISOString()
  const { data, error } = await supabaseAdmin.from("elections").update(patch).eq("id", electionId).select().single()
  if (error) throw new Error(error.message)
  return data
}

/** Irreversible — see the confirmation dialog required on the Booker UI. */
export async function publishResults(electionId: string) {
  const { error } = await supabaseAdmin
    .from("elections")
    .update({ results_published: true, results_published_at: new Date().toISOString() })
    .eq("id", electionId)
    .eq("results_published", false) // guards against double-publish re-stamping the timestamp
  if (error) throw new Error(error.message)
}

// ── Offices ────────────────────────────────────────────────────────────────

/**
 * "select" = single choice, "multi_select" = multiple choice — see the
 * matching comment in spotix-vote's lib/election/db.ts, same two DB
 * values, same reasoning (existing "select" rows never need migrating).
 */
export type OfficeQuestionType = "short_text" | "long_text" | "select" | "multi_select"

export interface OfficeQuestionInput {
  questionText: string
  questionType: OfficeQuestionType
  options?: string[]
  required: boolean
}

export interface OfficeInput {
  electionId: string
  name: string
  description?: string
  formFee: number
  seatsAvailable?: number
  sortOrder?: number
  questions: OfficeQuestionInput[]
  /** When true, candidates must upload a qualifying document to contest this office — see bioDataLabel. */
  bioDataRequired?: boolean
  /** Organiser-written instructions shown to candidates, e.g. "Upload your matric ID card". */
  bioDataLabel?: string
}

export async function createOffice(input: OfficeInput) {
  const officeId = genId("sp-office")
  const { error } = await supabaseAdmin.from("election_offices").insert({
    id: officeId,
    election_id: input.electionId,
    name: input.name,
    description: input.description ?? "",
    form_fee: input.formFee,
    seats_available: input.seatsAvailable ?? 1,
    sort_order: input.sortOrder ?? 0,
    bio_data_required: input.bioDataRequired ?? false,
    bio_data_label: input.bioDataLabel ?? "",
  })
  if (error) throw new Error(error.message)

  if (input.questions.length > 0) {
    const rows = input.questions.map((q, i) => ({
      id: genId("sp-q"),
      office_id: officeId,
      question_text: q.questionText,
      question_type: q.questionType,
      options: q.options ?? null,
      required: q.required,
      sort_order: i,
    }))
    const { error: qErr } = await supabaseAdmin.from("election_office_questions").insert(rows)
    if (qErr) throw new Error(qErr.message)
  }

  return officeId
}

export async function listOffices(electionId: string) {
  const { data, error } = await supabaseAdmin
    .from("election_offices")
    .select("*, election_office_questions(*)")
    .eq("election_id", electionId)
    .order("sort_order", { ascending: true })
  if (error) throw new Error(error.message)
  const offices = data ?? []

  if (offices.length === 0) return offices

  const { data: counts, error: countErr } = await supabaseAdmin
    .from("election_candidates")
    .select("office_id")
    .in(
      "office_id",
      offices.map((o) => o.id)
    )
  if (countErr) throw new Error(countErr.message)

  const countByOffice = new Map<string, number>()
  for (const row of counts ?? []) {
    countByOffice.set(row.office_id, (countByOffice.get(row.office_id) ?? 0) + 1)
  }

  return offices.map((o) => ({ ...o, candidate_count: countByOffice.get(o.id) ?? 0 }))
}

export async function getOffice(officeId: string) {
  const { data, error } = await supabaseAdmin
    .from("election_offices")
    .select("*, election_office_questions(*)")
    .eq("id", officeId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

/**
 * Updates an office's own fields and, if `questions` is provided,
 * replaces its full question set (delete-then-reinsert — simplest way
 * to keep sort_order/options/etc. consistent without diffing question
 * by question, and safe here since answers are stored by questionId on
 * the candidate row, not by position, so re-created rows for unchanged
 * questions would only matter if we tried to preserve ids, which this
 * intentionally doesn't promise across an edit).
 */
export async function updateOffice(
  officeId: string,
  input: Partial<{
    name: string
    description: string
    formFee: number
    seatsAvailable: number
    sortOrder: number
    bioDataRequired: boolean
    bioDataLabel: string
    questions: OfficeQuestionInput[]
  }>
) {
  const patch: Record<string, any> = {}
  if (input.name !== undefined) patch.name = input.name
  if (input.description !== undefined) patch.description = input.description
  if (input.formFee !== undefined) patch.form_fee = input.formFee
  if (input.seatsAvailable !== undefined) patch.seats_available = input.seatsAvailable
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder
  if (input.bioDataRequired !== undefined) patch.bio_data_required = input.bioDataRequired
  if (input.bioDataLabel !== undefined) patch.bio_data_label = input.bioDataLabel

  if (Object.keys(patch).length > 0) {
    const { error } = await supabaseAdmin.from("election_offices").update(patch).eq("id", officeId)
    if (error) throw new Error(error.message)
  }

  if (input.questions !== undefined) {
    const { error: delErr } = await supabaseAdmin.from("election_office_questions").delete().eq("office_id", officeId)
    if (delErr) throw new Error(delErr.message)

    if (input.questions.length > 0) {
      const rows = input.questions.map((q, i) => ({
        id: genId("sp-q"),
        office_id: officeId,
        question_text: q.questionText,
        question_type: q.questionType,
        options: q.options ?? null,
        required: q.required,
        sort_order: i,
      }))
      const { error: qErr } = await supabaseAdmin.from("election_office_questions").insert(rows)
      if (qErr) throw new Error(qErr.message)
    }
  }
}

/**
 * Blocked once any candidate has registered for this office — deleting
 * the office out from under registered candidates would orphan their
 * election_candidates rows (office_id pointing nowhere) with no clean
 * way to recover. Organisers can still edit a populated office's
 * name/fee/questions via updateOffice above; they just can't remove it.
 */
export async function deleteOffice(officeId: string): Promise<{ ok: true } | { ok: false; reason: "has_candidates" }> {
  const { count, error: countErr } = await supabaseAdmin
    .from("election_candidates")
    .select("id", { count: "exact", head: true })
    .eq("office_id", officeId)
  if (countErr) throw new Error(countErr.message)
  if ((count ?? 0) > 0) return { ok: false, reason: "has_candidates" }

  const { error: qErr } = await supabaseAdmin.from("election_office_questions").delete().eq("office_id", officeId)
  if (qErr) throw new Error(qErr.message)

  const { error } = await supabaseAdmin.from("election_offices").delete().eq("id", officeId)
  if (error) throw new Error(error.message)

  return { ok: true }
}

// ── Candidates (review) ──────────────────────────────────────────────────────

/** Bucket name mirrors spotix-vote's BIO_DATA_BUCKET (lib/election/bio-data.ts) — same Supabase project, same bucket. */
const BIO_DATA_BUCKET = "election-bio-data"

/**
 * Short-lived signed URL for viewing one candidate's uploaded bio data
 * document. The bucket is private, so this is the only way to view a
 * file — never a stored public URL. Also verifies the candidate
 * actually belongs to `electionId` so one organiser can't guess another
 * organiser's candidateId to peek at their documents.
 */
export async function getCandidateBioDataSignedUrl(electionId: string, candidateId: string): Promise<string | null> {
  const { data: candidate, error } = await supabaseAdmin
    .from("election_candidates")
    .select("bio_data_path")
    .eq("id", candidateId)
    .eq("election_id", electionId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!candidate?.bio_data_path) return null

  const { data, error: signErr } = await supabaseAdmin.storage
    .from(BIO_DATA_BUCKET)
    .createSignedUrl(candidate.bio_data_path, 60 * 10) // 10 minutes
  if (signErr) throw new Error(signErr.message)
  return data.signedUrl
}

export async function listCandidatesForElection(electionId: string) {
  const { data, error } = await supabaseAdmin
    .from("election_candidates")
    .select("*")
    .eq("election_id", electionId)
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

// ── Voter list custom fields spec ────────────────────────────────────────────

export async function setVoterFieldsSpec(electionId: string, fields: VoterFieldSpec[]) {
  const { error } = await supabaseAdmin
    .from("election_voter_fields")
    .upsert({ election_id: electionId, fields, updated_at: new Date().toISOString() })
  if (error) throw new Error(error.message)
}

export async function getVoterFieldsSpec(electionId: string): Promise<VoterFieldSpec[] | null> {
  const { data, error } = await supabaseAdmin
    .from("election_voter_fields")
    .select("fields")
    .eq("election_id", electionId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data?.fields as VoterFieldSpec[]) ?? null
}

// ── Voters ────────────────────────────────────────────────────────────────

function genVoterToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  let token = ""
  for (let i = 0; i < 24; i++) token += chars.charAt(Math.floor(Math.random() * chars.length))
  return token
}

export interface VoterInput {
  email: string
  name: string
  phone?: string
  meta?: Record<string, string>
}

/**
 * Bulk-inserts voters. Returns { inserted, skipped } — skipped entries
 * are ones whose email already exists for this election (the
 * uq_voter_email_per_election constraint), so a re-upload of the same
 * CSV is safe to run again without creating duplicates.
 */
export async function addVoters(electionId: string, voters: VoterInput[]) {
  let inserted = 0
  const skippedEmails: string[] = []

  // Row-by-row so one bad email in a 2,000-row CSV doesn't roll back
  // the other 1,999 — see lib/election-voters-csv.ts for the shape
  // validation done before this is ever called.
  for (const voter of voters) {
    const { error } = await supabaseAdmin.from("election_voters").insert({
      id: genId("sp-voter"),
      election_id: electionId,
      email: voter.email.trim(),
      name: voter.name.trim(),
      phone: voter.phone?.trim() ?? "",
      meta: voter.meta ?? {},
      voter_token: genVoterToken(),
    })
    if (error) {
      if (error.code === "23505") {
        skippedEmails.push(voter.email)
        continue
      }
      throw new Error(error.message)
    }
    inserted++
  }

  return { inserted, skipped: skippedEmails }
}

export async function listVoters(electionId: string) {
  const { data, error } = await supabaseAdmin
    .from("election_voters")
    .select("id, email, name, phone, meta, created_at")
    .eq("election_id", electionId)
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

/** Scoped to electionId so one organiser can't guess another organiser's voterId. */
export async function getVoter(electionId: string, voterId: string) {
  const { data, error } = await supabaseAdmin
    .from("election_voters")
    .select("id, email, name, phone, meta, created_at")
    .eq("id", voterId)
    .eq("election_id", electionId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

/**
 * Partial update of one voter's email/name/phone/meta — only fields
 * present in `input` are changed. `meta` is shallow-merged onto the
 * existing meta object rather than replaced outright, so an edit that
 * only touches one custom field doesn't wipe out the others. Callers
 * (see the [voterId] route) are expected to validate the *resulting*
 * merged record against this election's voter_fields spec before
 * calling this — same enforcement a fresh manual entry gets — since
 * this function itself doesn't have the field spec in scope.
 */
export async function updateVoter(
  electionId: string,
  voterId: string,
  input: Partial<{ email: string; name: string; phone: string; meta: Record<string, string> }>
): Promise<{ ok: true; voter: any } | { ok: false; reason: "not_found" | "duplicate_email" }> {
  const existing = await getVoter(electionId, voterId)
  if (!existing) return { ok: false, reason: "not_found" }

  const patch: Record<string, any> = {}
  if (input.email !== undefined) patch.email = input.email.trim()
  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.phone !== undefined) patch.phone = input.phone.trim()
  if (input.meta !== undefined) patch.meta = { ...(existing.meta ?? {}), ...input.meta }

  if (Object.keys(patch).length === 0) return { ok: true, voter: existing }

  const { data, error } = await supabaseAdmin
    .from("election_voters")
    .update(patch)
    .eq("id", voterId)
    .eq("election_id", electionId)
    .select("id, email, name, phone, meta, created_at")
    .maybeSingle()

  if (error) {
    // uq_voter_email_per_election — same constraint addVoters() guards against.
    if (error.code === "23505") return { ok: false, reason: "duplicate_email" }
    throw new Error(error.message)
  }
  return { ok: true, voter: data }
}

/**
 * Outright removal. Hard delete, not a soft-delete/status flag — there's
 * no vote-tracking table in this repo (votes live in spotix-vote against
 * the same Supabase project) to check whether this voter already cast a
 * ballot, so this doesn't attempt to block or warn on that; the Booker UI
 * calling this should confirm with the organiser before hitting it.
 */
export async function deleteVoter(electionId: string, voterId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("election_voters")
    .delete()
    .eq("id", voterId)
    .eq("election_id", electionId)
    .select("id")
    .maybeSingle()
  if (error) throw new Error(error.message)
  return !!data
}

export async function countVoters(electionId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("election_voters")
    .select("id", { count: "exact", head: true })
    .eq("election_id", electionId)
  if (error) throw new Error(error.message)
  return count ?? 0
}
