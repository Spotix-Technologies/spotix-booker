// app/components/logout-dialog.tsx

"use client"

import { useState, useEffect, useCallback } from "react"
import {
  X,
  LogOut,
  Monitor,
  Smartphone,
  Tablet,
  Globe,
  Shield,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Wifi,
} from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────────────────

interface DeviceMeta {
  platform?: string
  model?: string
  appVersion?: string
}

interface Session {
  tokenId: string
  deviceId: string
  deviceMeta: DeviceMeta
  createdAt: string
  lastUsedAt: string
  expiresAt: string
  isCurrent: boolean
}

interface LogoutDialogProps {
  isOpen: boolean
  onClose: () => void
  onLogoutComplete: () => void
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getDeviceIcon(meta: DeviceMeta) {
  const platform = (meta.platform || "").toLowerCase()
  if (platform.includes("android") || platform.includes("ios") || platform.includes("mobile")) {
    return Smartphone
  }
  if (platform.includes("tablet") || platform.includes("ipad")) {
    return Tablet
  }
  if (platform.includes("web") || platform.includes("browser")) {
    return Globe
  }
  return Monitor
}

function getDeviceName(meta: DeviceMeta): string {
  if (meta.model && meta.platform) return `${meta.model} · ${meta.platform}`
  if (meta.model) return meta.model
  if (meta.platform) return meta.platform
  return "Unknown Device"
}

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return `${diffDays} days ago`
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

// ── Component ──────────────────────────────────────────────────────────────────

export function LogoutDialog({ isOpen, onClose, onLogoutComplete }: LogoutDialogProps) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [isLoadingSessions, setIsLoadingSessions] = useState(false)
  const [sessionsError, setSessionsError] = useState("")

  // Per-session logout state: tokenId → "loading" | "done" | "error"
  const [sessionStatus, setSessionStatus] = useState<Record<string, "loading" | "done" | "error">>({})

  // Global logout state
  const [isLoggingOutThis, setIsLoggingOutThis] = useState(false)
  const [isLoggingOutAll, setIsLoggingOutAll] = useState(false)

  // ── Fetch sessions when dialog opens ───────────────────────────────────────

