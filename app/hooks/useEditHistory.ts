"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { authFetch } from "@/lib/auth-client"
import type { HistoryEntry } from "@/types/edit-history"

const PAGE_SIZE = 25

/** Loads an event's edit history (newest first) with cursor pagination. */
export function useEditHistory(eventId: string) {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)

  const fetchPage = useCallback(
    async (before: string | null) => {
      const qs = new URLSearchParams({ limit: String(PAGE_SIZE) })
      if (before) qs.set("before", before)
      const res = await authFetch(`/api/event/list/${eventId}/edit-history?${qs}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || "Failed to load edit history")
      return json as { entries: HistoryEntry[]; nextCursor: string | null }
    },
    [eventId],
  )

  const refresh = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    setError(null)
    try {
      const page = await fetchPage(null)
      if (id !== requestId.current) return
      setEntries(page.entries)
      setCursor(page.nextCursor)
    } catch (e) {
      if (id === requestId.current) setError(e instanceof Error ? e.message : "Failed to load edit history")
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [fetchPage])

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await fetchPage(cursor)
      setEntries((prev) => [...prev, ...page.entries])
      setCursor(page.nextCursor)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load more")
    } finally {
      setLoadingMore(false)
    }
  }, [cursor, fetchPage, loadingMore])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { entries, loading, loadingMore, error, hasMore: Boolean(cursor), refresh, loadMore }
}
