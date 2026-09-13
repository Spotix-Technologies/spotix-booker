/**
 * app/api/upload/route.ts
 * POST /api/upload
 *
 * Server-side image upload proxy.
 * 1. Tries Cloudinary first (signed upload — no preset needed).
 * 2. Falls back to UploadThing (UTApi.uploadFiles) if Cloudinary fails.
 *
 * Env vars (server-side only, no NEXT_PUBLIC_ prefix):
 *   CLOUDINARY_CLOUD_NAME    – your cloud name
 *   CLOUDINARY_API_KEY       – your API key
 *   CLOUDINARY_API_SECRET    – your API secret (Settings → Access Keys)
 *   UPLOADTHING_TOKEN        – V7 base64 token (dashboard → API Keys → V7 tab)
 *                              OR UPLOADTHING_SECRET for the old sk_live_ key
 */

import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"

const TAG = "[/api/upload]"

function ok(data: object) {
  return NextResponse.json({ success: true, ...data }, { status: 200 })
}
function fail(message: string, status = 500) {
  console.error(`${TAG} responding ${status}: ${message}`)
  return NextResponse.json({ success: false, error: message }, { status })
}

/** Infer MIME type from filename when the browser doesn't set Content-Type. */
function inferMime(file: File): string {
  if (file.type && file.type !== "application/octet-stream") return file.type
  const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    gif: "image/gif",  webp: "image/webp", avif: "image/avif",
    bmp: "image/bmp",  svg: "image/svg+xml", tiff: "image/tiff",
    heic: "image/heic", heif: "image/heif",
  }
  return map[ext] ?? file.type ?? ""
}

// ─── Cloudinary (signed upload) ───────────────────────────────────────────────

async function tryCloudinary(file: File, folder?: string): Promise<string | null> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey    = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET

  if (!cloudName || !apiKey || !apiSecret) {
    console.warn(`${TAG} Cloudinary: env vars missing (CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET) — skipping`)
    return null
  }

  try {
    const timestamp = Math.round(Date.now() / 1000).toString()

    // Params must be sorted alphabetically for signature
    const sigParams: Record<string, string> = { timestamp }
    if (folder) sigParams.folder = folder

    const sigString =
      Object.keys(sigParams)
        .sort()
        .map((k) => `${k}=${sigParams[k]}`)
        .join("&") + apiSecret

    const signature = crypto.createHash("sha256").update(sigString).digest("hex")

    const form = new FormData()
    form.append("file", file)
    form.append("api_key", apiKey)
    form.append("timestamp", timestamp)
    form.append("signature", signature)
    if (folder) form.append("folder", folder)

    console.log(`${TAG} Cloudinary: uploading "${file.name}" (${file.size} bytes) → ${cloudName}`)

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      { method: "POST", body: form },
    )

    if (!res.ok) {
      const body = await res.text()
      console.error(`${TAG} Cloudinary: ${res.status} ${res.statusText} —`, body)
      return null
    }

    const data = await res.json()
    console.log(`${TAG} Cloudinary: success → ${data.secure_url}`)
    return data.secure_url as string
  } catch (err) {
    console.error(`${TAG} Cloudinary: exception —`, err)
    return null
  }
}

// ─── UploadThing (UTApi) ──────────────────────────────────────────────────────

async function tryUploadthing(file: File): Promise<string | null> {
  const token  = process.env.UPLOADTHING_TOKEN   // V7 base64 token
  const secret = process.env.UPLOADTHING_SECRET  // V6 sk_live_ fallback

  if (!token && !secret) {
    console.warn(`${TAG} UploadThing: no UPLOADTHING_TOKEN or UPLOADTHING_SECRET in env — skipping`)
    return null
  }

  let UTApi: any
  try {
    const mod = await import("uploadthing/server")
    UTApi = mod.UTApi
  } catch {
    console.warn(`${TAG} UploadThing: 'uploadthing' package not installed — run: pnpm add uploadthing`)
    return null
  }

  try {
    const utapi = new UTApi({ token: token ?? secret })

    console.log(`${TAG} UploadThing: uploading "${file.name}" (${file.size} bytes)`)

    const result = await utapi.uploadFiles(file)

    if (result.error) {
      console.error(`${TAG} UploadThing: error —`, result.error)
      return null
    }

    const url = result.data?.url ?? result.data?.ufsUrl ?? null
    if (url) console.log(`${TAG} UploadThing: success → ${url}`)
    return url
  } catch (err) {
    console.error(`${TAG} UploadThing: exception —`, err)
    return null
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Parse form data
  let formData: FormData
  try {
    formData = await req.formData()
  } catch (err) {
    console.error(`${TAG} Could not parse multipart form data:`, err)
    return fail("Could not parse form data", 400)
  }

  // 2. Extract file — Next.js App Router can return Blob instead of File
  const raw = formData.get("file")
  console.log(`${TAG} raw field type: ${raw?.constructor?.name}, value type: ${typeof raw}`)

  if (!raw) {
    return fail("No 'file' field in request body", 400)
  }

  let file: File
  if (raw instanceof File) {
    file = raw
  } else if (typeof globalThis.Blob !== "undefined" && (raw as any) instanceof globalThis.Blob) {
    const mime = raw.type || "image/jpeg"
    const ext  = mime.split("/")[1]?.split("+")[0] ?? "jpg"
    file = new File([raw], `upload.${ext}`, { type: mime })
    console.log(`${TAG} Wrapped Blob as File: name=${file.name} type=${file.type}`)
  } else {
    // Shouldn't happen, but guard anyway
    console.error(`${TAG} 'file' field is neither File nor Blob — got:`, typeof raw, raw)
    return fail("'file' field is not a valid file", 400)
  }

  // 3. Infer MIME in case browser didn't set it
  const mime = inferMime(file)
  if (mime !== file.type) {
    file = new File([file], file.name, { type: mime })
    console.log(`${TAG} Inferred MIME from filename: ${mime}`)
  }

  // 4. Validate — accept any image/* including empty type inferred from name
  if (!mime.startsWith("image/")) {
    return fail(`File type "${mime || "(empty)"}" is not an image`, 400)
  }

  // 5. Size cap (10 MB)
  if (file.size > 10 * 1024 * 1024) {
    return fail("File too large — maximum 10 MB", 400)
  }

  const folder = (formData.get("folder") as string | null) ?? undefined
  // console.log(`${TAG} Processing: name=${file.name} type=${file.type} size=${file.size} folder=${folder}`)

  // 6. Try Cloudinary first
  const cloudUrl = await tryCloudinary(file, folder)
  if (cloudUrl) return ok({ url: cloudUrl, provider: "cloudinary" })

  // 7. Fallback to UploadThing
  const utUrl = await tryUploadthing(file)
  if (utUrl) return ok({ url: utUrl, provider: "uploadthing" })

  // 8. Both failed
  return fail("All upload providers failed — check server logs for details", 502)
}

export async function GET() {
  return fail("Method Not Allowed", 405)
}
