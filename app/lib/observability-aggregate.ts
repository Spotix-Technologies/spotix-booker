// app/lib/observability-aggregate.ts
//
// Small, pure helpers for working with the bucket → count maps Numerox
// attaches to every DailyStats entry (`locations`, `devices`) and the
// per-day `uniqueVisitors` counter. Shared by:
//   - app/api/observability/route.ts   (merging across every event the
//     organizer owns, per calendar date, on the server)
//   - components/observability/ObservabilityEventView.tsx and
//     LocationDeviceBreakdown.tsx (merging across the selected date
//     range, on the client, from whatever `daily` array the page
//     already fetched — no extra request needed)
//
// Kept dependency-free and side-effect-free so it's safe to call from
// either an API route or a client component.

export type CountMap = Record<string, number>

/** Sums any number of bucket → count maps into one. Missing/undefined
 * maps are skipped rather than throwing — not every day necessarily has
 * location or device data (e.g. a local-dev request with no edge geo
 * headers still tracks the page view itself, just without a bucket). */
export function mergeCountMaps(...maps: Array<CountMap | null | undefined>): CountMap {
  const merged: CountMap = {}
  for (const map of maps) {
    if (!map) continue
    for (const [key, value] of Object.entries(map)) {
      merged[key] = (merged[key] ?? 0) + (value ?? 0)
    }
  }
  return merged
}

/** Sums `uniqueVisitors` across a `daily` array. NOTE: this is a sum of
 * *daily* unique-visitor counts, not a deduplicated unique-over-range
 * count — a visitor who returns on two different days within the
 * selected range is counted once per day, the same way Page Views is a
 * sum of daily totals. That's the same convention Numerox itself uses
 * for every other totals.* field, so it stays consistent with the rest
 * of this dashboard rather than silently meaning something different. */
export function sumUniqueVisitors(daily: Array<{ uniqueVisitors?: number }>): number {
  return daily.reduce((sum, day) => sum + (day.uniqueVisitors ?? 0), 0)
}

export interface RankedEntry {
  key: string
  value: number
  /** Share of the map's total, 0–1. Handy for bar widths / percentages. */
  share: number
}

/** Turns a bucket → count map into a descending-by-count list with each
 * entry's share of the total baked in, so components don't recompute a
 * sum on every render. */
export function rankCountMap(map: CountMap): RankedEntry[] {
  const total = Object.values(map).reduce((sum, v) => sum + v, 0)
  return Object.entries(map)
    .map(([key, value]) => ({ key, value, share: total > 0 ? value / total : 0 }))
    .sort((a, b) => b.value - a.value)
}
