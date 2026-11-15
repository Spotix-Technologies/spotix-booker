/**
 * app/lib/campaign-trigger.ts  (server-only — never import from a client component)
 *
 * Tells the backend to process ONE campaign right now instead of waiting for
 * the hourly cron sweep. Called from the start / resubmit API routes right
 * after the backend accepts the campaign.
 *
 * Uses CRON_SECRET, which must stay on the server: the browser only ever talks
 * to our own /api routes, which add the secret here. The backend replies 202
 * immediately and keeps working in the background, so awaiting this is cheap
 * (and, unlike a floating promise, survives serverless runtimes freezing the
 * function after the response is sent).
 *
 * Best-effort by design: if it fails or times out, nothing is lost — the
 * campaign is already queued and the hourly cron will pick it up.
 */

const TRIGGER_TIMEOUT_MS = 5000

export async function triggerCampaignProcessing(campaignId: string): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL
  const secret = process.env.CRON_SECRET
  if (!baseUrl || !secret || !campaignId) return

  try {
    const res = await fetch(
      `${baseUrl}/v1/cron/process-campaigns?campaignId=${encodeURIComponent(campaignId)}`,
      {
        method: "GET",
        headers: { "x-cron-secret": secret },
        cache: "no-store",
        signal: AbortSignal.timeout(TRIGGER_TIMEOUT_MS),
      },
    )
    if (!res.ok) console.warn(`[campaign-trigger] backend replied ${res.status} for ${campaignId}`)
  } catch (err) {
    console.warn("[campaign-trigger] could not reach backend; the hourly cron will pick it up", err)
  }
}
