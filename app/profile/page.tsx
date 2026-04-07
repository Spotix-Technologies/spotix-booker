"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { onAuthStateChanged } from "firebase/auth"
import { auth, db } from "@/lib/firebase"
import { doc, getDoc } from "firebase/firestore"
import { Preloader } from "@/components/preloader"
import { ParticlesBackground } from "@/components/particles-background"
// import { Nav } from "@/components/nav"
import { ProfileHeader } from "@/components/profile/profile-header"
import { ProfileStats } from "@/components/profile/profile-stats"
import { VirtualEventsSection } from "@/components/profile/virtual-events-section"
import { CollaborationsSection } from "@/components/profile/collaborations-section"
import { PersonalInformation } from "@/components/profile/personal-information"

interface ProfileData {
  uid: string
  username: string
  email: string
  fullName: string
  profilePicture: string
  bookerName: string
  dateOfBirth: string
  accountName: string
  accountNumber: string
  bankName: string
  eventsCreated: number
  totalRevenue: number
  joinDate: string
  isVerified: boolean
  bvt?: string
  enabledCollaboration?: boolean
}

export default function ProfilePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [profileData, setProfileData] = useState<ProfileData | null>(null)
  const [authChecked, setAuthChecked] = useState(false)

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

        const [bvtResponse, statsResponse] = await Promise.all([
          fetch(`/api/profile/bvt?userId=${user.uid}`),
          fetch(`/api/profile/stats?userId=${user.uid}`),
        ])

        const bvtData = await bvtResponse.json()
        const statsData = await statsResponse.json()

        setProfileData({
          uid: user.uid,
          username: userData.username || "",
          email: user.email || "",
          fullName: userData.fullName || "",
          profilePicture: userData.profilePicture || "/placeholder.svg",
          bookerName: userData.bookerName || userData.fullName || "",
          dateOfBirth: userData.dateOfBirth || "",
          accountName: userData.accountName || "",
          accountNumber: userData.accountNumber || "",
          bankName: userData.bankName || "",
          eventsCreated: statsData.eventsCreated || 0,
          totalRevenue: statsData.totalRevenue || 0,
          joinDate: user.metadata?.creationTime || new Date().toISOString(),
          isVerified: userData.isVerified || false,
          bvt: bvtData.bvt || "",
          enabledCollaboration: userData.enabledCollaboration || false,
        })

        setAuthChecked(true)
      } catch (err) {
        console.error("Profile load error:", err)
        router.push("/login")
      } finally {
        setLoading(false)
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

      <div className="min-h-screen bg-background">
        {/* <Nav /> */}

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {profileData && (
            <>
              <ProfileHeader profileData={profileData} />
              <ProfileStats profileData={profileData} />
              <VirtualEventsSection profileData={profileData} />
              <CollaborationsSection profileData={profileData} />
              <PersonalInformation profileData={profileData} />
            </>
          )}
        </main>
      </div>
    </>
  )
}
