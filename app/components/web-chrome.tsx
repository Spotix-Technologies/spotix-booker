"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import { Nav } from "./nav"
import { KycBanner } from "./kyc-banner"

export function WebChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  // since the PWA starts with /m, we can use that to determine whether to show the nav
  const isPwaRoute = pathname?.startsWith("/m")
  const [railExpanded, setRailExpanded] = useState(false)

  return (
    <>
      {!isPwaRoute && <KycBanner />}
      {!isPwaRoute && (
        <Nav railExpanded={railExpanded} onRailExpandedChange={setRailExpanded} />
      )}
      {/* md:pl-16/md:pl-56 keeps page content clear of the fixed left rail
          (see NAV_RAIL_WIDTH / NAV_RAIL_EXPANDED_WIDTH in nav.tsx) and shifts
          it over in step with the rail's own width transition, instead of
          the rail expanding as an overlay on top of static padding. */}
      <div
        className={
          !isPwaRoute
            ? `transition-[padding] duration-200 ease-out ${railExpanded ? "md:pl-56" : "md:pl-16"}`
            : ""
        }
      >
        {children}
      </div>
    </>
  )
}
