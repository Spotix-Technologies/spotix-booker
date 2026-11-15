"use client"

// app/components/observability/EventSwitcher.tsx
//
// The "optinex-user ⌄"-style project switcher from the Vercel reference
// screenshot, adapted to events: "All Events" plus every event the
// organizer owns. Purely a controlled <select> — the parent page owns
// the selected id and what fetching that triggers.

interface EventOption {
  eventId: string
  eventName: string
}

interface EventSwitcherProps {
  selectedEventId: string | null // null = "All Events"
  events: EventOption[]
  onChange: (eventId: string | null) => void
}

export default function EventSwitcher({ selectedEventId, events, onChange }: EventSwitcherProps) {
  return (
    <select
      value={selectedEventId ?? "__all__"}
      onChange={(e) => onChange(e.target.value === "__all__" ? null : e.target.value)}
      className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-800 font-semibold max-w-[220px] truncate focus:outline-none focus:ring-2 focus:ring-[#6b2fa5]/30"
    >
      <option value="__all__">All Events</option>
      {events.map((e) => (
        <option key={e.eventId} value={e.eventId}>
          {e.eventName}
        </option>
      ))}
    </select>
  )
}
