"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter, usePathname } from "next/navigation"

interface MaintenanceState {
  isMaintenance: boolean
  maintenanceReason: string | null
  loading: boolean
}

const POLL_INTERVAL = 10 * 60 * 1000 // 10 minutes
const MAINTENANCE_ROUTE = "/maintenance"

export function useMaintenance(): MaintenanceState {
  const router = useRouter()
  const pathname = usePathname()
  const [state, setState] = useState<MaintenanceState>({
    isMaintenance: false,
    maintenanceReason: null,
    loading: true,
  })
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function check() {
    try {
      const res = await fetch("/api/maintenance/status", { cache: "no-store" })
      if (!res.ok) return

      const data = await res.json()
      const isMaintenance: boolean = data.isMaintenance ?? false
      const maintenanceReason: string | null = data.maintenanceReason ?? null

      setState({ isMaintenance, maintenanceReason, loading: false })

      if (isMaintenance && pathname !== MAINTENANCE_ROUTE) {
        router.replace(MAINTENANCE_ROUTE)
      }

      // If maintenance just ended and user is on the maintenance page, send them home
      if (!isMaintenance && pathname === MAINTENANCE_ROUTE) {
        router.replace("/")
      }
    } catch {
      // Network error — fail open (don't block the user)
      setState((prev) => ({ ...prev, loading: false }))
    }
  }

  useEffect(() => {
    check()

    intervalRef.current = setInterval(check, POLL_INTERVAL)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  return state
}   