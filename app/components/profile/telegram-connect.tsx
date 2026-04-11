"use client"

import { useEffect, useState, useCallback } from "react"
import { authFetch } from "@/lib/auth-client"
import { Loader2, CheckCircle2, Copy, Check, Unlink, AlertTriangle } from "lucide-react"
import Image from "next/image"

interface TelegramStatus {
  connected: boolean
  telegramUsername: string | null
  linkedAt: string | null
  hasPendingToken: boolean
  pendingToken: string | null
}

interface TelegramConnectProps {
  userId: string
}

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "SpotixBookerBot"
const POLL_INTERVAL = 3000
const POLL_TIMEOUT = 15 * 60 * 1000

export function TelegramConnect({ userId }: TelegramConnectProps) {
  const [status, setStatus] = useState<TelegramStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [creatingToken, setCreatingToken] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [pollError, setPollError] = useState(false)
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  // ── Fetch current telegram status ──────────────────────────────────────────
  const fetchStatus = useCallback(async (): Promise<TelegramStatus | null> => {
    try {
      const res = await authFetch(`/api/profile/telegram?userId=${userId}`)
      if (!res.ok) return null
      return await res.json()
    } catch {
      return null
    }
  }, [userId])

  useEffect(() => {
    fetchStatus().then((data) => {
      if (data) setStatus(data)
      setLoadingStatus(false)
      if (data?.hasPendingToken && !data?.connected) setWaiting(true)
    })
  }, [fetchStatus])

  // ── Poll for connection after token is generated ────────────────────────────
  useEffect(() => {
    if (!waiting) return
    const startedAt = Date.now()

    const interval = setInterval(async () => {
      if (Date.now() - startedAt > POLL_TIMEOUT) {
        clearInterval(interval)
        setWaiting(false)
        setPollError(true)
        return
      }
      const data = await fetchStatus()
      if (!data) return
      setStatus(data)
      if (data.connected) {
        clearInterval(interval)
        setWaiting(false)
      }
    }, POLL_INTERVAL)

    return () => clearInterval(interval)
  }, [waiting, fetchStatus])

  // ── Create token ───────────────────────────────────────────────────────────
  const handleCreateToken = async () => {
    setCreatingToken(true)
    setPollError(false)
    try {
      const res = await authFetch("/api/profile/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      })
      if (!res.ok) throw new Error("Failed to create token")
      const data = await res.json()
      setStatus((prev) =>
        prev
          ? { ...prev, hasPendingToken: true, pendingToken: data.token }
          : {
              connected: false,
              telegramUsername: null,
              linkedAt: null,
              hasPendingToken: true,
              pendingToken: data.token,
            }
      )
      setWaiting(true)
    } catch (err) {
      console.error("Token creation error:", err)
    } finally {
      setCreatingToken(false)
    }
  }

  // ── Disconnect ─────────────────────────────────────────────────────────────
  const handleDisconnect = async () => {
    setDisconnecting(true)
    try {
      const res = await authFetch("/api/profile/telegram", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      })
      if (!res.ok) throw new Error("Failed to disconnect")
      setStatus((prev) =>
        prev
          ? { ...prev, connected: false, telegramUsername: null, linkedAt: null }
          : null
      )
      setShowDisconnectDialog(false)
    } catch (err) {
      console.error("Disconnect error:", err)
    } finally {
      setDisconnecting(false)
    }
  }

  // ── Copy token ─────────────────────────────────────────────────────────────
  const handleCopy = async () => {
    if (!status?.pendingToken) return
    await navigator.clipboard.writeText(`/connect ${status.pendingToken}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loadingStatus) {
    return (
      <div className="flex items-center gap-2.5 text-sm text-muted-foreground py-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Checking Telegram status…</span>
      </div>
    )
  }

  // ── Connected ──────────────────────────────────────────────────────────────
  if (status?.connected && status.telegramUsername) {
    return (
      <>
        {/* Disconnect confirmation dialog */}
        {showDisconnectDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => !disconnecting && setShowDisconnectDialog(false)}
            />
            {/* Dialog */}
            <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-background shadow-2xl p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Disconnect Telegram</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    You will be disconnected from the bot and will no longer receive real-time
                    alerts or manage payouts via Telegram.
                  </p>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setShowDisconnectDialog(false)}
                  disabled={disconnecting}
                  className="flex-1 px-4 py-2 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="flex-1 px-4 py-2 rounded-xl bg-destructive hover:bg-destructive/90 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {disconnecting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Unlink className="w-4 h-4" />
                  )}
                  {disconnecting ? "Disconnecting…" : "Disconnect"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Connected card */}
        <div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="relative shrink-0 w-9 h-9">
                <Image
                  src="/telegram-logo.png"
                  alt="Telegram"
                  fill
                  className="object-contain"
                />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                  <p className="text-sm font-medium text-foreground">Telegram Connected</p>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  @{status.telegramUsername}
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowDisconnectDialog(true)}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/5 transition-colors"
            >
              <Unlink className="w-3.5 h-3.5" />
              Disconnect
            </button>
          </div>
        </div>
      </>
    )
  }

  // ── Waiting / steps flow ───────────────────────────────────────────────────
  if (waiting && status?.pendingToken) {
    return (
      <div className="rounded-2xl border border-[#6b2fa5]/25 bg-[#6b2fa5]/5 p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="relative shrink-0 w-8 h-8">
            <Image src="/telegram-logo.png" alt="Telegram" fill className="object-contain" />
          </div>
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-[#6b2fa5]" />
            <span className="text-sm font-medium text-foreground">Waiting for connection…</span>
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-3">
          {/* Step 1 */}
          <div className="flex gap-3">
            <div className="shrink-0 w-5 h-5 rounded-full bg-[#6b2fa5]/15 border border-[#6b2fa5]/30 flex items-center justify-center">
              <span className="text-[10px] font-bold text-[#6b2fa5]">1</span>
            </div>
            <div className="space-y-1.5 pt-0.5 flex-1">
              <p className="text-xs font-medium text-foreground">Launch the bot</p>
              <a
                href={`https://t.me/${BOT_USERNAME}?start=connect`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#6b2fa5] hover:bg-[#5a2590] text-white text-xs font-medium transition-colors"
              >
                <div className="relative w-3.5 h-3.5">
                  <Image src="/telegram-logo.png" alt="" fill className="object-contain brightness-[100] invert" />
                </div>
                Open @{BOT_USERNAME} and click Start
              </a>
            </div>
          </div>

          {/* Divider */}
          <div className="ml-2.5 w-px h-3 bg-[#6b2fa5]/20" />

          {/* Step 2 */}
          <div className="flex gap-3">
            <div className="shrink-0 w-5 h-5 rounded-full bg-[#6b2fa5]/15 border border-[#6b2fa5]/30 flex items-center justify-center">
              <span className="text-[10px] font-bold text-[#6b2fa5]">2</span>
            </div>
            <div className="space-y-1.5 pt-0.5 flex-1">
              <p className="text-xs font-medium text-foreground">
                Send this command in the bot chat
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-background border border-border rounded-lg px-3 py-2 font-mono text-foreground truncate">
                  /connect {status.pendingToken}
                </code>
                <button
                  onClick={handleCopy}
                  className="shrink-0 p-2 rounded-lg border border-border hover:bg-muted transition-colors"
                  title="Copy command"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-green-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </button>
              </div>
              {copied && (
                <p className="text-[10px] text-green-600 dark:text-green-400">Command copied!</p>
              )}
            </div>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground border-t border-[#6b2fa5]/15 pt-3">
          Token expires in 15 minutes. This page will update automatically once connected.
        </p>
      </div>
    )
  }

  // ── Default: not connected ─────────────────────────────────────────────────
  return (
    <div className="rounded-2xl border border-border p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="relative shrink-0 w-9 h-9">
          <Image src="/telegram-logo.png" alt="Telegram" fill className="object-contain" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Connect Telegram</p>
          <p className="text-xs text-muted-foreground">
            Get real-time ticket alerts and manage payouts from Telegram.
          </p>
        </div>
      </div>

      {pollError && (
        <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/5 border border-destructive/15 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Token expired before connection was made. Generate a new one.
        </div>
      )}

      <button
        onClick={handleCreateToken}
        disabled={creatingToken}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#6b2fa5] hover:bg-[#5a2590] disabled:opacity-60 text-white text-sm font-medium transition-colors"
      >
        {creatingToken ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <div className="relative w-4 h-4">
            <Image src="/telegram-logo.png" alt="" fill className="object-contain brightness-0 invert" />
          </div>
        )}
        {creatingToken ? "Generating token…" : "Connect Telegram"}
      </button>
    </div>
  )
}