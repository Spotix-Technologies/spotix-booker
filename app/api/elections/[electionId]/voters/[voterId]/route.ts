/**
 * app/api/elections/[electionId]/voters/[voterId]/route.ts
 *
 * PATCH  → edit one voter's email/name/phone/meta (partial — only
 *          fields present in the body are changed; meta is
 *          shallow-merged onto the existing meta, not replaced)
 * DELETE → outright remove a voter from this election's list
 *
 * Sibling of the /voters route.ts (list/bulk-upload) — that file stays
 * GET+POST only; per-voter edit/remove lives here, same split as
 * offices/[officeId] vs offices.
 */

import { NextRequest, NextResponse } from "next/server"
import { getVoter, updateVoter, deleteVoter, getVoterFieldsSpec } from "@/lib/election-db"
import { validateManualVoter } from "@/lib/election-voters-csv"
import { requireElectionOwner } from "@/lib/election-auth"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ electionId: string; voterId: string }> }) {
  const { electionId, voterId } = await params
  const access = await requireElectionOwner(electionId)
  if (access instanceof NextResponse) return access

  const existing = await getVoter(electionId, voterId)
  if (!existing) {
    return NextResponse.json({ error: "Voter not found for this election" }, { status: 404 })
  }

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { email, name, phone, meta } = body

  if (email !== undefined && !email?.trim()) {
    return NextResponse.json({ error: "email cannot be empty" }, { status: 400 })
  }
  if (name !== undefined && !name?.trim()) {
    return NextResponse.json({ error: "name cannot be empty" }, { status: 400 })
  }
  if (meta !== undefined && (typeof meta !== "object" || meta === null || Array.isArray(meta))) {
    return NextResponse.json({ error: "meta must be an object" }, { status: 400 })
  }

  // Validate the record that would *result* from this patch against the
  // election's voter_fields spec — same enforcement a fresh manual entry
  // gets (see POST /voters), so an edit can't leave a required custom
  // field blank by omission.
  const fieldSpec = (await getVoterFieldsSpec(electionId)) ?? []
  const merged = {
    email: email !== undefined ? email : existing.email,
    name: name !== undefined ? name : existing.name,
    phone: phone !== undefined ? phone : existing.phone,
    meta: meta !== undefined ? { ...(existing.meta ?? {}), ...meta } : existing.meta,
  }
  const errors = validateManualVoter(merged, fieldSpec)
  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed", details: errors }, { status: 422 })
  }

  try {
    const result = await updateVoter(electionId, voterId, { email, name, phone, meta })
    if (!result.ok) {
      if (result.reason === "duplicate_email") {
        return NextResponse.json(
          { error: "Another voter in this election already uses that email" },
          { status: 409 }
        )
      }
      return NextResponse.json({ error: "Voter not found for this election" }, { status: 404 })
    }
    return NextResponse.json({ voter: result.voter })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Failed to update voter" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ electionId: string; voterId: string }> }) {
  const { electionId, voterId } = await params
  const access = await requireElectionOwner(electionId)
  if (access instanceof NextResponse) return access

  try {
    const deleted = await deleteVoter(electionId, voterId)
    if (!deleted) {
      return NextResponse.json({ error: "Voter not found for this election" }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Failed to delete voter" }, { status: 500 })
  }
}
