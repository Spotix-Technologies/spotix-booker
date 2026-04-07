/**
 * lib/auth-client.ts
 *
 * Client-side auth utilities.
 *
 * ── Token architecture ────────────────────────────────────────────────────────
 *
 *   Access token  → stored in JS memory (module-level variable)
 *                   also in spotix_at httpOnly cookie (for middleware)
 *                   15-minute TTL
 *
 *   Refresh token → stored ONLY in spotix_rt httpOnly cookie (server-set)
 *                   Client JS NEVER sees the raw refresh token value.
 *                   The browser automatically sends it to /api/auth/refresh.
 *                   30-day TTL
 *
 * This means:
 *   ✓ XSS cannot steal the refresh token (it's httpOnly)
 *   ✓ CSRF is mitigated by SameSite=Lax on all cookies
 *   ✓ Middleware can enforce auth without JS running first (SSR-safe)
 *   ✓ Client can still attach access token to cross-origin API calls via header
 *
 * ── What the client DOES store (localStorage) ─────────────────────────────────
 *   spotix_device_id    Stable UUID for this browser/device (survives logout)
 *   spotix_at_expiry    Expiry timestamp for the access token (for proactive refresh)
 *
 * NOTE: In React Native / Expo, swap localStorage for expo-secure-store.
 */

// ── In-memory access token ─────────────────────────────────────────────────────
// Survives page lifetime, gone on tab close (intentional — cookie handles SSR)
let _accessToken: string | null = null;

// ── Storage keys ───────────────────────────────────────────────────────────────
const KEYS = {
  deviceId: "spotix_device_id",
  atExpiry: "spotix_at_expiry",
} as const;

// ── Types ──────────────────────────────────────────────────────────────────────
export interface DeviceMeta {
  platform: string;
  model: string;
  appVersion: string;
}

// ── Access token (in-memory) ───────────────────────────────────────────────────

/**
 * Store the access token received from /api/auth or /api/auth/refresh.
 * Also records the expiry time so we can schedule proactive refreshes.
 */
export function storeAccessToken(accessToken: string, expiresInSeconds = 900): void {
  _accessToken = accessToken;
  const expiresAt = Date.now() + expiresInSeconds * 1000;
  if (typeof window !== "undefined") {
    localStorage.setItem(KEYS.atExpiry, String(expiresAt));
  }
}

/** Returns the in-memory access token, or null if not set. */
export function getAccessToken(): string | null {
  return _accessToken;
}

/** Returns true if the in-memory access token is expired or missing. */
export function isAccessTokenExpired(): boolean {
  if (!_accessToken) return true;
  if (typeof window === "undefined") return true;
  const expiry = Number(localStorage.getItem(KEYS.atExpiry) || "0");
  // Treat as expired 30 seconds early to avoid edge-case races
  return Date.now() > expiry - 30_000;
}

/** Clear access token from memory and localStorage expiry record. */
export function clearAccessToken(): void {
  _accessToken = null;
  if (typeof window !== "undefined") {
    localStorage.removeItem(KEYS.atExpiry);
  }
}

// ── Device ID ──────────────────────────────────────────────────────────────────

/**
 * Returns a stable UUID for this browser/device.
 * Generated once and persisted in localStorage.
 * Survives logouts — the same deviceId triggers per-device session revocation
 * on re-login, which is the intended behaviour.
 */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = localStorage.getItem(KEYS.deviceId);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEYS.deviceId, id);
  }
  return id;
}

// ── Device metadata ────────────────────────────────────────────────────────────

export function collectDeviceMeta(): DeviceMeta {
  if (typeof window === "undefined") {
    return { platform: "ssr", model: "unknown", appVersion: "unknown" };
  }

  const ua = navigator.userAgent;
  let platform = "web";
  if (/android/i.test(ua)) platform = "android-web";
  else if (/iphone|ipad|ipod/i.test(ua)) platform = "ios-web";
  else if (/macintosh/i.test(ua)) platform = "macos-web";
  else if (/windows/i.test(ua)) platform = "windows-web";

  let model = "unknown";
  if (/firefox/i.test(ua)) model = "Firefox";
  else if (/edg/i.test(ua)) model = "Edge";
  else if (/chrome/i.test(ua)) model = "Chrome";
  else if (/safari/i.test(ua)) model = "Safari";

  return {
    platform,
    model,
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION || "1.0.0",
  };
}

