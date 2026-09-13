/**
 * app/api/elections/[electionId]/route.ts
 *
 * GET   → election + its offices (with questions) + voter count, for the
 * organiser's election dashboard. 403s if the caller isn't this
 * election's organizer.
 * PATCH → edits the election's own details: name, description, image,
 * the voting window (votingStartsAt/votingEndsAt), and editGraceDays
 * (the candidate edit window — see lib/election/edit.ts in spotix-vote
 * for how that one's consumed). Changing editGraceDays retroactively
 * extends/shortens the deadline for every candidate already registered,
 * since the deadline is computed from each candidate's own created_at +
 * this value, not stored per row. All fields are optional — only the
 * ones present in the body are updated (see updateElection in
 * lib/election-db.ts).
 */

import { NextRequest, NextResponse } from "next/server"
import { listOffices, countVoters, updateElection } from "@/lib/election-db"
import { requireElectionOwner } from "@/lib/election-auth"

const EDITABLE_FIELDS = ["name", "description", "image", "votingStartsAt", "votingEndsAt", "editGraceDays"] as const

export async function GET(_req: Request, { params }: { params: Promise<{ electionId: string }> }) {
  const { electionId } = await params
  const access = await requireElectionOwner(electionId)
  if (access instanceof NextResponse) return access

  const [offices, voterCount] = await Promise.all([listOffices(electionId), countVoters(electionId)])

  return NextResponse.json({ election: access.election, offices, voterCount })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ electionId: string }> }) {
  const { electionId } = await params
  const access = await requireElectionOwner(electionId)
  if (access instanceof NextResponse) return access

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const patch: Record<string, any> = {}
  for (const key of EDITABLE_FIELDS) {
    if (body[key] !== undefined) patch[key] = body[key]
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: `Nothing to update — pass one of: ${EDITABLE_FIELDS.join(", ")}` }, { status: 400 })
  }
  if (patch.name !== undefined && !String(patch.name).trim()) {
    return NextResponse.json({ error: "name can't be empty" }, { status: 400 })
  }

  try {
    const election = await updateElection(electionId, patch)
    return NextResponse.json({ success: true, election })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Failed to update" }, { status: 400 })
  }
}