  const fetchSessions = useCallback(async () => {
    setIsLoadingSessions(true)
    setSessionsError("")
    try {
      const res = await fetch("/api/auth/sessions")
      if (!res.ok) throw new Error("Failed to load sessions")
      const data = await res.json()
      setSessions(data.sessions ?? [])
    } catch {
      setSessionsError("Could not load active sessions.")
    } finally {
      setIsLoadingSessions(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      fetchSessions()
      setSessionStatus({})
    }
  }, [isOpen, fetchSessions])

  // ── Logout helpers ─────────────────────────────────────────────────────────

  async function callLogout(allDevices: boolean) {
    const res = await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allDevices }),
    })
    if (!res.ok) throw new Error("Logout request failed")
  }

  const handleLogoutThis = async () => {
    setIsLoggingOutThis(true)
    try {
      await callLogout(false)
      onLogoutComplete()
    } catch {
      setIsLoggingOutThis(false)
    }
  }

  const handleLogoutAll = async () => {
    setIsLoggingOutAll(true)
    try {
      await callLogout(true)
      onLogoutComplete()
    } catch {
      setIsLoggingOutAll(false)
    }
  }

  const handleLogoutSession = async (tokenId: string) => {
    setSessionStatus((s) => ({ ...s, [tokenId]: "loading" }))
    try {
      const res = await fetch("/api/auth/logout/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenId }),
      })
      if (!res.ok) throw new Error()
      setSessionStatus((s) => ({ ...s, [tokenId]: "done" }))
      // Remove from list after brief delay so user sees the checkmark
      setTimeout(() => {
        setSessions((prev) => prev.filter((s) => s.tokenId !== tokenId))
        setSessionStatus((s) => {
          const next = { ...s }
          delete next[tokenId]
          return next
        })
      }, 800)
    } catch {
      setSessionStatus((s) => ({ ...s, [tokenId]: "error" }))
    }
  }

  if (!isOpen) return null

  const currentSession = sessions.find((s) => s.isCurrent)
  const otherSessions = sessions.filter((s) => !s.isCurrent)
  const anyGlobalLoading = isLoggingOutThis || isLoggingOutAll

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-white rounded-2xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 fade-in duration-300 flex flex-col max-h-[90vh]">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 pt-6 pb-5 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-red-50">
              <LogOut className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 leading-tight">Sign Out</h2>
              <p className="text-xs text-slate-500 mt-0.5">Manage your active sessions</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={anyGlobalLoading}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-40"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* ── Primary actions ── */}
        <div className="px-6 py-5 border-b border-slate-100 flex-shrink-0 space-y-3">
          {/* Log out this device */}
          <button
            onClick={handleLogoutThis}
            disabled={anyGlobalLoading}
            className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-slate-200 hover:border-red-300 hover:bg-red-50 transition-all duration-200 group disabled:opacity-50 disabled:cursor-not-allowed text-left"
          >
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-slate-100 group-hover:bg-red-100 transition-colors flex-shrink-0">
              {isLoggingOutThis ? (
                <Loader2 className="w-5 h-5 text-red-500 animate-spin" />
              ) : (
                <Monitor className="w-5 h-5 text-slate-600 group-hover:text-red-500 transition-colors" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-900 text-sm">
                {isLoggingOutThis ? "Signing out…" : "Sign out of this device"}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {currentSession
                  ? getDeviceName(currentSession.deviceMeta)
                  : "Current session"}
              </p>
            </div>
            <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0 animate-pulse" title="Active" />
          </button>

          {/* Log out all devices */}
          <button
            onClick={handleLogoutAll}
            disabled={anyGlobalLoading}
            className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-slate-200 hover:border-red-400 hover:bg-red-50 transition-all duration-200 group disabled:opacity-50 disabled:cursor-not-allowed text-left"
          >
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-slate-100 group-hover:bg-red-100 transition-colors flex-shrink-0">
              {isLoggingOutAll ? (
                <Loader2 className="w-5 h-5 text-red-500 animate-spin" />
              ) : (
                <Shield className="w-5 h-5 text-slate-600 group-hover:text-red-500 transition-colors" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-900 text-sm">
                {isLoggingOutAll ? "Signing out everywhere…" : "Sign out of all devices"}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Revokes all {sessions.length > 0 ? sessions.length : ""} active sessions instantly
              </p>
            </div>
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          </button>
        </div>

        {/* ── Session list ── */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Active Sessions
              </p>
              {!isLoadingSessions && sessions.length > 0 && (
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                  {sessions.length} {sessions.length === 1 ? "session" : "sessions"}
                </span>
              )}
            </div>

            {/* Loading state */}
            {isLoadingSessions && (
              <div className="flex items-center justify-center py-8 gap-2 text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Loading sessions…</span>
              </div>
            )}

            {/* Error state */}
            {sessionsError && !isLoadingSessions && (
              <div className="flex items-center gap-2 py-4 text-red-500 text-sm">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {sessionsError}
              </div>
            )}

            {/* Empty state */}
            {!isLoadingSessions && !sessionsError && sessions.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400 gap-2">
                <Wifi className="w-8 h-8 opacity-30" />
                <p className="text-sm">No active sessions found</p>
              </div>
            )}

            {/* Session cards */}
            {!isLoadingSessions && sessions.length > 0 && (
              <div className="space-y-2">
                {/* Current session first */}
                {currentSession && (
                  <SessionCard
                    session={currentSession}
                    status={sessionStatus[currentSession.tokenId]}
                    onLogout={handleLogoutSession}
                    disabled={anyGlobalLoading}
                  />
                )}
                {/* Other sessions */}
                {otherSessions.map((session) => (
                  <SessionCard
                    key={session.tokenId}
                    session={session}
                    status={sessionStatus[session.tokenId]}
                    onLogout={handleLogoutSession}
                    disabled={anyGlobalLoading}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <button
            onClick={onClose}
            disabled={anyGlobalLoading}
            className="w-full py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Session Card ───────────────────────────────────────────────────────────────

function SessionCard({
  session,
  status,
  onLogout,
  disabled,
}: {
  session: Session
  status?: "loading" | "done" | "error"
  onLogout: (tokenId: string) => void
  disabled: boolean
}) {
  const Icon = getDeviceIcon(session.deviceMeta)
  const deviceName = getDeviceName(session.deviceMeta)
  const lastActive = formatRelativeTime(session.lastUsedAt)
  const isLoading = status === "loading"
  const isDone = status === "done"
  const isError = status === "error"

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 ${
        session.isCurrent
          ? "border-[#6b2fa5]/20 bg-[#6b2fa5]/5"
          : isDone
          ? "border-emerald-200 bg-emerald-50 opacity-60"
          : isError
          ? "border-red-200 bg-red-50"
          : "border-slate-100 bg-slate-50 hover:border-slate-200"
      }`}
    >
      {/* Icon */}
      <div
        className={`flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0 ${
          session.isCurrent ? "bg-[#6b2fa5]/10" : "bg-white"
        }`}
      >
        <Icon
          className={`w-4 h-4 ${session.isCurrent ? "text-[#6b2fa5]" : "text-slate-500"}`}
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-800 truncate">{deviceName}</p>
          {session.isCurrent && (
            <span className="text-[10px] font-bold text-[#6b2fa5] bg-[#6b2fa5]/10 px-1.5 py-0.5 rounded-full whitespace-nowrap">
              THIS DEVICE
            </span>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-0.5">
          Last active {lastActive}
          {session.deviceMeta.appVersion && ` · v${session.deviceMeta.appVersion}`}
        </p>
      </div>

      {/* Action */}
      {!session.isCurrent && (
        <button
          onClick={() => onLogout(session.tokenId)}
          disabled={disabled || isLoading || isDone}
          className="flex-shrink-0 p-2 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Sign out this session"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 text-red-400 animate-spin" />
          ) : isDone ? (
            <CheckCircle className="w-4 h-4 text-emerald-500" />
          ) : isError ? (
            <AlertTriangle className="w-4 h-4 text-red-500" />
          ) : (
            <LogOut className="w-4 h-4 text-slate-400 hover:text-red-500 transition-colors" />
          )}
        </button>
      )}
    </div>
  )
}