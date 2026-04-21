"use client"

import { useMaintenance } from "@/hooks/useMaintenance"

export function MaintenanceProvider({ children }: { children: React.ReactNode }) {
  const { loading } = useMaintenance()

  // While the first check is in flight, render nothing to avoid a flash
  // of the real app before a potential redirect kicks in.
  if (loading) return null

  return <>{children}</>
}