"use client"

/**
 * app/mcp/connections/page.tsx
 *
 * "Connected Apps" — the booker-facing counterpart to
 * app/mcp/authorize's consent screen. Every MCP client a booker has
 * approved shows up here (backed by spotix-backend's mcpConnections
 * collection via app/api/mcp/connections/route.ts), with a one-tap
 * revoke that kills the connection's tokens immediately.
 */

import { useEffect, useState } from "react"
import { Bot, ShieldOff, Loader2, AlertCircle, Clock } from "lucide-react"
import { useAuth } from "@/hooks/useAuth"
import { Preloader } from "@/components/preloader"

type Connection = {
  clientId: string
  clientName: string
  logoUri: string | null
  scope: string
  firstAuthorizedAt: string | null
  lastUsedAt: string | null
}

function timeAgo(iso: string | null) {
  if (!iso) return "Never used"
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export default function ConnectedAppsPage() {
  const { user, loading: authLoading } = useAuth()
  const [connections, setConnections] = useState<Connection[] | null>(null)
  const [error, setError] = useState("")
  const [revokingId, setRevokingId] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading || !user) return
    let cancelled = false
    fetch("/api/mcp/connections", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        if (!data.success) throw new Error(data.message || "Failed to load connected apps")
        setConnections(data.connections || [])
      })
      .catch((err) => !cancelled && setError(err.message || "Failed to load connected apps"))
    return () => {
      cancelled = true
    }
  }, [authLoading, user])

  async function handleRevoke(clientId: string) {
    setRevokingId(clientId)
    try {
      const res = await fetch(`/api/mcp/connections?clientId=${encodeURIComponent(clientId)}`, {
        method: "DELETE",
        credentials: "include",
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.message || "Failed to revoke this connection")
      setConnections((prev) => (prev ? prev.filter((c) => c.clientId !== clientId) : prev))
    } catch (err: any) {
      setError(err.message || "Failed to revoke this connection")
    } finally {
      setRevokingId(null)
    }
  }

  if (authLoading) return <Preloader isLoading message="Loading…" />
  if (!user) {
    if (typeof window !== "undefined") window.location.href = "/login?redirect=/mcp/connections"
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-slate-100 px-4 py-10">
      <div className="max-w-lg mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Connected Apps</h1>
          <p className="text-sm text-gray-500 mt-1">
            AI assistants and other MCP clients you&apos;ve connected to your Spotix Booker account.
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 text-red-700 text-sm rounded-xl px-3.5 py-2.5 mb-4">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {connections === null && !error && (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        )}

        {connections?.length === 0 && (
          <div className="text-center py-16 bg-white rounded-2xl shadow-sm">
            <Bot className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No apps connected yet.</p>
          </div>
        )}

        <div className="space-y-3">
          {connections?.map((c) => (
            <div key={c.clientId} className="bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3.5">
              {c.logoUri ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.logoUri} alt="" className="w-11 h-11 rounded-xl object-cover ring-1 ring-gray-100 shrink-0" />
              ) : (
                <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                  <Bot className="w-5 h-5 text-gray-400" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900 truncate">{c.clientName}</p>
                <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                  <Clock className="w-3 h-3" /> {timeAgo(c.lastUsedAt)}
                </p>
              </div>
              <button
                onClick={() => handleRevoke(c.clientId)}
                disabled={revokingId === c.clientId}
                className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-60 shrink-0"
              >
                {revokingId === c.clientId ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldOff className="w-4 h-4" />}
                Revoke
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