// ── Token refresh ──────────────────────────────────────────────────────────────

/**
 * Call /api/auth/refresh.
 *
 * The browser automatically sends the spotix_rt + spotix_rtid httpOnly cookies
 * because they're scoped to Path=/api/auth/refresh.
 * No token values need to be passed from JS.
 *
 * Returns true on success (new access token stored in memory), false on failure.
 */
export async function tryRefreshTokens(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin", // ensures cookies are sent
      body: JSON.stringify({ deviceMeta: collectDeviceMeta() }),
    });

    if (!res.ok) {
      clearAccessToken();
      return false;
    }

    const data = await res.json();
    if (data.accessToken) {
      storeAccessToken(data.accessToken);
    }

    return true;
  } catch {
    return false;
  }
}

// ── Authenticated fetch ────────────────────────────────────────────────────────

/**
 * Drop-in replacement for fetch() that:
 *   1. Proactively refreshes the access token if it's expired or about to expire
 *   2. Injects the current access token as a Bearer header
 *   3. On unexpected 401, retries once after a refresh attempt
 *
 * Usage:
 *   const res = await authFetch("/api/some-protected-route")
 */
export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  // Proactive refresh before token actually expires
  if (isAccessTokenExpired()) {
    const refreshed = await tryRefreshTokens();
    if (!refreshed) {
      // Refresh failed — redirect to login
      if (typeof window !== "undefined") {
        window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
      }
      // Return a synthetic 401 so callers don't have to handle undefined
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
  }

  const withAuth = (): RequestInit => ({
    ...init,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
      ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
    },
  });

  let response = await fetch(input, withAuth());

  // Reactive refresh on unexpected 401 (e.g. clock skew or near-expiry race)
  if (response.status === 401) {
    const refreshed = await tryRefreshTokens();
    if (refreshed) {
      response = await fetch(input, withAuth());
    } else {
      clearAccessToken();
      if (typeof window !== "undefined") {
        window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
      }
    }
  }

  return response;
}

// ── Cache busting helpers ────────────────────────────────────────────────────

/**
 * Clear all dashboard and events caches from localStorage.
 * Call this on logout to prevent stale data after re-login.
 */
export function bustAllCaches(): void {
  if (typeof window === "undefined") return

  try {
    // Bust dashboard caches — keys follow pattern: spotix_dashboard_${userId}
    const allKeys = Object.keys(localStorage)
    for (const key of allKeys) {
      if (key.startsWith("spotix_dashboard_") || key.startsWith("spotix_events_")) {
        localStorage.removeItem(key)
      }
    }
    console.log("[auth-client] Cache busted on logout")
  } catch {
    // ignore storage errors
  }
}

// ── Logout ─────────────────────────────────────────────────────────────────────

/**
 * Log out from the current device.
 * Server revokes the Firestore refresh token and clears all cookies.
 * Also busts all dashboard/events caches to prevent stale data after re-login.
 */
export async function logout(redirectTo = "/login"): Promise<void> {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allDevices: false }),
    })
  } catch {
    // Best-effort
  }

  clearAccessToken()
  bustAllCaches()

  if (typeof window !== "undefined") {
    window.location.href = redirectTo
  }
}

/**
 * Log out from all devices.
 * Also busts all dashboard/events caches to prevent stale data after re-login.
 */
export async function logoutAllDevices(redirectTo = "/login"): Promise<void> {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allDevices: true }),
    })
  } catch {
    // Best-effort
  }

  clearAccessToken()
  bustAllCaches()

  if (typeof window !== "undefined") {
    window.location.href = redirectTo
  }
}

  clearAccessToken();

  if (typeof window !== "undefined") {
    window.location.href = redirectTo;
  }
}

/**
 * Log out from all devices.
 */
export async function logoutAllDevices(redirectTo = "/login"): Promise<void> {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allDevices: true }),
    });
  } catch {
    // Best-effort
  }

  clearAccessToken();

  if (typeof window !== "undefined") {
    window.location.href = redirectTo;
  }
}
