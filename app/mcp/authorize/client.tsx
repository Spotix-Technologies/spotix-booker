"use client"

/**
 * app/mcp/authorize/client.tsx
 *
 * The interactive half of the MCP OAuth "authorization_endpoint" this
 * backend's AS metadata advertises (see spotix-backend's
 * v1/lib/mcp-oauth/metadata.js). An AI chat client (Claude, ChatGPT, or
 * any other MCP host) sends the booker's browser here with standard
 * OAuth 2.1 + PKCE query parameters:
 *
 *   ?response_type=code&client_id=…&redirect_uri=…&scope=booker
 *    &state=…&code_challenge=…&code_challenge_method=S256
 *
 * Flow:
 *   1. Validate those parameters look well-formed (not who they belong
 *      to — spotix-backend re-validates client_id/redirect_uri server-
 *      side no matter what this page does; this is just "don't show a
 *      consent screen for an obviously broken link").
 *   2. Look up the requesting client's public name/logo so the consent
 *      copy can say "{name} wants to connect…" instead of something
 *      generic.
 *   3. Resolve identity: an existing spotix_at session shows
 *      "Continue as {username}?"; no session shows the same
 *      email/password form as /login, embedded here so the booker never
 *      leaves this flow.
 *   4. One consent screen, one "Allow" action, which calls
 *      /api/mcp/authorize (verifies the session again server-side, then
 *      asks spotix-backend to mint the code) and redirects back to the
 *      client's redirect_uri.
 */

import type React from "react"
import { useState, useEffect, useCallback } from "react"
import Image from "next/image"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  ShieldCheck,
  Loader2,
  ArrowRight,
  LogOut,
  Bot,
  Ticket,
  BarChart3,
  Tag,
  Link2,
} from "lucide-react"
import { useAuth, triggerAuthRefresh } from "@/hooks/useAuth"
import { authFetch, storeAccessToken, getDeviceId, collectDeviceMeta, scheduleProactiveRefresh, logout } from "@/lib/auth-client"

const SIGNUP_URL = "https://spotix.com.ng/auth/signup"
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://api.spotix.com.ng"

type Step = "resolving" | "invalid" | "login" | "continueAs" | "consent" | "connecting" | "denied" | "notBooker"

type ClientInfo = { clientName: string; logoUri: string | null; clientUri: string | null }

type OAuthParams = {
  clientId: string
  redirectUri: string
  scope: string
  state: string | null
  codeChallenge: string
  codeChallengeMethod: string
}

function parseOAuthParams(searchParams: URLSearchParams): OAuthParams | null {
  const responseType = searchParams.get("response_type")
  const clientId = searchParams.get("client_id")
  const redirectUri = searchParams.get("redirect_uri")
  const codeChallenge = searchParams.get("code_challenge")
  const codeChallengeMethod = searchParams.get("code_challenge_method")

  if (responseType !== "code") return null
  if (!clientId || !redirectUri || !codeChallenge) return null
  if (codeChallengeMethod !== "S256") return null
  try {
    // Just a well-formedness check — the actual redirect_uri allow-list
    // check happens server-side against the registered client.
    new URL(redirectUri)
  } catch {
    return null
  }

  return {
    clientId,
    redirectUri,
    scope: searchParams.get("scope") || "booker",
    state: searchParams.get("state"),
    codeChallenge,
    codeChallengeMethod,
  }
}

