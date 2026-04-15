
/**
 * lib/auth-client.ts
 *
 * Client-side auth utilities for Spotix Booker.
 *
 * Responsibilities:
 *  - In-memory access token store (never touches localStorage)
 *  - Device ID persistence (localStorage — not sensitive)
 *  - Device meta collection
 *  - Silent token refresh via /api/auth/refresh (httpOnly refresh-token cookie)
 *  - Proactive refresh scheduling: refreshes ~2 min before expiry
 *  - authFetch — a drop-in fetch wrapper that auto-attaches the Bearer token
 *    and retries once on 401 after a silent refresh attempt
 *
 * App version is read from NEXT_PUBLIC_APP_VERSION (set in .env).
 */

// ---------------------------------------------------------------------------
// App version
// ---------------------------------------------------------------------------

export const APP_VERSION: string =
  process.env.NEXT_PUBLIC_APP_VERSION ?? "1.0.0"

// ---------------------------------------------------------------------------
// In-memory access token store
// ---------------------------------------------------------------------------

let _accessToken: string | null = null

/**
 * Store an access token in memory.
 * Call this immediately after a successful login or refresh response.
 */
export function storeAccessToken(token: string): void {
  _accessToken = token
}

/**
 * Read the current in-memory access token.
 * Returns null if not present.
 */
export function getAccessToken(): string | null {
  return _accessToken
}

/**
 * Wipe the in-memory access token.
 * Call this on logout or when a 401 is unrecoverable.
 */
export function clearAccessToken(): void {
  _accessToken = null
}

// ---------------------------------------------------------------------------
// JWT decode helpers (no external dependency — base64url only)
// ---------------------------------------------------------------------------

interface JwtPayload {
  exp?: number
  uid?: string
  email?: string
  isBooker?: boolean
  deviceId?: string
  [key: string]: unknown
}

function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null

    // Base64url → base64 → decode
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/")
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=")
    const json = atob(padded)
    return JSON.parse(json) as JwtPayload
  } catch {
    return null
  }
}

/**
 * Returns the number of milliseconds until the token expires.
 * Returns 0 if the token is already expired or unparseable.
 */
export function msUntilExpiry(token: string): number {
  const payload = decodeJwtPayload(token)
  if (!payload?.exp) return 0
  const expiresAt = payload.exp * 1000 // convert seconds → ms
  return Math.max(0, expiresAt - Date.now())
}

// ---------------------------------------------------------------------------
// Device ID
// ---------------------------------------------------------------------------

const DEVICE_ID_KEY = "spotix_device_id"

function generateUUID(): string {
  // Fallback for environments without crypto.randomUUID
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Returns the persistent device ID stored in localStorage.
 * Creates and stores a new one on first call.
 */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "ssr-device"

  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = generateUUID()
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

// ---------------------------------------------------------------------------
// Device meta
// ---------------------------------------------------------------------------

export interface DeviceMeta {
  userAgent: string
  platform: string
  language: string
  screenResolution: string
  timezone: string
  appVersion: string
}

/**
 * Collects lightweight, non-sensitive device metadata for session tracking.
 */
export function collectDeviceMeta(): DeviceMeta {
  if (typeof window === "undefined") {
    return {
      userAgent: "ssr",
      platform: "ssr",
      language: "en",
      screenResolution: "0x0",
      timezone: "UTC",
      appVersion: APP_VERSION,
    }
  }

  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    appVersion: APP_VERSION,
  }
}

// ---------------------------------------------------------------------------
// Silent token refresh
// ---------------------------------------------------------------------------

// Deduplicate concurrent refresh calls — only one in-flight at a time
let _refreshPromise: Promise<boolean> | null = null

/**
 * Attempts a silent token refresh using the httpOnly refresh-token cookie.
 * Returns true if a new access token was obtained and stored, false otherwise.
 *
 * Multiple simultaneous callers share the same in-flight promise to avoid
 * hammering the refresh endpoint.
 */
