"use client"

import { useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Trash2, Edit2, Package, Power, Wallet } from "lucide-react"
import { deleteListing } from "@/lib/listing-utils"
import { authFetch } from "@/lib/auth-client"
import { EditListingModal } from "./edit-listing-modal"
import { DeleteConfirmDialog } from "./delete-confirm-dialog"

interface ListingListRowProps {
  listing: any
  userId: string
  onUpdate: () => void
}

/**
 * Compact horizontal row used by the "list" view on Manage Listings —
 * thumbnail on the left, name/price in the middle, status toggle + actions
 * on the right. Distinct from ListingCard (the "grid" view) so the two view
 * modes actually look different, including on mobile.
 */
export function ListingListRow({ listing, userId, onUpdate }: ListingListRowProps) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [status, setStatus] = useState<"active" | "inactive">(listing.status ?? "active")
  const [statusUpdating, setStatusUpdating] = useState(false)
  const router = useRouter()

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteListing(userId, listing.id, listing.images)
      onUpdate()
      setDeleteOpen(false)
    } finally {
      setDeleting(false)
    }
  }

  const toggleStatus = async () => {
    const nextStatus = status === "active" ? "inactive" : "active"
    setStatusUpdating(true)
    try {
      const res = await authFetch(`/api/listings/${listing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      })
      if (!res.ok) throw new Error("Failed to update status")
      setStatus(nextStatus)
      onUpdate()
    } catch (error) {
      console.error("Error updating listing status:", error)
    } finally {
      setStatusUpdating(false)
    }
  }

  const formatPrice = (price: number) =>
    `₦${price.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <>
      <div className="flex flex-col bg-white rounded-xl border border-slate-200 hover:border-[#6b2fa5]/30 hover:shadow-md transition-all duration-200 p-3">
        <div className="group flex items-center gap-3 sm:gap-4">
          {/* Thumbnail */}
          <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden bg-slate-100 flex-shrink-0">
            {listing.images && listing.images.length > 0 ? (
              <Image
                src={listing.images[0] || "/placeholder.svg"}
                alt={listing.productName}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package className="w-6 h-6 text-slate-300" />
              </div>
            )}
          </div>

          {/* Name + price */}
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm sm:text-base text-slate-900 truncate group-hover:text-[#6b2fa5] transition-colors duration-200">
              {listing.productName}
            </h3>
            <p className="text-sm sm:text-base font-bold text-[#6b2fa5]">{formatPrice(listing.price)}</p>
            {listing.quantity !== undefined && (
              <p className="text-xs text-slate-400">{listing.quantity} in stock</p>
            )}
          </div>

          {/* Status toggle */}
          <button
            type="button"
            onClick={toggleStatus}
            disabled={statusUpdating}
            title={status === "active" ? "Selling — tap to pause" : "Paused — tap to resume selling"}
            className="flex-shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <span
              className={`inline-flex h-6 w-10 items-center rounded-full p-0.5 transition-colors duration-200 ${
                status === "active" ? "bg-[#6b2fa5]" : "bg-slate-300"
              }`}
            >
              <span
                className={`h-5 w-5 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${
                  status === "active" ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </span>
          </button>

          {/* Actions — desktop */}
          <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={() => router.push(`/listings/manage/orders/${listing.id}`)}
              title="Orders"
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-[#6b2fa5] hover:bg-[#5a2589] text-white transition-colors duration-200"
            >
              <Package size={16} />
            </button>
            <button
              onClick={() => router.push(`/listings/manage/${listing.id}/payouts`)}
              title="Payouts"
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-[#6b2fa5] hover:bg-[#5a2589] text-white transition-colors duration-200"
            >
              <Wallet size={16} />
            </button>
            <button
              onClick={() => setEditOpen(true)}
              title="Edit"
              className="w-9 h-9 flex items-center justify-center rounded-lg border-2 border-[#6b2fa5] text-[#6b2fa5] hover:bg-[#6b2fa5] hover:text-white transition-colors duration-200"
            >
              <Edit2 size={16} />
            </button>
            <button
              onClick={() => setDeleteOpen(true)}
              title="Delete"
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors duration-200"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* Actions — mobile (row is too narrow for icon buttons alongside the toggle) */}
        <div className="flex sm:hidden items-center gap-2 mt-3">
          <button
            onClick={() => router.push(`/listings/manage/orders/${listing.id}`)}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg bg-[#6b2fa5] text-white text-xs font-semibold"
          >
            <Package size={14} /> Orders
          </button>
          <button
            onClick={() => router.push(`/listings/manage/${listing.id}/payouts`)}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg bg-[#6b2fa5] text-white text-xs font-semibold"
          >
            <Wallet size={14} /> Payouts
          </button>
          <button
            onClick={() => setEditOpen(true)}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg border-2 border-[#6b2fa5] text-[#6b2fa5] text-xs font-semibold"
          >
            <Edit2 size={14} /> Edit
          </button>
          <button
            onClick={() => setDeleteOpen(true)}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg bg-red-500 text-white text-xs font-semibold"
          >
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </div>

      {/* Modals */}
      <EditListingModal
        open={editOpen}
        onOpenChange={setEditOpen}
        listing={listing}
        userId={userId}
        onUpdate={onUpdate}
      />
      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDelete}
        isDeleting={deleting}
      />
    </>
  )
}
