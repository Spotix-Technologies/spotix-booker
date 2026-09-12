/**
 * app/lib/listing-image-uploader.ts
 *
 * Client-side image upload/delete helpers for merch listings — images are
 * stored in Supabase Storage (bucket: "listing-images", see
 * /supabase/schema-merch.sql for the bucket + policy setup) via the
 * authenticated /api/listings/upload route, so the service-role key never
 * reaches the browser.
 *
 * Replaces:
 *  - the direct `firebase/storage` client-SDK call that used to live in
 *    create-listing-form.tsx, which crashed with "Firebase: No Firebase
 *    App '[DEFAULT]' has been created" because no client Firebase app is
 *    initialized in spotix-booker.
 *  - the generic Cloudinary/UploadThing path (`@/lib/image-uploader`) that
 *    edit-listing-modal.tsx used, so listing images now live in one place
 *    end to end (create + edit).
 */

import { authFetch } from "@/lib/auth-client"

/** Upload a single image file. Throws on failure. */
export async function uploadListingImage(file: File): Promise<string> {
  const body = new FormData()
  body.append("file", file)

  const res = await authFetch("/api/listings/upload", { method: "POST", body })
  const data = await res.json().catch(() => ({}))

  if (!res.ok || !data?.success || !data?.url) {
    throw new Error(data?.error || `Failed to upload ${file.name}`)
  }
  return data.url as string
}

/**
 * Upload multiple images sequentially, so progress can be reported one
 * file at a time. Throws on the first failure — callers should treat a
 * thrown error as "abort the whole submission", matching the previous
 * Firebase upload behaviour.
 */
export async function uploadListingImages(
  files: File[],
  onProgress?: (uploaded: number, total: number, file: File) => void
): Promise<string[]> {
  const urls: string[] = []
  for (let i = 0; i < files.length; i++) {
    const url = await uploadListingImage(files[i])
    urls.push(url)
    onProgress?.(i + 1, files.length, files[i])
  }
  return urls
}

/** Delete a previously uploaded listing image by its public Supabase URL. */
export async function deleteListingImage(imageUrl: string): Promise<void> {
  try {
    const res = await authFetch("/api/listings/upload", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: imageUrl }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      console.error("[listing-image-uploader] delete failed:", data?.error)
    }
  } catch (err) {
    console.error("[listing-image-uploader] delete failed:", err)
  }
}
