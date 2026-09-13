/**
 * lib/payout-backend.ts
 *
 * Two small helpers shared by /api/payout, /api/polls/payout, and
 * /api/payout/vault (the three places that can create a real Supabase
 * payout row and hand it off to spotix-backend for processing).
 */

/** "Payout for your {eventName} event for {payDate}" / "...poll for {payDate}" */
export function buildNarration({
  isEvent,
  isPoll,
  isElection,
  isMerch,
  eventName,
  pollName,
  electionName,
  merchName,
  payDate,
}: {
  isEvent: boolean
  isPoll: boolean
  isElection?: boolean
  isMerch?: boolean
  eventName?: string | null
  pollName?: string | null
  electionName?: string | null
  merchName?: string | null
  payDate: string
}): string {
  if (isEvent) {
    return `Payout for your ${eventName || "event"} event for ${payDate}`
  }
  if (isPoll) {
    return `Payout for your ${pollName || "poll"} poll for ${payDate}`
  }
  if (isElection) {
    return `Payout for your ${electionName || "election"} election forms for ${payDate}`
  }
  if (isMerch) {
    return `Payout for your ${merchName || "listing"} merch sales for ${payDate}`
  }
  return `Spotix payout for ${payDate}`
}

/**
 * Fire-and-forget call to spotix-backend to start processing a payout
 * reference that was just inserted into Supabase with status
 * "initializing". Never awaited by the caller's response path — the
 * client watches progress live via /api/payout/stream instead.
 *
 * CRON_SECRET here is the same shared secret spotix-backend's old cron
 * job used to authenticate itself — repurposed as the general
 * "trusted internal Spotix service" secret now that the cron is gone.
 */
export function triggerPayoutProcessing(reference: string): void {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL
  const secret = process.env.CRON_SECRET

  if (!backendUrl || !secret) {
    console.error("[payout-backend] NEXT_PUBLIC_BACKEND_URL or CRON_SECRET missing — cannot trigger processing")
    return
  }

  fetch(`${backendUrl}/v1/payout/process`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": secret,
    },
    body: JSON.stringify({ reference }),
  }).catch((err) => {
    console.error(`[payout-backend] Failed to trigger processing for ${reference}:`, err)
  })
}
