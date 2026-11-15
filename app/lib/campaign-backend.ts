/**
 * lib/campaign-backend.ts
 *
 * Shared helper for app/api/campaigns/* and app/api/campaign-credits —
 * proxies to spotix-backend's internal /v1/campaigns/* routes using the
 * same x-internal-secret convention as app/api/payout/stream/route.ts.
 * The backend is the only place that ever touches the Supabase
 * service-role client for campaign data (spec §44/§45) — this file is a
 * thin, trusted relay, never a place business logic lives.
 */

export async function callCampaignBackend(path: string, init?: RequestInit) {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  const secret = process.env.CRON_SECRET;
  if (!backendUrl || !secret) {
    throw new Error("Server configuration error: backend URL or internal secret missing");
  }
  const res = await fetch(`${backendUrl}/v1${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": secret,
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}
