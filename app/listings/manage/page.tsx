"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { tryRefreshTokens, getAccessToken, authFetch } from "@/lib/auth-client"
import { ListingCard } from "@/components/listings/listing-card"
import { ListingListRow } from "@/components/listings/listing-list-row"
import { useListings } from "@/hooks/use-listings"
import { Package, Plus, Search, Grid3x3, List } from "lucide-react"

export default function ManageListingsPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const router = useRouter()
  const { listings, loadListings } = useListings()

  useEffect(() => {
    async function init() {
      try {
        let token = getAccessToken()
        if (!token) {
          const ok = await tryRefreshTokens()
          if (!ok) { router.push("/login"); return }
        }
        const res = await authFetch("/api/user/me")
        if (!res.ok) { router.push("/login"); return }
        const me = await res.json()
        const uid = me.uid ?? me.userId ?? me.id ?? ""
        if (!uid) { router.push("/login"); return }
        setUserId(uid)
        loadListings(uid)
      } catch {
        router.push("/login")
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [router, loadListings])

  const filteredListings = listings.filter((listing) =>
    listing.productName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    listing.description?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
        <div className="relative">
          <div className="w-12 h-12 border-4 border-[#6b2fa5]/20 border-t-[#6b2fa5] rounded-full animate-spin" />
          <Package className="w-5 h-5 text-[#6b2fa5] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <p className="mt-4 text-slate-500 text-sm font-medium">Loading your listings...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Package className="w-5 h-5 text-[#6b2fa5]" />
              <span className="text-xs font-semibold text-[#6b2fa5] uppercase tracking-wider">
                {listings.length} {listings.length === 1 ? "Product" : "Products"}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Manage Listings</h1>
            <p className="text-slate-500 text-sm mt-1">Edit, update, or remove your merchandise</p>
          </div>

          <button
            onClick={() => router.push("/listings")}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#6b2fa5] hover:bg-[#5a2589] text-white rounded-xl font-semibold text-sm transition-all duration-200 shadow-sm hover:shadow-md whitespace-nowrap self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            New Listing
          </button>
        </div>

        {listings.length === 0 ? (
          /* Empty state */
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-16 text-center animate-in zoom-in-95 fade-in duration-500">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-2xl mb-5">
              <Package className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">No Listings Yet</h3>
            <p className="text-slate-500 text-sm mb-6 max-w-xs mx-auto">
              Create your first merchandise listing — it only takes a few minutes.
            </p>
            <button
              onClick={() => router.push("/listings")}
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#6b2fa5] hover:bg-[#5a2589] text-white rounded-xl font-semibold text-sm transition-all duration-200 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Create First Listing
            </button>
          </div>
        ) : (
          <>
            {/* Search + View toggle */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6 animate-in fade-in slide-in-from-top-2 duration-500">
              <div className="flex-1 relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search listings..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#6b2fa5]/30 focus:border-[#6b2fa5] transition-all duration-200 shadow-sm"
                />
              </div>

              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm self-start">
                <button
                  onClick={() => setViewMode("grid")}
                  title="Grid view"
                  className={`p-2 rounded-lg transition-all duration-150 ${
                    viewMode === "grid"
                      ? "bg-[#6b2fa5] text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <Grid3x3 size={16} />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  title="List view"
                  className={`p-2 rounded-lg transition-all duration-150 ${
                    viewMode === "list"
                      ? "bg-[#6b2fa5] text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <List size={16} />
                </button>
              </div>
            </div>

            {searchQuery && (
              <p className="text-sm text-slate-500 mb-4">
                <span className="font-semibold text-slate-900">{filteredListings.length}</span>{" "}
                {filteredListings.length === 1 ? "result" : "results"} for &ldquo;{searchQuery}&rdquo;
              </p>
            )}

            {filteredListings.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <Search className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <h3 className="font-semibold text-slate-700 mb-1">No results</h3>
                <p className="text-slate-400 text-sm mb-4">No listings match &ldquo;{searchQuery}&rdquo;</p>
                <button
                  onClick={() => setSearchQuery("")}
                  className="text-sm text-[#6b2fa5] hover:underline font-medium"
                >
                  Clear search
                </button>
              </div>
            ) : (
              <div className={`animate-in fade-in duration-500 ${
                viewMode === "grid"
                  ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
                  : "flex flex-col gap-3"
              }`}>
                {filteredListings.map((listing) =>
                  viewMode === "grid" ? (
                    <ListingCard
                      key={listing.id}
                      listing={listing}
                      userId={userId ?? ""}
                      onUpdate={() => userId && loadListings(userId)}
                    />
                  ) : (
                    <ListingListRow
                      key={listing.id}
                      listing={listing}
                      userId={userId ?? ""}
                      onUpdate={() => userId && loadListings(userId)}
                    />
                  )
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
