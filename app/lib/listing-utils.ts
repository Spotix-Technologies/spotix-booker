import { authFetch } from "@/lib/auth-client"
import { deleteListingImage } from "./listing-image-uploader"

/** userId is kept in the signature for backwards compat with existing
 *  callers — ownership is enforced server-side via the spotix_at cookie,
 *  not by this parameter. */
export async function deleteListing(userId: string, listingId: string, images: string[]) {
  try {
    // Delete images from Supabase Storage first, then the listing row.
    for (const imageUrl of images) {
      try {
        await deleteListingImage(imageUrl)
      } catch (error) {
        console.error("Error deleting image:", error)
      }
    }

    // Delete the listing row itself via the Supabase-backed API.
    const res = await authFetch(`/api/listings/${listingId}`, { method: "DELETE" })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || "Failed to delete listing")
    }
  } catch (error) {
    console.error("Error deleting listing:", error)
    throw error
  }
}
