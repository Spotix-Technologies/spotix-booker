"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { auth } from "@/lib/firebase"
import { onAuthStateChanged } from "firebase/auth"
// import { Nav } from "@/components/nav"
import { ListingCard } from "@/components/listings/listing-card"
import { useListings } from "@/hooks/use-listings"
import { Package, Plus, Search, Grid3x3, List, Filter } from "lucide-react"

export default function ManageListingsPage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const router = useRouter()
  const { listings, loadListings } = useListings()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.push("/login")
      } else {
        setUser(currentUser)
        loadListings(currentUser.uid)
      }
      setLoading(false)
    })
    return () => unsubscribe()
  }, [router, loadListings])

  const filteredListings = listings.filter((listing) =>
    listing.productName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    listing.description?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 via-purple-50/30 to-gray-100">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-[#6b2fa5]/30 border-t-[#6b2fa5] rounded-full animate-spin"></div>
          <Package className="w-8 h-8 text-[#6b2fa5] absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
        </div>
        <p className="mt-4 text-gray-600 font-medium">Loading your listings...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-purple-50/30 to-gray-100">
      {/* <Nav /> */}
      
      <div className="container mx-auto px-4 py-12 max-w-7xl">
        {/* Header Section */}
        <div className="mb-8 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 bg-[#6b2fa5]/10 border border-[#6b2fa5]/20 rounded-full px-4 py-2">
                <Package className="w-4 h-4 text-[#6b2fa5]" />
                <span className="text-sm font-semibold text-[#6b2fa5]">
                  {listings.length} {listings.length === 1 ? 'Product' : 'Products'}
                </span>
              </div>
              
              <h1 className="text-5xl font-bold bg-gradient-to-r from-[#6b2fa5] via-[#8b3fc5] to-[#6b2fa5] bg-clip-text text-transparent">
                Manage Listings
              </h1>
              
              <p className="text-gray-600 text-lg">
                Edit, update, or remove your merchandise listings
              </p>
            </div>

            <button
              onClick={() => router.push("/listings")}
              className="group inline-flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-[#6b2fa5] to-[#8b3fc5] hover:from-[#5a2789] hover:to-[#6b2fa5] text-white rounded-xl transition-all duration-200 font-bold shadow-lg shadow-[#6b2fa5]/30 hover:shadow-xl hover:shadow-[#6b2fa5]/40 hover:-translate-y-0.5 active:translate-y-0 whitespace-nowrap"
            >
              <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-200" />
              <span>Create New Listing</span>
            </button>
          </div>
        </div>

        {listings.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-16 text-center animate-in zoom-in-95 fade-in duration-700">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-100 rounded-full mb-6">
              <Package className="w-10 h-10 text-gray-400" />
            </div>
            
            <h3 className="text-2xl font-bold text-gray-900 mb-3">No Listings Yet</h3>
            <p className="text-gray-600 mb-8 max-w-md mx-auto">
              Get started by creating your first merchandise listing. It only takes a few minutes!
            </p>
            
            <button
              onClick={() => router.push("/listings")}
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-[#6b2fa5] to-[#8b3fc5] hover:from-[#5a2789] hover:to-[#6b2fa5] text-white rounded-xl font-bold transition-all duration-200 shadow-lg shadow-[#6b2fa5]/30 hover:shadow-xl hover:shadow-[#6b2fa5]/40 hover:-translate-y-0.5 active:translate-y-0"
            >
              <Plus className="w-5 h-5" />
              Create Your First Listing
            </button>
          </div>
        ) : (
          <>
            {/* Search and Filter Bar */}
            <div className="flex flex-col sm:flex-row gap-4 mb-8 animate-in fade-in slide-in-from-top-6 duration-700">
              <div className="flex-1 relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  placeholder="Search products by name or description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200 shadow-sm hover:shadow-md"
                />
              </div>

              {/* View Toggle */}
              <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-xl p-1 shadow-sm">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-2 rounded-lg transition-all duration-200 ${
                    viewMode === "grid"
                      ? "bg-[#6b2fa5] text-white shadow-md"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                  title="Grid view"
                >
                  <Grid3x3 size={20} />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-2 rounded-lg transition-all duration-200 ${
                    viewMode === "list"
                      ? "bg-[#6b2fa5] text-white shadow-md"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                  title="List view"
                >
                  <List size={20} />
                </button>
              </div>
            </div>

            {/* Results Count */}
            {searchQuery && (
              <div className="mb-6 animate-in fade-in duration-300">
                <p className="text-gray-600">
                  Found <span className="font-bold text-[#6b2fa5]">{filteredListings.length}</span> {filteredListings.length === 1 ? 'result' : 'results'} for "{searchQuery}"
                </p>
              </div>
            )}

            {/* Listings Grid/List */}
            {filteredListings.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                  <Search className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">No Results Found</h3>
                <p className="text-gray-600 mb-6">
                  We couldn't find any listings matching "{searchQuery}"
                </p>
                <button
                  onClick={() => setSearchQuery("")}
                  className="px-6 py-2 text-[#6b2fa5] hover:bg-[#6b2fa5]/10 rounded-lg font-medium transition-colors duration-200"
                >
                  Clear Search
                </button>
              </div>
            ) : (
              <div
                className={`animate-in fade-in duration-700 ${
                  viewMode === "grid"
                    ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                    : "flex flex-col gap-4"
                }`}
              >
                {filteredListings.map((listing) => (
                  <ListingCard
                    key={listing.id}
                    listing={listing}
                    userId={user?.uid}
                    onUpdate={() => loadListings(user?.uid)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
