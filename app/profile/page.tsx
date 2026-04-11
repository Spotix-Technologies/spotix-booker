// app/profile/page.tsx

"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { authFetch, getAccessToken, tryRefreshTokens } from "@/lib/auth-client"
import { Preloader } from "@/components/preloader"
import { ParticlesBackground } from "@/components/particles-background"
// import { Nav } from "@/components/nav"
import { ProfileHeader } from "@/components/profile/profile-header"
import { ProfileStats } from "@/components/profile/profile-stats"
import { VirtualEventsSection } from "@/components/profile/virtual-events-section"
import { CollaborationsSection } from "@/components/profile/collaborations-section"
import { PersonalInformation } from "@/components/profile/personal-information"
import { TelegramConnect } from "@/components/profile/telegram-connect"

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
    const loadProfileData = async () => {
      try {
        // Initialize auth — attempt token refresh if not in memory
        let token = getAccessToken()

        if (!token) {
          const refreshed = await tryRefreshTokens()
          if (!refreshed) {
            router.push("/login")
            return
          }
          token = getAccessToken()
        }

        if (!token) {
          router.push("/login")
          return
        }

        // Fetch user data from the API (protected by middleware + authFetch)
        const userResponse = await authFetch("/api/user/me")
        if (!userResponse.ok) {
          router.push("/login")
          return
        }

        const userData = await userResponse.json()
        const userId = userData?.uid || userData?.id

        if (!userId) {
          router.push("/login")
          return
        }

        // Fetch profile stats and BVT data using authFetch
        const [bvtResponse, statsResponse] = await Promise.all([
          authFetch(`/api/profile/bvt?userId=${userId}`),
          authFetch(`/api/profile/stats?userId=${userId}`),
        ])

        const bvtData = await bvtResponse.json()
        const statsData = await statsResponse.json()

        setProfileData({
          uid: userId,
          username: userData.username || "",
          email: userData.email || "",
          fullName: userData.fullName || "",
          profilePicture: userData.profilePicture || "/placeholder.svg",
          bookerName: userData.bookerName || userData.fullName || "",
          dateOfBirth: userData.dateOfBirth || "",
          accountName: userData.accountName || "",
          accountNumber: userData.accountNumber || "",
          bankName: userData.bankName || "",
          eventsCreated: statsData.eventsCreated || 0,
          totalRevenue: statsData.totalRevenue || 0,
          joinDate: userData.createdAt || new Date().toISOString(),
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
    }

    loadProfileData()
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

              {/* Telegram Integration */}
              <section className="mt-8">
                <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">Telegram</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Connect your Telegram to receive ticket sale alerts and manage payouts on the go.
                    </p>
                  </div>
                  <TelegramConnect userId={profileData.uid} />
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </>
  )
}
