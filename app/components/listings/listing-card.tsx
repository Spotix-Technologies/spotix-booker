"use client"

import { useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Trash2, Edit2, Package, Hash, Calendar, Power } from "lucide-react"
import { deleteListing } from "@/lib/listing-utils"
import { authFetch } from "@/lib/auth-client"
import { EditListingModal } from "./edit-listing-modal"
import { DeleteConfirmDialog } from "./delete-confirm-dialog"

interface ListingCardProps {
  listing: any
  userId: string
  onUpdate: () => void
}

export function ListingCard({ listing, userId, onUpdate }: ListingCardProps) {
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

  const formatPrice = (price: number) => {
    return `₦${price.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-NG", { month: "short", day: "numeric", year: "numeric" })
  }

  return (
    <>
      <div className="group bg-white rounded-xl shadow-md overflow-hidden hover:shadow-2xl hover:shadow-[#6b2fa5]/10 transition-all duration-300 border border-slate-200 hover:border-[#6b2fa5]/30">
        {/* Gradient accent line */}
        <div className="h-1 bg-gradient-to-r from-[#6b2fa5] via-purple-400 to-[#6b2fa5] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        
        {/* Cover Image */}
        {listing.images && listing.images.length > 0 ? (
          <div className="relative w-full h-56 bg-slate-100 overflow-hidden">
            <Image
              src={listing.images[0] || "/placeholder.svg"}
              alt={listing.productName}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-500"
            />
            {/* Image overlay on hover */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            {/* Status badge */}
            <div
              className={`absolute top-2 left-2 flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full shadow-lg ${
                status === "active" ? "bg-emerald-500 text-white" : "bg-slate-500 text-white"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${status === "active" ? "bg-white" : "bg-slate-200"}`} />
              {status === "active" ? "Active" : "Inactive"}
            </div>
          </div>
        ) : (
          <div className="relative w-full h-56 bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
            <Package className="w-16 h-16 text-slate-300" />
          </div>
        )}

        {/* Content */}
        <div className="p-5">
          <h3 className="font-bold text-xl text-slate-900 mb-2 truncate group-hover:text-[#6b2fa5] transition-colors duration-200">
            {listing.productName}
          </h3>
          <p className="text-sm text-slate-600 mb-4 line-clamp-2 leading-relaxed">
            {listing.description}
          </p>
          
          {/* Price */}
          <div className="mb-3 p-3 bg-gradient-to-br from-[#6b2fa5]/5 to-purple-50 rounded-lg border border-[#6b2fa5]/10">
            <p className="text-xs font-medium text-slate-600 mb-0.5">Price</p>
            <p className="text-2xl font-bold text-[#6b2fa5]">{formatPrice(listing.price)}</p>
          </div>

          {/* Quantity + selling window */}
          {(listing.quantity !== undefined || listing.startDate || listing.endDate) && (
            <div className="flex flex-wrap items-center gap-3 mb-3 text-xs text-slate-500">
              {listing.quantity !== undefined && (
                <span className="inline-flex items-center gap-1">
                  <Hash size={12} /> {listing.quantity} in stock
                </span>
              )}
              {(listing.startDate || listing.endDate) && (
                <span className="inline-flex items-center gap-1">
                  <Calendar size={12} />
                  {listing.startDate ? formatDate(listing.startDate) : "Anytime"}
                  {" – "}
                  {listing.endDate ? formatDate(listing.endDate) : "No end date"}
                </span>
              )}
            </div>
          )}

          {/* Status toggle */}
          <button
            type="button"
            onClick={toggleStatus}
            disabled={statusUpdating}
            className={`w-full mb-5 flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-sm font-semibold transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed ${
              status === "active"
                ? "border-[#6b2fa5]/30 bg-[#6b2fa5]/5 text-[#6b2fa5] hover:bg-[#6b2fa5]/10"
                : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
            }`}
          >
            <span className="flex items-center gap-2">
              <Power size={14} />
              {status === "active" ? "Selling — tap to pause" : "Paused — tap to resume selling"}
            </span>
            <span
              className={`inline-flex h-6 w-10 flex-shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 ${
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

          {/* Actions */}
          <div className="flex gap-2">
            {/* Orders Button */}
            <button
              onClick={() => router.push(`/listings/manage/orders/${listing.id}`)}
              className="group/orders relative flex items-center h-11 rounded-lg bg-[#6b2fa5] hover:bg-[#5a2589] text-white transition-all duration-300 ease-out overflow-hidden shadow-sm hover:shadow-md"
              style={{ width: '44px' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.width = '130px'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.width = '44px'
              }}
            >
              <div className="absolute left-3 flex items-center justify-center">
                <Package size={18} className="flex-shrink-0 transition-transform group-hover/orders:scale-110" />
              </div>
              <span className="ml-11 whitespace-nowrap font-semibold text-sm opacity-0 group-hover/orders:opacity-100 transition-opacity duration-300">
                Orders
              </span>
            </button>

            {/* Edit Button */}
            <button
              onClick={() => setEditOpen(true)}
              className="group/edit relative flex items-center h-11 rounded-lg border-2 border-[#6b2fa5] text-[#6b2fa5] bg-transparent hover:bg-[#6b2fa5] hover:text-white transition-all duration-300 ease-out overflow-hidden shadow-sm hover:shadow-md"
              style={{ width: '44px' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.width = '100px'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.width = '44px'
              }}
            >
              <div className="absolute left-3 flex items-center justify-center">
                <Edit2 size={18} className="flex-shrink-0 transition-transform group-hover/edit:rotate-12" />
              </div>
              <span className="ml-11 whitespace-nowrap font-semibold text-sm opacity-0 group-hover/edit:opacity-100 transition-opacity duration-300">
                Edit
              </span>
            </button>

            {/* Delete Button */}
            <button
              onClick={() => setDeleteOpen(true)}
              className="group/delete relative flex items-center h-11 rounded-lg bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white transition-all duration-300 ease-out overflow-hidden shadow-sm hover:shadow-md"
              style={{ width: '44px' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.width = '120px'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.width = '44px'
              }}
            >
              <div className="absolute left-3 flex items-center justify-center">
                <Trash2 size={18} className="flex-shrink-0 transition-transform group-hover/delete:scale-110" />
              </div>
              <span className="ml-11 whitespace-nowrap font-semibold text-sm opacity-0 group-hover/delete:opacity-100 transition-opacity duration-300">
                Delete
              </span>
            </button>
          </div>
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