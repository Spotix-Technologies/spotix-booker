"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { tryRefreshTokens, getAccessToken } from "@/lib/auth-client"
import { auth } from "@/lib/firebase"
import { onAuthStateChanged } from "firebase/auth"
import Link from "next/link"
import { CreateListingForm } from "@/components/listings/create-listing-form"
// import { Nav } from "@/components/nav"
import { Package, ArrowRight, Sparkles } from "lucide-react"

export default function ListingsPage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Attempt token refresh if not in memory
        let token = getAccessToken()
        if (!token) {
          const refreshed = await tryRefreshTokens()
          if (!refreshed) {
            router.push("/login")
            setLoading(false)
            return
          }
        }
      } catch (err) {
        console.error("Auth initialization error:", err)
        router.push("/login")
        setLoading(false)
        return
      }

      // Also check Firebase auth
      const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        if (!currentUser) {
          router.push("/login")
        } else {
          setUser(currentUser)
        }
        setLoading(false)
      })
      return () => unsubscribe()
    }

    initializeAuth()
  }, [router])


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
        <div className="mb-12 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 bg-[#6b2fa5]/10 border border-[#6b2fa5]/20 rounded-full px-4 py-2">
                <Sparkles className="w-4 h-4 text-[#6b2fa5]" />
                <span className="text-sm font-semibold text-[#6b2fa5]">New Listing</span>
              </div>
              
              <h1 className="text-5xl font-bold bg-gradient-to-r from-[#6b2fa5] via-[#8b3fc5] to-[#6b2fa5] bg-clip-text text-transparent">
                Create Merch Listing
              </h1>
              
              <p className="text-gray-600 text-lg max-w-2xl">
                Upload and manage your event merchandise with ease. Add products that your attendees will love.
              </p>

              {/* Quick Stats */}
              <div className="flex flex-wrap gap-4 pt-2">
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-gray-600">Easy Upload</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span className="text-gray-600">Instant Publishing</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-2 h-2 bg-[#6b2fa5] rounded-full"></div>
                  <span className="text-gray-600">Full Control</span>
                </div>
              </div>
            </div>

            {/* Manage Listings Button */}
            <Link
              href="/listings/manage"
              className="group inline-flex items-center justify-center gap-2 px-6 py-4 bg-white hover:bg-gray-50 text-[#6b2fa5] rounded-xl border-2 border-[#6b2fa5] hover:border-[#5a2789] transition-all duration-200 font-bold shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 whitespace-nowrap"
            >
              <Package className="w-5 h-5" />
              <span>Manage Listings</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-200" />
            </Link>
          </div>
        </div>

        {/* Info Cards */}
        <div className="grid md:grid-cols-3 gap-4 mb-8 animate-in fade-in slide-in-from-top-6 duration-700">
          <div className="bg-white rounded-xl p-5 shadow-md border border-gray-100 hover:shadow-lg transition-shadow duration-200">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-gray-900 mb-1">High Quality Images</h3>
                <p className="text-sm text-gray-600">Upload up to 6 images per product</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-md border border-gray-100 hover:shadow-lg transition-shadow duration-200">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-gray-900 mb-1">Instant Updates</h3>
                <p className="text-sm text-gray-600">Changes reflect immediately</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-md border border-gray-100 hover:shadow-lg transition-shadow duration-200">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-[#6b2fa5]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-[#6b2fa5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-gray-900 mb-1">Secure & Private</h3>
                <p className="text-sm text-gray-600">Your data is protected</p>
              </div>
            </div>
          </div>
        </div>

        {/* Form Section */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
          <CreateListingForm userId={user?.uid} />
        </div>
      </div>
    </div>
  )
}
