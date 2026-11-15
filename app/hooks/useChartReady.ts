"use client"

// app/hooks/useChartReady.ts
//
// Recharts' <ResponsiveContainer> measures its parent's clientWidth/
// clientHeight the instant it mounts. If that measurement happens
// before the browser has actually laid the page out — e.g. the chart
// mounts inside a CSS grid column, a freshly-swapped tab, or a modal
// whose entrance transition hasn't settled — the parent can report a
// width/height of 0, and recharts logs it as -1 ("The width(-1) and
// height(-1) of chart should be greater than 0…").
//
// The fix isn't to fight recharts' measurement; it's to not give it
// anything to measure until after the first paint. Delaying the
// ResponsiveContainer's mount by one effect tick (this hook) means it
// always measures a DOM that has already been laid out at least once.
//
// Pair this with a same-sized placeholder for the "not ready" render
// (e.g. `<div className="h-64" />` matching the chart's real height)
// so nothing shifts once the real chart mounts in.
import { useEffect, useState } from "react"

export function useChartReady(): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    setReady(true)
  }, [])
  return ready
}
