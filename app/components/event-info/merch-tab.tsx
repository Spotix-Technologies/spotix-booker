"use client"

import { useState, useEffect, useMemo } from "react"
import Image from "next/image"
import { db } from "@/lib/firebase"
import { collection, getDocs } from "firebase/firestore"
import { Trash2, Plus, Search, X, AlertCircle } from "lucide-react"

interface Listing {
  id: string
  productName: string
  description: string
  price: number
  images: string[]
}

interface AddedListing extends Listing {
  firestoreId: string
}

interface MerchTabProps {
  eventId: string
  eventName: string
  currentUserId: string
}

export default function MerchTab({ eventId, eventName, currentUserId }: MerchTabProps) {
  const [userListings, setUserListings] = useState<Listing[]>([])
  const [addedListings, setAddedListings] = useState<AddedListing[]>([])
  const [selectedListingId, setSelectedListingId] = useState<string>("")
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [listingToRemove, setListingToRemove] = useState<AddedListing | null>(null)
  const [addError, setAddError] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const formatPrice = (price: number): string => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
      .format(price)
      .replace("NGN", "₦")
      .trim()
  }

  // ── Fetch user's own listings (client SDK — listing store, not event-specific) ──
  useEffect(() => {
    if (!currentUserId) return
    const fetchUserListings = async () => {
      try {
        const snapshot = await getDocs(
          collection(db, "listing", currentUserId, "products")
        )
        setUserListings(
          snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Listing))
        )
      } catch (e) {
        console.error("Error fetching user listings:", e)
      }
    }
    fetchUserListings()
  }, [currentUserId])

  // ── Fetch event's added listings via API ───────────────────────────────────
  useEffect(() => {
    const fetchAddedListings = async () => {
      setFetching(true)
      setFetchError(null)
      try {
        const res = await fetch(`/api/event/list/${eventId}/merch`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Failed to fetch merchandise")
        setAddedListings(data.listings)
      } catch (e: any) {
        console.error("Error fetching added listings:", e)
        setFetchError(e.message || "Failed to load merchandise")
      } finally {
        setFetching(false)
      }
    }
    fetchAddedListings()
  }, [eventId])

  // ── Available listings (exclude already added) ─────────────────────────────
  const availableListings = useMemo(() => {
    const addedIds = new Set(addedListings.map((l) => l.id))
    return userListings.filter((l) => !addedIds.has(l.id))
  }, [userListings, addedListings])

  const filteredAvailableListings = useMemo(() => {
    if (!searchQuery.trim()) return availableListings
    const q = searchQuery.toLowerCase()
    return availableListings.filter(
      (l) =>
        l.productName.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q) ||
        l.price.toString().includes(q)
    )
  }, [availableListings, searchQuery])

  // ── Add listing ────────────────────────────────────────────────────────────
  const handleAddListing = async () => {
    if (!selectedListingId) return
    setAddError(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/event/list/${eventId}/merch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: selectedListingId, currentUserId, eventName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to add listing")

      setAddedListings((prev) => [...prev, data.listing])
      setSelectedListingId("")
      setSearchQuery("")
    } catch (e: any) {
      console.error("Error adding listing:", e)
      setAddError(e.message || "Failed to add listing")
    } finally {
      setLoading(false)
    }
  }

  // ── Remove listing ─────────────────────────────────────────────────────────
  const handleRemoveListing = async () => {
    if (!listingToRemove) return
    setLoading(true)
    try {
      const res = await fetch(`/api/event/list/${eventId}/merch`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firestoreId: listingToRemove.firestoreId, eventName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to remove listing")

      setAddedListings((prev) => prev.filter((l) => l.id !== listingToRemove.id))
      setListingToRemove(null)
    } catch (e: any) {
      console.error("Error removing listing:", e)
      setFetchError(e.message || "Failed to remove listing")
      setListingToRemove(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Add Listing Section */}
      <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl border border-slate-200 p-4 sm:p-6 shadow-sm">
        <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-4">Add Merchandise</h3>

        {/* Search */}
        {availableListings.length > 0 && (
          <div className="mb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, description, or price..."
                className="w-full pl-10 pr-10 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#6b2fa5] focus:border-transparent transition-all"
                disabled={loading}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X size={18} />
                </button>
              )}
            </div>
            {searchQuery && (
              <p className="text-xs text-slate-500 mt-2">
                {filteredAvailableListings.length} result{filteredAvailableListings.length !== 1 ? "s" : ""} found
              </p>
            )}
          </div>
        )}

        {/* Select + Add */}
        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={selectedListingId}
            onChange={(e) => { setSelectedListingId(e.target.value); setAddError(null) }}
            className="w-full sm:flex-1 px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#6b2fa5] focus:border-transparent transition-all"
            disabled={loading || availableListings.length === 0}
          >
            <option value="">
              {availableListings.length === 0 ? "No available listings" : "Select a listing"}
            </option>
            {filteredAvailableListings.map((listing) => (
              <option key={listing.id} value={listing.id}>
                {listing.productName} - {formatPrice(listing.price)}
              </option>
            ))}
          </select>
          <button
            onClick={handleAddListing}
            disabled={loading || !selectedListingId || availableListings.length === 0}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-[#6b2fa5] text-white rounded-lg hover:bg-[#5a2589] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 font-medium shadow-md hover:shadow-lg"
          >
            <Plus size={18} />
            <span>Add Listing</span>
          </button>
        </div>

        {/* Inline add error */}
        {addError && (
          <div className="mt-3 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
            <AlertCircle size={16} className="shrink-0" />
            <span>{addError}</span>
          </div>
        )}

        {/* Info messages */}
        {userListings.length === 0 && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-blue-700 text-sm">
              No listings found. Create a listing first to add it to your event.
            </p>
          </div>
        )}
        {userListings.length > 0 && availableListings.length === 0 && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-700 text-sm font-medium">
              ✓ All your listings have been added to this event!
            </p>
          </div>
        )}
        {searchQuery && filteredAvailableListings.length === 0 && availableListings.length > 0 && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-amber-700 text-sm">No listings match your search. Try a different term.</p>
          </div>
        )}
      </div>

      {/* Fetch / remove error */}
      {fetchError && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
          <AlertCircle size={16} className="shrink-0" />
          <span>{fetchError}</span>
        </div>
      )}

      {/* Added Listings */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg sm:text-xl font-bold text-slate-900">Event Merchandise</h3>
          {addedListings.length > 0 && (
            <span className="px-3 py-1 bg-[#6b2fa5] text-white text-sm font-semibold rounded-full">
              {addedListings.length} {addedListings.length === 1 ? "Item" : "Items"}
            </span>
          )}
        </div>

        {fetching ? (
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-[#6b2fa5] border-r-transparent mb-4" />
            <p className="text-slate-600">Loading merchandise...</p>
          </div>
        ) : addedListings.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 sm:p-12 text-center shadow-sm">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Plus size={32} className="text-slate-400" />
            </div>
            <p className="text-slate-600 font-medium">No merchandise added yet</p>
            <p className="text-slate-500 text-sm mt-2">Add your first listing to this event</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {addedListings.map((listing) => (
              <div
                key={listing.id}
                className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              >
                {listing.images && listing.images.length > 0 && (
                  <div className="relative w-full h-48 bg-slate-100">
                    <Image
                      src={listing.images[0] || "/placeholder.svg"}
                      alt={listing.productName}
                      fill
                      className="object-cover"
                    />
                  </div>
                )}
                <div className="p-4">
                  <h4 className="font-bold text-base sm:text-lg text-slate-900 mb-2 truncate" title={listing.productName}>
                    {listing.productName}
                  </h4>
                  <p className="text-sm text-slate-600 mb-3 line-clamp-2">{listing.description}</p>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xl sm:text-2xl font-bold text-[#6b2fa5]">{formatPrice(listing.price)}</p>
                  </div>
                  <div className="text-xs text-slate-500 mb-3 p-2 bg-slate-50 rounded-lg border border-slate-200">
                    <strong className="text-slate-700">ID:</strong>{" "}
                    <span className="font-mono">{listing.id}</span>
                  </div>
                  <button
                    onClick={() => setListingToRemove(listing)}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 font-medium shadow-sm hover:shadow"
                  >
                    <Trash2 size={16} />
                    <span>Remove from Event</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Remove Confirmation Modal */}
      {listingToRemove && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 size={22} className="text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 text-center">Remove Listing?</h3>
              <p className="text-sm text-slate-500 text-center mt-2">
                Are you sure you want to remove{" "}
                <span className="font-semibold text-slate-700">{listingToRemove.productName}</span>{" "}
                from this event? This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={() => setListingToRemove(null)}
                className="flex-1 py-2.5 px-4 rounded-xl border-2 border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-all duration-200"
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveListing}
                disabled={loading}
                className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 text-white font-semibold text-sm hover:bg-red-700 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed active:scale-95"
              >
                {loading ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}