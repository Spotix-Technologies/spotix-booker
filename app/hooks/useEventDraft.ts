"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { authFetch } from "@/lib/auth-client"
import { toast } from "@/lib/toast"

const AUTOSAVE_INTERVAL_MS = 45_000

interface UseEventDraftOptions<T> {
  /** Whatever the caller wants restored — pass the exact shape you'd hand
   *  back to your setters on load. */
  getSnapshot: () => T
  /** Applies a loaded snapshot back onto form state. */
  applySnapshot: (data: T) => void
  /** Whether there's anything worth saving right now. Also drives the
   *  native "leave site?" browser prompt. */
  isDirty: boolean
  /** Turn autosave off (e.g. while a draft is being loaded/applied, or
   *  after the event has already been published). */
  enabled?: boolean
  /** Fires after every successful save, manual or silent — lets the caller
   *  re-sync its own "unsaved since last save" tracking even when a
   *  background autosave (not a click) is what actually saved it. */
  onSaved?: () => void
}

/**
 * Redis-backed draft save/load for the one-time-event form (item 4 of the
 * Sep 2026 UI renovation): a top-right "Save" button plus periodic
 * autosave, a "Load Draft" button, a "Recent changes have been saved to
 * Spotix Cloud" toast, and the browser's native unload warning until the
 * booker saves.
 */
export function useEventDraft<T>({ getSnapshot, applySnapshot, isDirty, enabled = true, onSaved }: UseEventDraftOptions<T>) {
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [hasDraft, setHasDraft] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const getSnapshotRef = useRef(getSnapshot)
  getSnapshotRef.current = getSnapshot
  const isDirtyRef = useRef(isDirty)
  isDirtyRef.current = isDirty
  const onSavedRef = useRef(onSaved)
  onSavedRef.current = onSaved

  // Check once on mount whether a draft already exists, so "Load Draft"
  // can be hidden/shown correctly without the booker needing to click it
  // speculatively.
  useEffect(() => {
    let cancelled = false
    authFetch("/api/create-event/draft", { method: "GET" })
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setHasDraft(!!json?.draft)
      })
      .catch(() => {
        /* best-effort — if this fails, "Load Draft" just stays hidden */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const saveDraft = useCallback(
    async (opts?: { silent?: boolean }) => {
      setIsSaving(true)
      try {
        const res = await authFetch("/api/create-event/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: getSnapshotRef.current() }),
        })
        if (!res.ok) throw new Error("Draft save failed")
        const json = await res.json()
        setHasDraft(true)
        setLastSavedAt(json.updatedAt || new Date().toISOString())
        onSavedRef.current?.()
        if (!opts?.silent) {
          toast.success("Saved", { description: "Recent changes have been saved to Spotix Cloud" })
        }
        return true
      } catch (saveErr) {
        console.error("[useEventDraft] save failed:", saveErr)
        if (!opts?.silent) {
          toast.error("Couldn't save draft", { description: "Check your connection and try again." })
        }
        return false
      } finally {
        setIsSaving(false)
      }
    },
    []
  )

  const loadDraft = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await authFetch("/api/create-event/draft", { method: "GET" })
      if (!res.ok) throw new Error("Draft load failed")
      const json = await res.json()
      if (!json?.draft) {
        toast.info("No saved draft found")
        setHasDraft(false)
        return false
      }
      applySnapshot(json.draft.data as T)
      setLastSavedAt(json.draft.updatedAt)
      toast.success("Draft loaded", { description: "Your saved progress has been restored" })
      return true
    } catch (loadErr) {
      console.error("[useEventDraft] load failed:", loadErr)
      toast.error("Couldn't load draft")
      return false
    } finally {
      setIsLoading(false)
    }
  }, [applySnapshot])

  const clearDraft = useCallback(async () => {
    try {
      await authFetch("/api/create-event/draft", { method: "DELETE" })
      setHasDraft(false)
    } catch {
      // Non-fatal — an orphaned draft just expires on its own via Redis TTL.
    }
  }, [])

  // Periodic background autosave — only while there's something unsaved.
  useEffect(() => {
    if (!enabled) return
    const interval = setInterval(() => {
      if (isDirtyRef.current) saveDraft({ silent: true })
    }, AUTOSAVE_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [enabled, saveDraft])

  return { isSaving, isLoading, hasDraft, lastSavedAt, saveDraft, loadDraft, clearDraft }
}
