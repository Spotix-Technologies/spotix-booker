"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { getAccessToken } from "@/lib/auth-client"
import { waitForAuthInit } from "./useAuth"

/**
 * Hook for protected pages that:
 *   1. Waits for AuthProvider to finish initialization
 *   2. Checks if user has a valid access token
 *   3. Redirects to login if token is invalid
 *
 * Returns { loading: boolean } to indicate when auth check is complete.
 *
 * Usage:
 *   export default function DashboardPage() {
 *     const { loading } = useProtectedPage()
 *     if (loading) return <Preloader />
 *     return <Dashboard />
 *   }
 */
export function useProtectedPage() {
  const router = useRouter()

  useEffect(() => {
    const checkAuth = async () => {
      // Wait for AuthProvider to finish initialization
      await waitForAuthInit()

      // Check if we have a valid access token
      if (!getAccessToken()) {
        router.push("/login")
        return
      }
    }

    checkAuth()
  }, [router])

  return { loading: false }
}
