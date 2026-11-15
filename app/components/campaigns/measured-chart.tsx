"use client"

/**
 * app/components/campaigns/measured-chart.tsx
 *
 * Fixed-height chart box that measures its OWN width and hands it to the chart
 * as a plain number.
 *
 * Why not <ResponsiveContainer>: on recharts 3.5.x it starts from a -1 x -1
 * size and logs "The width(-1) and height(-1) of chart should be greater than
 * 0" (recharts issue #6716), and when its parent is resized (sidebar toggles,
 * device-toolbar resize, orientation change) it can re-measure into a collapsed
 * chart. Here the chart is never rendered until the box has a real width, and
 * from then on it always gets an explicit width + height — nothing to guess.
 *
 *   <MeasuredChart height={260}>
 *     {(width) => <BarChart width={width} height={260} data={data}>…</BarChart>}
 *   </MeasuredChart>
 *
 * Keep the `height` prop and the chart's own `height` equal.
 */

import { useEffect, useRef, useState, type ReactNode } from "react"

export function MeasuredChart({ height, children, className = "" }: {
  height: number
  children: (width: number) => ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const measure = () => {
      const w = Math.floor(el.getBoundingClientRect().width)
      setWidth((prev) => (prev === w ? prev : w))
    }
    measure()

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure)
      return () => window.removeEventListener("resize", measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // overflow-hidden + min-w-0: the chart is a fixed-width SVG, and without
  // these it could hold its container (and a flex/grid parent) open at the old
  // width when the window gets narrower, so the ResizeObserver would never see
  // the shrink.
  return (
    <div ref={ref} className={`w-full min-w-0 overflow-hidden ${className}`} style={{ height }}>
      {width > 0 ? children(width) : null}
    </div>
  )
}
