export type HistoryValue = unknown
export type HistoryChange = { before: HistoryValue; after: HistoryValue }

export type HistoryActor = {
  uid?: string
  type?: "organizer" | "event_teammate" | "Spotix" | string
  role?: string
  name?: string | null
}

export type HistoryEntry = {
  id: string
  action?: string
  summary?: string
  actor?: HistoryActor
  changes?: Record<string, HistoryChange>
  reason?: string
  source?: string
  createdAt?: string | null
}
