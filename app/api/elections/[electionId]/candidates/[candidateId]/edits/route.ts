/**
 * app/api/elections/[electionId]/candidates/[candidateId]/edits/route.ts
 *
 * GET → { edits } — this candidate's self-edit history (see
 * spotix-vote's lib/election/edit.ts, which writes
 * election_candidate_edits), newest first. Ownership-gated the same way
 * as every other /api/elections/[id]/* route; getCandidateForElection
 * additionally scopes the candidate lookup to this exact electionId so
 * one organiser can't pull another organiser's candidate's edit history
 * by guessing a candidateId.
 */

import { NextResponse } from "next/server"
import { getCandidateForElection, listCandidateEdits } from "@/lib/election-db"
import { requireElectionOwner } from "@/lib/election-auth"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ electionId: string; candidateId: string }> }
) {
  const { electionId, candidateId } = await params
  const access = await requireElectionOwner(electionId)
  if (access instanceof NextResponse) return access

  const result = await getCandidateForElection(electionId, candidateId)
  if (!result) return NextResponse.json({ error: "Candidate not found" }, { status: 404 })

  const edits = await listCandidateEdits(candidateId)
  return NextResponse.json({ edits })
}