export async function tryRefreshTokens(): Promise<boolean> {
  if (_refreshPromise) return _refreshPromise

  _refreshPromise = (async (): Promise<boolean> => {
    try {
      const deviceId = getDeviceId()
      const deviceMeta = collectDeviceMeta()

      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Cookies are sent automatically (same-origin)
        body: JSON.stringify({ deviceId, deviceMeta }),
      })

      if (!res.ok) {
        clearAccessToken()
        return false
      }

      const data = await res.json()
      if (data.accessToken) {
        storeAccessToken(data.accessToken)
        // Schedule next proactive refresh for the new token
        scheduleProactiveRefresh(data.accessToken)
        return true
      }

      return false
    } catch {
      return false
    } finally {
      _refreshPromise = null
    }
  })()

  return _refreshPromise
}

// ---------------------------------------------------------------------------
// Proactive refresh scheduler
// ---------------------------------------------------------------------------

const REFRESH_BUFFER_MS = 2 * 60 * 1000 // refresh 2 minutes before expiry

let _refreshTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Schedules a silent refresh to fire REFRESH_BUFFER_MS before the token expires.
 * Clears any previously scheduled refresh first.
 *
 * Call this whenever a new access token is stored (login, refresh response).
 */
export function scheduleProactiveRefresh(token: string): void {
  if (_refreshTimer !== null) {
    clearTimeout(_refreshTimer)
    _refreshTimer = null
  }

  const ms = msUntilExpiry(token)
  if (ms <= 0) {
    // Already expired — refresh immediately
    tryRefreshTokens()
    return
  }

  const delay = Math.max(0, ms - REFRESH_BUFFER_MS)

  _refreshTimer = setTimeout(async () => {
    _refreshTimer = null
    const ok = await tryRefreshTokens()
    if (!ok) {
      // Refresh failed — notify auth system so UI can react (e.g. redirect to login)
      window.dispatchEvent(new CustomEvent("spotix:session-expired"))
    }
  }, delay)
}

/**
 * Cancels any pending proactive refresh timer.
 * Call this on logout.
 */
export function cancelProactiveRefresh(): void {
  if (_refreshTimer !== null) {
    clearTimeout(_refreshTimer)
    _refreshTimer = null
  }
}

// ---------------------------------------------------------------------------
// authFetch — authenticated fetch wrapper
// ---------------------------------------------------------------------------

type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]

/**
 * Drop-in replacement for fetch() that:
 *  1. Attaches the current in-memory Bearer token as Authorization header.
 *  2. On a 401 response, attempts a silent refresh and retries the request once.
 *  3. If the retry also fails, fires the "spotix:session-expired" event and
 *     returns the 401 response so callers can handle it.
 *
 * Usage:
 *   const res = await authFetch("/api/some/protected/route")
 */
export async function authFetch(
  input: FetchInput,
  init: FetchInit = {}
): Promise<Response> {
  const token = getAccessToken()

  const headers = new Headers((init.headers as HeadersInit | undefined) ?? {})
  if (token) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  const firstResponse = await fetch(input, { ...init, headers })

  // If not a 401, return as-is
  if (firstResponse.status !== 401) {
    return firstResponse
  }

  // 401 — attempt a silent refresh and retry once
  const refreshed = await tryRefreshTokens()
  if (!refreshed) {
    // Session is dead
    clearAccessToken()
    cancelProactiveRefresh()
    window.dispatchEvent(new CustomEvent("spotix:session-expired"))
    return firstResponse // return original 401 to the caller
  }

  // Retry with new token
  const newToken = getAccessToken()
  const retryHeaders = new Headers((init.headers as HeadersInit | undefined) ?? {})
  if (newToken) {
    retryHeaders.set("Authorization", `Bearer ${newToken}`)
  }

  return fetch(input, { ...init, headers: retryHeaders })
}

// ---------------------------------------------------------------------------
// Logout helper
// ---------------------------------------------------------------------------

/**
 * Full client-side logout:
 *  - Clears in-memory token
 *  - Cancels proactive refresh timer
 *  - Hits the server-side logout endpoint to clear httpOnly cookies
 *    and revoke the refresh token in Firestore
 */
export async function logout(): Promise<void> {
  clearAccessToken()
  cancelProactiveRefresh()

  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId: getDeviceId(),
      }),
    })
  } catch {
    // Best-effort — cookies will expire on their own
  }
}
