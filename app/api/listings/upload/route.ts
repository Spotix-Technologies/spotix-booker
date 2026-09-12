/**
 * app/api/listings/upload/route.ts
 *
 * POST   /api/listings/upload  → Upload one listing image to Supabase Storage
 * DELETE /api/listings/upload  → Delete one listing image from Supabase Storage
 *
 * Storage: Supabase Storage, bucket "listing-images" (public read bucket —
 * see /supabase/schema-merch.sql for the bucket + policy setup). Every
 * object key is prefixed with the caller's Firebase UID (same id stored as
 * merch_listings.booker_id) so an ownership check on delete is a simple
 * prefix comparison — no DB round-trip needed.
 *
 * Replaces the direct `firebase/storage` client-SDK call that used to live
 * in create-listing-form.tsx (crashed with "Firebase: No Firebase App
 * '[DEFAULT]' has been created" — no client Firebase app is initialized in
 * spotix-booker) and the generic Cloudinary/UploadThing path that
 * edit-listing-modal.tsx used via `@/lib/image-uploader`.
 */

import { NextRequest, NextResponse } from "next/server"
import { authenticateMerchRequest } from "@/lib/merch-auth"
import { supabaseAdmin } from "@/lib/supabase"

const BUCKET = "listing-images"
const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

function ok(data: object, status = 200) {
  return NextResponse.json({ success: true, ...data }, { status })
}
function fail(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status })
}

/** Infer MIME type from filename when the browser doesn't set Content-Type. */
function inferMime(file: File): string {
  if (file.type && file.type !== "application/octet-stream") return file.type
  const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    gif: "image/gif", webp: "image/webp", avif: "image/avif",
    bmp: "image/bmp", heic: "image/heic", heif: "image/heif",
  }
  return map[ext] ?? file.type ?? ""
}

// ─── POST ────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await authenticateMerchRequest()
  if (auth instanceof NextResponse) return auth
  if (!auth.isBooker) return fail("Only booker accounts can upload listing images", 403)

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return fail("Could not parse form data", 400)
  }

  const raw = formData.get("file")
  if (!raw || !(raw instanceof File)) return fail("No 'file' field in request body", 400)

  const mime = inferMime(raw)
  if (!mime.startsWith("image/")) return fail(`File type "${mime || "(empty)"}" is not an image`, 400)
  if (raw.size > MAX_SIZE) return fail("File too large — maximum 10 MB", 400)

  const ext = raw.name.split(".").pop()?.toLowerCase() || mime.split("/")[1] || "jpg"
  const path = `${auth.userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`

  try {
    const buffer = Buffer.from(await raw.arrayBuffer())
    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: mime, upsert: false })

    if (uploadError) {
      console.error("[POST /api/listings/upload] Supabase Storage error:", uploadError)
      return fail("Failed to upload image", 500)
    }

    const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path)
    return ok({ url: data.publicUrl }, 201)
  } catch (err) {
    console.error("[POST /api/listings/upload]", err)
    return fail("Failed to upload image", 500)
  }
}

// ─── DELETE ──────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const auth = await authenticateMerchRequest()
  if (auth instanceof NextResponse) return auth

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return fail("Invalid JSON body", 400)
  }

  const url = String(body?.url ?? "")
  if (!url) return fail("url is required", 400)

  const marker = `/${BUCKET}/`
  const idx = url.indexOf(marker)
  if (idx === -1) return fail("Not a recognised listing-images URL", 400)

  const path = decodeURIComponent(url.slice(idx + marker.length))

  // Ownership check: every object key is prefixed with the uploader's own
  // userId (see POST above), so this rejects deleting someone else's image
  // without needing a DB lookup.
  if (!path.startsWith(`${auth.userId}/`)) {
    return fail("You do not own this image", 403)
  }

  try {
    const { error } = await supabaseAdmin.storage.from(BUCKET).remove([path])
    if (error) {
      console.error("[DELETE /api/listings/upload]", error)
      return fail("Failed to delete image", 500)
    }
    return ok({ deleted: true })
  } catch (err) {
    console.error("[DELETE /api/listings/upload]", err)
    return fail("Failed to delete image", 500)
  }
}

export async function GET() {
  return fail("Method Not Allowed", 405)
}
