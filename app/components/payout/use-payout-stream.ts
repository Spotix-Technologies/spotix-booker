"use client"

import { useEffect, useRef, useState } from "react"

export type PayoutLiveStatus = "initializing" | "processing" | "successful" | "failed"

export interface PayoutLiveState {
  reference: string
  status: PayoutLiveStatus
  isEvent: boolean
  isPoll: boolean
  isElection: boolean
  isMerch: boolean
  eventName: string | null
  pollName: string | null
  electionName: string | null
  merchName: string | null
  payDate: string
  amount: number
  narration: string | null
  failureReason: string | null
  durationSeconds: number
  createdAt: string
  resolvedAt: string | null
  /** True once the EventSource itself has delivered at least one event. */
  connected: boolean
  /** True if the stream connection itself broke (not a payout failure). */
  streamError: boolean
}

const TERMINAL: PayoutLiveStatus[] = ["successful", "failed"]

/**
 * Opens (and cleans up) an EventSource against /api/payout/stream for one
 * reference. Reconnects automatically (native EventSource behaviour) as
 * long as the payout hasn't reached a terminal status — once it has, the
 * connection is closed deliberately and never reopened.
 *
 * `onStatusChange` fires on every "status" event this hook receives
 * (including the initial snapshot), so a parent list/table can mirror the
 * live status of a reference without polling its own fetch — e.g. moving
 * a "Processing" badge to "Completed" on a Transaction Days list the
 * moment the payout resolves, without the person refreshing the page.
 */
export function usePayoutStream(reference: string, onStatusChange?: (state: PayoutLiveState) => void): PayoutLiveState {
  const [state, setState] = useState<PayoutLiveState>({
    reference,
    status: "initializing",
    isEvent: false,
    isPoll: false,
    isElection: false,
    isMerch: false,
    eventName: null,
    pollName: null,
    electionName: null,
    merchName: null,
    payDate: "",
    amount: 0,
    narration: null,
    failureReason: null,
    durationSeconds: 0,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    connected: false,
    streamError: false,
  })

  const sourceRef = useRef<EventSource | null>(null)
  // Kept in a ref so the effect below doesn't need to re-run (and reopen
  // the connection) every time the caller passes a fresh callback identity.
  const onStatusChangeRef = useRef(onStatusChange)
  onStatusChangeRef.current = onStatusChange

  useEffect(() => {
    let closed = false

    const source = new EventSource(`/api/payout/stream?reference=${encodeURIComponent(reference)}`)
    sourceRef.current = source

    source.addEventListener("status", (event: MessageEvent) => {
      if (closed) return
      try {
        const data = JSON.parse(event.data)
        setState((prev) => ({ ...prev, ...data, connected: true, streamError: false }))
        // setState's updater must stay pure (React/StrictMode may invoke it
        // twice), so the side-effecting callback lives here instead.
        onStatusChangeRef.current?.({ ...state, ...data, connected: true, streamError: false })
        if (TERMINAL.includes(data.status)) {
          source.close()
        }
      } catch {
        // Malformed event — ignore, next event (or the heartbeat/close) will recover.
      }
    })

    source.addEventListener("error", () => {
      if (closed) return
      setState((prev) => {
        // If we're already terminal, an error here is just the server
        // closing the connection after the final event — not a problem.
        if (TERMINAL.includes(prev.status)) return prev
        return { ...prev, streamError: true }
      })
    })

    return () => {
      closed = true
      source.close()
      sourceRef.current = null
    }
  }, [reference])

  return state
}
