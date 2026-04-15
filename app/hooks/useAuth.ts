"use client"

import { useEffect, useState, createContext, useContext, ReactNode, createElement } from "react"
import { authFetch, getAccessToken, tryRefreshTokens, clearAccessToken, cancelProactiveRefresh } from "@/lib/auth-client"

type User = {
  id: string
  uid: string
  email: string
  fullName?: string
  isBooker?: boolean
} | null

type AuthContextType = {
  user: User
  loading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Global event emitter for auth changes
let authRefreshListeners: Array<() => void> = []

// Auth initialization promise — resolves when AuthProvider finishes first initialization
let authInitResolvers: Array<() => void> = []
let authInitialized = false

export function triggerAuthRefresh() {
  authRefreshListeners.forEach(callback => callback())
}

export function isAuthInitialized(): boolean {
  return authInitialized
}

/**
 * Returns a promise that resolves when AuthProvider finishes its first initialization.
 * This prevents pages from checking token state before the context is ready.
 */
export async function waitForAuthInit(): Promise<void> {
  if (authInitialized) {
    return Promise.resolve()
  }

  return new Promise<void>((resolve) => {
    authInitResolvers.push(resolve)
  })
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User>(null)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Check if we have an access token in memory
        let token = getAccessToken()

        // If not in memory, try to refresh from the httpOnly cookie.
        // tryRefreshTokens() internally calls scheduleProactiveRefresh on success,
        // so the auto-refresh chain starts here on every cold load.
        if (!token) {
          const refreshed = await tryRefreshTokens()
          if (!refreshed) {
            // No valid session
            setLoading(false)
            if (!authInitialized) {
              authInitialized = true
              authInitResolvers.forEach(resolve => resolve())
              authInitResolvers = []
            }
            return
          }
          token = getAccessToken()
        }

        if (!token) {
          setLoading(false)
          if (!authInitialized) {
            authInitialized = true
            authInitResolvers.forEach(resolve => resolve())
            authInitResolvers = []
          }
          return
        }

        // Fetch user data from our custom auth API
        const response = await authFetch("/api/user/me")
        if (response.ok) {
          const userData = await response.json()
          setUser({
            id: userData.uid || userData.id,
            uid: userData.uid || userData.id,
            email: userData.email,
            fullName: userData.fullName,
            isBooker: userData.isBooker,
          })
        } else if (response.status === 401) {
          // Token is invalid and retry already failed inside authFetch — clear state
          clearAccessToken()
          cancelProactiveRefresh()
          setUser(null)
        }
      } catch (err) {
        console.error("Failed to initialize auth:", err)
      } finally {
        setLoading(false)
        if (!authInitialized) {
          authInitialized = true
          authInitResolvers.forEach(resolve => resolve())
          authInitResolvers = []
        }
      }
    }

    initializeAuth()
  }, [refreshKey])

  // Listen for manual auth refresh triggers (e.g., after login)
  useEffect(() => {
    const handleAuthRefresh = () => {
      setRefreshKey(prev => prev + 1)
    }

    authRefreshListeners.push(handleAuthRefresh)

    return () => {
      authRefreshListeners = authRefreshListeners.filter(cb => cb !== handleAuthRefresh)
    }
  }, [])

  // Listen for session expiry events fired by authFetch / proactive refresh scheduler
  useEffect(() => {
    const handleSessionExpired = () => {
      clearAccessToken()
      cancelProactiveRefresh()
      setUser(null)
      // Redirect to login — preserve current path so user returns after re-auth
      if (typeof window !== "undefined") {
        const currentPath = window.location.pathname + window.location.search
        const loginUrl =
          currentPath === "/" || currentPath.startsWith("/login")
            ? "/login"
            : `/login?redirect=${encodeURIComponent(currentPath)}`
        window.location.replace(loginUrl)
      }
    }

    window.addEventListener("spotix:session-expired", handleSessionExpired)

    return () => {
      window.removeEventListener("spotix:session-expired", handleSessionExpired)
    }
  }, [])

  return createElement(
    AuthContext.Provider,
    { value: { user, loading } },
    children
  )
}

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }

  return context
}