export default function AuthorizeClient() {
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()

  const [params, setParams] = useState<OAuthParams | null | undefined>(undefined)
  const [client, setClient] = useState<ClientInfo | null>(null)
  const [step, setStep] = useState<Step>("resolving")
  const [profile, setProfile] = useState<{ username: string; email: string; profilePicture: string } | null>(null)

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState("")
  const [consentSubmitting, setConsentSubmitting] = useState(false)
  const [consentError, setConsentError] = useState("")

  // ── 1. Parse + validate the incoming OAuth request once ──────────────────
  useEffect(() => {
    setParams(parseOAuthParams(searchParams))
  }, [searchParams])

  // ── 2. Look up the requesting client's public name/logo ──────────────────
  useEffect(() => {
    if (!params) return
    let cancelled = false
    fetch(`${BACKEND_URL}/v1/mcp/oauth/clients/${encodeURIComponent(params.clientId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return
        setClient(
          data?.client
            ? { clientName: data.client.clientName, logoUri: data.client.logoUri, clientUri: data.client.clientUri }
            : { clientName: "A custom MCP client", logoUri: null, clientUri: null }
        )
      })
      .catch(() => {
        if (!cancelled) setClient({ clientName: "A custom MCP client", logoUri: null, clientUri: null })
      })
    return () => {
      cancelled = true
    }
  }, [params])

  // ── 3. Resolve identity once auth state + params are both known ──────────
  useEffect(() => {
    if (params === undefined || authLoading) return
    if (params === null) {
      setStep("invalid")
      return
    }

    if (!user) {
      setStep("login")
      return
    }

    // A pre-existing session was already there when the page loaded —
    // fetch the fuller profile (username isn't on the lightweight
    // useAuth() user object) and show "Continue as {username}?".
    let cancelled = false
    authFetch("/api/user/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return
        if (!data || !(data.isBooker ?? user.isBooker)) {
          setStep("notBooker")
          return
        }
        setProfile({ username: data.username || data.fullName || "there", email: data.email, profilePicture: data.profilePicture || "" })
        setStep("continueAs")
      })
      .catch(() => {
        if (!cancelled) setStep("continueAs")
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, authLoading, user])

  const goToConsent = useCallback(() => setStep("consent"), [])

  // ── Login form submit — identical request shape to /login ────────────────
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setFormError("")
    setFormLoading(true)
    try {
      const deviceId = getDeviceId()
      const deviceMeta = collectDeviceMeta()
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, deviceId, deviceMeta }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "Failed to sign in")

      if (!data.user?.isBooker) {
        setStep("notBooker")
        return
      }

      storeAccessToken(data.accessToken)
      scheduleProactiveRefresh(data.accessToken)
      triggerAuthRefresh()
      setProfile({ username: data.user.fullName || email, email: data.user.email, profilePicture: data.user.profilePicture || "" })
      // Fresh, deliberate login — go straight to consent, no redundant
      // "Continue as X?" interstitial.
      setStep("consent")
    } catch (err: any) {
      setFormError(err.message || "Failed to sign in. Please try again.")
    } finally {
      setFormLoading(false)
    }
  }

  async function handleSwitchAccount() {
    await logout()
    setProfile(null)
    setStep("login")
  }

  async function handleAllow() {
    if (!params) return
    setConsentSubmitting(true)
    setConsentError("")
    try {
      const res = await fetch("/api/mcp/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          clientId: params.clientId,
          redirectUri: params.redirectUri,
          scope: params.scope,
          codeChallenge: params.codeChallenge,
          codeChallengeMethod: params.codeChallengeMethod,
          state: params.state,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.redirectUrl) throw new Error(data.message || "Could not complete this connection")
      setStep("connecting")
      window.location.href = data.redirectUrl
    } catch (err: any) {
      setConsentError(err.message || "Could not complete this connection")
      setConsentSubmitting(false)
    }
  }

  function handleDeny() {
    if (!params) return
    try {
      const url = new URL(params.redirectUri)
      url.searchParams.set("error", "access_denied")
      if (params.state) url.searchParams.set("state", params.state)
      setStep("denied")
      window.location.href = url.toString()
    } catch {
      setStep("denied")
    }
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center px-4 py-10 overflow-hidden">
      {/* Blurred background photo — the booker-app scanner background,
          reused here so this page reads as unmistakably "Spotix", just
          softened enough that it never competes with the form. */}
      <div className="absolute inset-0 -z-10">
        <Image src="/images/mcp-auth-bg.jpg" alt="" fill priority className="object-cover scale-110 blur-2xl" />
        <div className="absolute inset-0 bg-[#0d0713]/80" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0d0713]/40 via-transparent to-[#0d0713]/70" />
      </div>

      <div className="w-full max-w-md">
        {/* Can't-sign-up-here notice */}
        <p className="text-center text-sm text-white/70 mb-6 px-4">
          You can&apos;t create an account from here.{" "}
          <a href={SIGNUP_URL} target="_blank" rel="noopener noreferrer" className="text-white underline underline-offset-2 hover:text-[#c9a3f2]">
            To make an account, click here
          </a>
          .
        </p>

        <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl ring-1 ring-white/20 overflow-hidden">
          {/* Client identity header */}
          <div className="px-6 pt-7 pb-5 text-center border-b border-gray-100">
            <div className="flex items-center justify-center gap-3 mb-4">
              <ClientBadge client={client} />
              <span className="text-gray-300 text-xl">→</span>
              <div className="w-12 h-12 rounded-2xl bg-[#6b2fa5] flex items-center justify-center shadow-lg shadow-[#6b2fa5]/30">
                <ShieldCheck className="w-6 h-6 text-white" />
              </div>
            </div>
            <h1 className="text-lg font-semibold text-gray-900 leading-snug">
              {client?.clientName || "A custom MCP client"} wants to connect to your Spotix Booker account
            </h1>
          </div>

          <div className="px-6 py-6">
            {step === "resolving" && (
              <div className="flex flex-col items-center gap-3 py-8 text-gray-500">
                <Loader2 className="w-6 h-6 animate-spin text-[#6b2fa5]" />
                <p className="text-sm">Checking your session…</p>
              </div>
            )}

            {step === "invalid" && (
              <div className="text-center py-6 space-y-3">
                <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
                <p className="text-gray-800 font-medium">This connection link looks invalid or has expired.</p>
                <p className="text-sm text-gray-500">Please restart the connection from your AI assistant.</p>
              </div>
            )}

            {step === "denied" && (
              <div className="text-center py-6 space-y-2">
                <p className="text-gray-800 font-medium">Connection cancelled.</p>
                <p className="text-sm text-gray-500">You can close this window.</p>
              </div>
            )}

            {step === "notBooker" && (
              <div className="text-center py-6 space-y-3">
                <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
                <p className="text-gray-800 font-medium">This connection is for Spotix Booker accounts.</p>
                <p className="text-sm text-gray-500">Sign in with the booker account you&apos;d like to connect.</p>
                <button
                  onClick={handleSwitchAccount}
                  className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-[#6b2fa5] hover:text-[#5a2789]"
                >
                  <LogOut className="w-4 h-4" /> Use a different account
                </button>
              </div>
            )}

            {step === "login" && (
              <form onSubmit={handleLogin} className="space-y-4">
                {formError && (
                  <div className="flex items-start gap-2 bg-red-50 text-red-700 text-sm rounded-xl px-3.5 py-2.5">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Email</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6b2fa5]/30 focus:border-[#6b2fa5]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Password</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6b2fa5]/30 focus:border-[#6b2fa5]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="w-full flex items-center justify-center gap-2 bg-[#6b2fa5] hover:bg-[#5a2789] disabled:opacity-60 text-white font-medium text-sm py-2.75 rounded-xl transition-colors"
                >
                  {formLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Sign in <ArrowRight className="w-4 h-4" /></>}
                </button>
              </form>
            )}

            {step === "continueAs" && profile && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 bg-gray-50 rounded-2xl p-3.5">
                  <div className="w-11 h-11 rounded-full bg-[#6b2fa5]/10 text-[#6b2fa5] font-semibold flex items-center justify-center text-lg shrink-0 overflow-hidden">
                    {profile.profilePicture ? (
                      <Image src={profile.profilePicture} alt="" width={44} height={44} className="w-full h-full object-cover" />
                    ) : (
                      profile.username.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">Continue as {profile.username}?</p>
                    <p className="text-xs text-gray-500 truncate">{profile.email}</p>
                  </div>
                </div>
                <button
                  onClick={goToConsent}
                  className="w-full flex items-center justify-center gap-2 bg-[#6b2fa5] hover:bg-[#5a2789] text-white font-medium text-sm py-2.75 rounded-xl transition-colors"
                >
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
                <button onClick={handleSwitchAccount} className="w-full text-center text-sm text-gray-500 hover:text-gray-700">
                  Use a different account
                </button>
              </div>
            )}

            {(step === "consent" || step === "connecting") && (
              <div className="space-y-5">
                <p className="text-sm text-gray-600">This will let {client?.clientName || "this client"} on your behalf:</p>
                <ul className="space-y-2.5">
                  <PermissionRow icon={Ticket} text="View your events, ticket sales, and stats" />
                  <PermissionRow icon={BarChart3} text="See revenue and payout figures" />
                  <PermissionRow icon={Tag} text="Create and manage discount and referral codes" />
                  <PermissionRow icon={Link2} text="Create and share event links" />
                </ul>

                {consentError && (
                  <div className="flex items-start gap-2 bg-red-50 text-red-700 text-sm rounded-xl px-3.5 py-2.5">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{consentError}</span>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={handleDeny}
                    disabled={consentSubmitting}
                    className="flex-1 py-2.75 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 disabled:opacity-60 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAllow}
                    disabled={consentSubmitting}
                    className="flex-1 flex items-center justify-center gap-2 py-2.75 rounded-xl bg-[#6b2fa5] hover:bg-[#5a2789] disabled:opacity-60 text-white text-sm font-medium transition-colors"
                  >
                    {consentSubmitting || step === "connecting" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Allow"}
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 text-center leading-relaxed">
                  You can revoke access anytime from{" "}
                  <Link href="/mcp/connections" className="underline hover:text-gray-600">
                    Connected Apps
                  </Link>
                  .
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ClientBadge({ client }: { client: ClientInfo | null }) {
  if (client?.logoUri) {
    return (
      <div className="w-12 h-12 rounded-2xl overflow-hidden ring-1 ring-gray-200 shrink-0 bg-white">
        {/* External, per-client logo — plain <img>, not next/image (host is unknown ahead of time). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={client.logoUri} alt="" className="w-full h-full object-cover" />
      </div>
    )
  }
  return (
    <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center shrink-0">
      <Bot className="w-6 h-6 text-gray-400" />
    </div>
  )
}

function PermissionRow({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <li className="flex items-center gap-3 text-sm text-gray-700">
      <span className="w-8 h-8 rounded-full bg-[#6b2fa5]/10 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-[#6b2fa5]" />
      </span>
      {text}
    </li>
  )
}
