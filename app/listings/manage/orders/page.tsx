"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { auth } from "@/lib/firebase"
import { onAuthStateChanged } from "firebase/auth"
// import { Nav } from "@/components/nav"
import { Package, ShoppingBag, AlertCircle, ArrowRight, Image as ImageIcon } from "lucide-react"
import { useListings } from "@/hooks/use-listings"
import Image from "next/image"

export default function OrdersPage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-slate-100">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-[#6b2fa5]/30 border-t-[#6b2fa5] rounded-full animate-spin"></div>
          <Package className="w-8 h-8 text-[#6b2fa5] absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
        </div>
        <p className="mt-4 text-slate-600 font-medium">Loading your listings...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-slate-100">
      {/* <Nav /> */}
      
      <div className="container mx-auto px-4 py-12 max-w-7xl">
        {/* Warning Banner */}
        <div className="mb-8 animate-in fade-in slide-in-from-top-2 duration-700">
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-l-4 border-amber-500 rounded-xl p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center w-10 h-10 bg-amber-100 rounded-full">
                  <AlertCircle className="w-6 h-6 text-amber-600" />
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-amber-900 mb-2">Unconventional Access Notice</h3>
                <p className="text-amber-800 leading-relaxed">
                  You probably shouldn't have accessed orders like this. You may access order details of your merch from the{" "}
                  <button
                    onClick={() => router.push("/listings/manage")}
                    className="font-bold underline hover:text-[#6b2fa5] transition-colors"
                  >
                    listings manage page
                  </button>
                  . Anyway, here are all your listings.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Header Section */}
        <div className="mb-8 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 bg-[#6b2fa5]/10 border border-[#6b2fa5]/20 rounded-full px-4 py-2">
                <Package className="w-4 h-4 text-[#6b2fa5]" />
                <span className="text-sm font-semibold text-[#6b2fa5]">
                  {listings.length} {listings.length === 1 ? 'Listing' : 'Listings'}
                </span>
              </div>
              
              <h1 className="text-5xl font-bold bg-gradient-to-r from-[#6b2fa5] via-[#8b3fc5] to-[#6b2fa5] bg-clip-text text-transparent">
                Your Listings
              </h1>
              
              <p className="text-slate-600 text-lg">
                Select a listing to view its orders
              </p>
            </div>

            <button
              onClick={() => router.push("/listings/manage")}
              className="group inline-flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-[#6b2fa5] to-[#8b3fc5] hover:from-[#5a2789] hover:to-[#6b2fa5] text-white rounded-xl transition-all duration-200 font-bold shadow-lg shadow-[#6b2fa5]/30 hover:shadow-xl hover:shadow-[#6b2fa5]/40 hover:-translate-y-0.5 active:translate-y-0 whitespace-nowrap"
            >
              <Package className="w-5 h-5" />
              <span>Manage Listings</span>
            </button>
          </div>
        </div>

        {/* Listings Grid */}
        {listings.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-16 text-center animate-in zoom-in-95 fade-in duration-700">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-slate-100 rounded-full mb-6">
              <Package className="w-10 h-10 text-slate-400" />
            </div>
            
            <h3 className="text-2xl font-bold text-slate-900 mb-3">No Listings Yet</h3>
            <p className="text-slate-600 mb-8 max-w-md mx-auto">
              You haven't created any merchandise listings yet. Create your first listing to start receiving orders.
            </p>
            
            <button
              onClick={() => router.push("/listings")}
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-[#6b2fa5] to-[#8b3fc5] hover:from-[#5a2789] hover:to-[#6b2fa5] text-white rounded-xl font-bold transition-all duration-200 shadow-lg shadow-[#6b2fa5]/30 hover:shadow-xl hover:shadow-[#6b2fa5]/40 hover:-translate-y-0.5 active:translate-y-0"
              >
                <Package className="w-5 h-5" />
                Create Your First Listing
              </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-700">
            {listings.map((listing) => (
              <div
                key={listing.id}
                className="group bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-[#6b2fa5] hover:shadow-xl hover:shadow-[#6b2fa5]/10 transition-all duration-300"
              >
                {/* Gradient accent line */}
                <div className="h-1 bg-gradient-to-r from-[#6b2fa5] via-purple-400 to-[#6b2fa5] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                
                {/* Listing Image */}
                {listing.images && listing.images.length > 0 ? (
                  <div className="relative w-full h-48 bg-slate-100 overflow-hidden">
                    <Image
                      src={listing.images[0] || "/placeholder.svg"}
                      alt={listing.productName}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </div>
                ) : (
                  <div className="relative w-full h-48 bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                    <ImageIcon className="w-16 h-16 text-slate-300" />
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
                  <div className="mb-5 p-3 bg-gradient-to-br from-[#6b2fa5]/5 to-purple-50 rounded-lg border border-[#6b2fa5]/10">
                    <p className="text-xs font-medium text-slate-600 mb-0.5">Price</p>
                    <p className="text-2xl font-bold text-[#6b2fa5]">
                      ₦{listing.price?.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>

                  {/* View Orders Button */}
                  <button
                    onClick={() => router.push(`/listings/manage/orders/${listing.id}`)}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-[#6b2fa5] hover:bg-[#5a2589] text-white rounded-lg font-semibold transition-all duration-200 shadow-sm hover:shadow-md group/btn"
                  >
                    <ShoppingBag className="w-5 h-5" />
                    <span>View Orders</span>
                    <ArrowRight className="w-4 h-4 transition-transform group-hover/btn:translate-x-1" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}