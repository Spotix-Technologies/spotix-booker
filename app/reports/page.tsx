"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { onAuthStateChanged } from "firebase/auth"
import { auth, db } from "@/lib/firebase"
import { doc, getDoc } from "firebase/firestore"
// import { Nav } from "@/components/nav"
import { Preloader } from "@/components/preloader"
import { ParticlesBackground } from "@/components/particles-background"
import { MerchReportsComponent } from "@/components/reports/merch-reports"
import { EventReportsComponent } from "@/components/reports/event-reports"
import { FileText, Calendar, Package } from "lucide-react"

export default function ReportsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [activeTab, setActiveTab] = useState<"events" | "merch">("events")

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login")
        return
      }

      try {
        const userDocRef = doc(db, "users", user.uid)
        const userDoc = await getDoc(userDocRef)

        if (!userDoc.exists()) {
          router.push("/not-a-booker")
          return
        }

        const userData = userDoc.data()
        const isBooker = userData?.role === "booker" || userData?.isBooker === true

        if (!isBooker) {
          router.push("/not-a-booker")
          return
        }

        setUserId(user.uid)
        setAuthChecked(true)
        setLoading(false)
      } catch (err) {
        console.error("Auth check error:", err)
        router.push("/login")
      }
    })

    return () => unsubscribe()
  }, [router])

  if (!authChecked) {
    return <Preloader isLoading={true} />
  }

  return (
    <>
      <Preloader isLoading={loading} />
      <ParticlesBackground />

      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-slate-100">
        {/* <Nav /> */}

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Header */}
          <div className="mb-10 animate-in fade-in duration-700">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex items-center justify-center w-14 h-14 bg-gradient-to-br from-[#6b2fa5] to-purple-600 rounded-2xl shadow-lg shadow-[#6b2fa5]/30">
                <FileText className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-5xl font-bold bg-gradient-to-r from-[#6b2fa5] via-[#8b3fc5] to-[#6b2fa5] bg-clip-text text-transparent">
                  Reports
                </h1>
                <p className="text-slate-600 text-lg mt-1">View and manage all reports for your events and merchandise</p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="mb-8 animate-in fade-in slide-in-from-top-4 duration-700">
            <div className="bg-white rounded-xl border-2 border-slate-200 p-2 shadow-sm inline-flex gap-2">
              <button
                onClick={() => setActiveTab("events")}
                className={`group relative inline-flex items-center gap-2.5 px-6 py-3 font-semibold text-sm transition-all duration-300 rounded-lg overflow-hidden ${
                  activeTab === "events"
                    ? "text-white bg-gradient-to-r from-[#6b2fa5] to-purple-600 shadow-md"
                    : "text-slate-600 hover:text-[#6b2fa5] hover:bg-slate-50"
                }`}
              >
                {/* Background animation for inactive state */}
                {activeTab !== "events" && (
                  <span className="absolute inset-0 bg-gradient-to-r from-[#6b2fa5]/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
                )}
                
                <Calendar className={`w-5 h-5 transition-transform duration-300 ${activeTab === "events" ? "scale-110" : "group-hover:scale-110"}`} />
                <span className="relative">Event Reports</span>
                
                {/* Active indicator */}
                {activeTab === "events" && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/2 h-1 bg-white rounded-t-full"></span>
                )}
              </button>
              
              <button
                onClick={() => setActiveTab("merch")}
                className={`group relative inline-flex items-center gap-2.5 px-6 py-3 font-semibold text-sm transition-all duration-300 rounded-lg overflow-hidden ${
                  activeTab === "merch"
                    ? "text-white bg-gradient-to-r from-[#6b2fa5] to-purple-600 shadow-md"
                    : "text-slate-600 hover:text-[#6b2fa5] hover:bg-slate-50"
                }`}
              >
                {/* Background animation for inactive state */}
                {activeTab !== "merch" && (
                  <span className="absolute inset-0 bg-gradient-to-r from-[#6b2fa5]/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
                )}
                
                <Package className={`w-5 h-5 transition-transform duration-300 ${activeTab === "merch" ? "scale-110" : "group-hover:scale-110"}`} />
                <span className="relative">Merch Reports</span>
                
                {/* Active indicator */}
                {activeTab === "merch" && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/2 h-1 bg-white rounded-t-full"></span>
                )}
              </button>
            </div>
          </div>

          {/* Tab Content */}
          {userId && (
            <div className="mt-8">
              {activeTab === "events" && (
                <div className="animate-in fade-in duration-500">
                  <EventReportsComponent userId={userId} />
                </div>
              )}
              {activeTab === "merch" && (
                <div className="animate-in fade-in duration-500">
                  <MerchReportsComponent userId={userId} />
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </>
  )
}