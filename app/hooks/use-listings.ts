"use client"

import { useState, useCallback } from "react"
import { authFetch } from "@/lib/auth-client"

export function useListings() {
  const [listings, setListings] = useState<any[]>([])

  // userId kept in the signature for backwards compat with existing
  // callers — the API scopes to the authenticated caller itself, via the
  // spotix_at cookie, so it's no longer sent or needed.
  const loadListings = useCallback(async (_userId?: string) => {
    try {
      const res = await authFetch("/api/listings")
      if (!res.ok) {
        console.error("Error loading listings:", await res.text())
        return
      }
      const data = await res.json()
      setListings(data.listings ?? [])
    } catch (error) {
      console.error("Error loading listings:", error)
    }
  }, [])

  return { listings, loadListings }
}
