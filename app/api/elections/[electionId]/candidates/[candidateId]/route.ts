/**
 * app/api/elections/[electionId]/candidates/[candidateId]/route.ts
 *
 * GET → one candidate's full row plus the office they registered for
 * (name + its question set), for the organiser's "View details" page
 * (see app/elections/[electionId]/candidates/[candidateId]/page.tsx).
 * Ownership-gated the same way as every other /api/elections/[id]/*
 * route, and getCandidateForElection additionally scopes the candidate
 * lookup to this exact electionId.
 */

import { NextResponse } from "next/server"
import { getCandidateForElection } from "@/lib/election-db"
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

  return NextResponse.json({ candidate: result.candidate, office: result.office })
}
