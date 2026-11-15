"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { Preloader } from "@/components/preloader"
import { useSearchParams } from "next/navigation"
import { Mail, Lock, AlertCircle, ChevronRight, Eye, EyeOff } from "lucide-react"
import Image from "next/image"
import {
  storeAccessToken,
  getDeviceId,
  collectDeviceMeta,
  scheduleProactiveRefresh,
} from "@/lib/auth-client"
import { triggerAuthRefresh, useAuth } from "@/hooks/useAuth"

export default function LoginClient() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [errorVisible, setErrorVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { user, loading: authLoading } = useAuth()

  const validateRedirect = (url: string): string => {
    if (!url || url === "/" || !url.startsWith("/")) {
      return "/dashboard"
    }
    return url
  }

  const rawRedirect = searchParams.get("redirect") || ""
  const redirect = validateRedirect(rawRedirect)
  const showRedirectNotice = Boolean(redirect && redirect !== "/dashboard")

  useEffect(() => {
    if (authLoading) return
    if (!user) return
    if (!user.isBooker) {
      window.location.href = "/not-booker"
    } else {
      window.location.href = redirect
    }
  }, [user, authLoading, redirect])

  const showError = (msg: string) => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    setError(msg)
    setErrorVisible(false)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setErrorVisible(true))
    })
    errorTimerRef.current = setTimeout(() => setErrorVisible(false), 5000)
  }

  useEffect(() => () => { if (errorTimerRef.current) clearTimeout(errorTimerRef.current) }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorVisible(false)
    setLoading(true)

    try {
      const deviceId = getDeviceId()
      const deviceMeta = collectDeviceMeta()

      const sessionResponse = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, deviceId, deviceMeta }),
      })

      if (!sessionResponse.ok) {
        const errorData = await sessionResponse.json()
        throw new Error(errorData.message || "Failed to login")
      }

      const sessionData = await sessionResponse.json()

      storeAccessToken(sessionData.accessToken)
      scheduleProactiveRefresh(sessionData.accessToken)

      const isBooker = sessionData?.user?.isBooker || false

      triggerAuthRefresh()

      if (!isBooker) {
        window.location.href = "/not-booker"
        return
      }

      window.location.href = redirect
    } catch (err: any) {
      console.error("Login error:", err)

      let errorMessage = err.message || "Failed to login. Please try again."

      if (errorMessage.includes("Incorrect email") || errorMessage.includes("password")) {
        errorMessage = "Incorrect email or password"
      } else if (errorMessage.includes("email")) {
        errorMessage = "Please enter a valid email address"
      } else if (errorMessage.includes("too many") || errorMessage.includes("attempts")) {
        errorMessage = "Too many failed login attempts. Please try again later"
      } else if (errorMessage.includes("disabled")) {
        errorMessage = "This account has been disabled"
      }

      showError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  if (authLoading || user) {
    return <Preloader isLoading={true} />
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-5xl animate-in fade-in zoom-in-95 duration-700">

        <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-16">

          {/* ── Left: illustration (lg+ only) ─────────────────────────── */}
          <div className="hidden lg:flex flex-1 flex-col items-center justify-center">
            <div className="relative w-full max-w-md">
              <Image
                src="/login.svg"
                alt="Spotix Booker"
                width={480}
                height={480}
                className="w-full h-auto"
                priority
              />
            </div>
            <div className="mt-8 text-center">
              <h2 className="text-2xl font-bold text-slate-800 mb-2">
                Manage your events, <span className="text-[#6b2fa5]">effortlessly.</span>
              </h2>
              <p className="text-slate-500 text-sm max-w-xs mx-auto leading-relaxed">
                Sell tickets, track attendance, manage payouts all from one dashboard.
              </p>
            </div>
          </div>

          {/* ── Right: form card ───────────────────────────────────────── */}
          <div className="w-full max-w-md space-y-8">

            <div className="text-center space-y-5">
              <div className="inline-flex items-center justify-center mx-auto">
                <div className="relative w-24 h-24 rounded-2xl overflow-hidden border border-slate-200">
                  <Image
                    src="/logo.png"
                    alt="Spotix"
                    fill
                    className="object-cover"
                    priority
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <h1 className="text-4xl font-bold text-[#6b2fa5]">
                  Spotix Booker
                </h1>
                <p className="text-slate-500">Sign in to your booker dashboard</p>
              </div>

              {showRedirectNotice && (
                <div className="flex items-center gap-2 justify-center p-3 rounded-lg bg-blue-50 border border-blue-200">
                  <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  <p className="text-sm text-blue-800">
                    Please sign in to continue to{" "}
                    <span className="font-semibold">{redirect}</span>
                  </p>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 space-y-6">
              <form onSubmit={handleLogin} className="space-y-5">

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full pl-12 pr-4 py-3 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-12 pr-12 py-3 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#6b2fa5] transition-colors p-1 rounded-md hover:bg-slate-100"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      <div className="relative w-5 h-5">
                        <Eye className={`absolute inset-0 w-5 h-5 transition-all duration-300 ${
                          showPassword ? "opacity-0 scale-0 rotate-180" : "opacity-100 scale-100 rotate-0"
                        }`} />
                        <EyeOff className={`absolute inset-0 w-5 h-5 transition-all duration-300 ${
                          showPassword ? "opacity-100 scale-100 rotate-0" : "opacity-0 scale-0 -rotate-180"
                        }`} />
                      </div>
                    </button>
                  </div>
                </div>

                <div
                  className="overflow-hidden transition-all duration-500 ease-in-out"
                  style={{
                    maxHeight: errorVisible && error ? "120px" : "0px",
                    opacity: errorVisible && error ? 1 : 0,
                  }}
                >
                  <div className="flex gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-500" />
                    <div>
                      <p className="font-semibold mb-0.5">Login Failed</p>
                      <p className="text-red-600 text-xs">{error}</p>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="group w-full inline-flex items-center justify-center gap-3 bg-[#6b2fa5] hover:bg-[#5a2589] text-white font-bold py-3.5 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    <>
                      <span>Sign In</span>
                      <ChevronRight className="w-5 h-5 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </button>
              </form>
            </div>

            <p className="text-center text-xs text-slate-500">
              By signing in, you agree to our{" "}
              <Link href="https://policy.spotix.com.ng" className="text-[#6b2fa5] hover:underline font-semibold">
                Terms of Service and Privacy Policy
              </Link>{" "}
            </p>

          </div>
        </div>
      </div>
    </div>
  )
}