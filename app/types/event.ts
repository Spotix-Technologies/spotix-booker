// types/events.ts
// Single source of truth for event-related types across the events feature.

export interface EventData {
  id: string
  eventName: string
  eventDate: string
  eventType: string
  isFree: boolean
  ticketsSold: number
  totalCapacity: number | null
  revenue: number
  status: "active" | "past" | "inactive" | "cancelled" | "completed"
  eventVenue: string
  hasMaxSize: boolean
}

export interface CollaboratedEventData extends EventData {
  ownerId: string
  role: string
}