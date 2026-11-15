"use client"

/**
 * map-providers/use-autocomplete.ts
 *
 * Debounced search-as-you-type against /api/maps/autocomplete for
 * whichever provider the current session was assigned. Debounced client
 * side (300ms) so a fast typist doesn't fire a request per keystroke —
 * this is on top of, not instead of, the session-based Firestore
 * counting in lib/maps/limits.ts (that counter doesn't move per
 * keystroke at all; this debounce just keeps the provider's own request
 * volume reasonable).
 */

import { useEffect, useRef, useState } from "react"
import { authFetch } from "@/lib/auth-client"
import type { MapProvider, PlaceSuggestion } from "@/lib/maps/types"

export function useAutocomplete(provider: MapProvider | null, sessionToken: string | null) {
  const [query, setQuery] = useState("")
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!provider || !sessionToken || !query.trim()) {
      setSuggestions([])
      setError("")
      return
    }

    debounceRef.current = setTimeout(async () => {
      const requestId = ++requestIdRef.current
      setLoading(true)
      setError("")
      try {
        const res = await authFetch(
          `/api/maps/autocomplete?provider=${provider}&q=${encodeURIComponent(query)}&sessionToken=${sessionToken}`
        )
        const data = await res.json()
        if (requestId !== requestIdRef.current) return // stale response, a newer query superseded it
        if (res.ok && data.success) {
          setSuggestions(data.suggestions ?? [])
        } else {
          setError("Location search failed. Please try again.")
        }
      } catch {
        if (requestId === requestIdRef.current) {
          setError("Location search failed. Please try again.")
        }
      } finally {
        if (requestId === requestIdRef.current) setLoading(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [provider, sessionToken, query])

  return { query, setQuery, suggestions, setSuggestions, loading, error, setError }
}
