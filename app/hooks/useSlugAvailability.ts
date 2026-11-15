"use client"

/**
 * app/hooks/useSlugAvailability.ts
 *
 * Debounced availability check for an event slug against
 * GET /api/event/slug-check.
 *
 * The old inline effects fired the request every 500ms after a keystroke,
 * which in practice meant a Firestore read per couple of letters typed
 * ("thr", "thre", "three"…). This hook:
 *
 *   • waits SLUG_CHECK_DELAY_MS (5s) after the LAST keystroke before asking
 *   • reports "pending" during that wait (no spinner — nothing is in flight
 *     yet) and "checking" only while the request is actually running
 *   • aborts an in-flight request the moment the slug changes, so a slow
 *     answer for "thre" can never overwrite the verdict for "three"
 *   • remembers recent answers per slug (60s) so backspacing to a slug that
 *     was just checked costs nothing
 *   • exposes checkNow() so an impatient organizer can skip the wait
 *
 * Format validation (3–60 chars, a–z 0–9 hyphen) stays instant and local —
 * only the network round-trip is debounced.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { authFetch } from "@/lib/auth-client"
import { isValidSlug } from "@/lib/slug"

export const SLUG_CHECK_DELAY_MS = 5000
const CACHE_TTL_MS = 60_000

export type SlugAvailability = "idle" | "pending" | "checking" | "available" | "taken" | "invalid"

const cache = new Map<string, { available: boolean; at: number }>()

function readCache(slug: string): boolean | null {
  const hit = cache.get(slug)
  if (!hit) return null
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(slug)
    return null
  }
  return hit.available
}

export function useSlugAvailability(
  slug: string,
  { enabled = true, delayMs = SLUG_CHECK_DELAY_MS }: { enabled?: boolean; delayMs?: number } = {},
): { status: SlugAvailability; checkNow: () => void } {
  const [status, setStatus] = useState<SlugAvailability>("idle")
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const slugRef = useRef(slug)
  slugRef.current = slug

  const cancelPending = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const runCheck = useCallback(async (value: string) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setStatus("checking")
    try {
      const res = await authFetch(`/api/event/slug-check?slug=${encodeURIComponent(value)}`, {
        signal: controller.signal,
      })
      const json = await res.json()
      if (controller.signal.aborted || slugRef.current !== value) return
      const available = !!json.available
      cache.set(value, { available, at: Date.now() })
      setStatus(available ? "available" : "taken")
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return
      if (!controller.signal.aborted && slugRef.current === value) setStatus("idle")
    }
  }, [])

  useEffect(() => {
    cancelPending()
    if (!enabled || !slug) {
      setStatus("idle")
      return
    }
    if (!isValidSlug(slug)) {
      setStatus("invalid")
      return
    }
    const cached = readCache(slug)
    if (cached !== null) {
      setStatus(cached ? "available" : "taken")
      return
    }
    setStatus("pending")
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      void runCheck(slug)
    }, delayMs)
    return cancelPending
  }, [slug, enabled, delayMs, cancelPending, runCheck])

  const checkNow = useCallback(() => {
    const value = slugRef.current
    if (!value || !isValidSlug(value)) return
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const cached = readCache(value)
    if (cached !== null) {
      setStatus(cached ? "available" : "taken")
      return
    }
    void runCheck(value)
  }, [runCheck])

  return { status, checkNow }
}
