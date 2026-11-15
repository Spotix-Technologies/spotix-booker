/**
 * app/lib/campaign-email-render.ts
 *
 * Hand-mirrors spotix-backend's
 *   v1/lib/campaigns/{email-render.js,templates.js,rich-text.js}
 *   v1/lib/mail/email-brand.js (BRAND.purple/pageBg, COMPANY subset)
 * so the Design step's live preview renders instantly in the browser —
 * no network round trip to spotix-backend for something that turned out
 * to be pure string templating with zero Node-only dependencies.
 *
 * IMPORTANT: this is preview-only. The actual send always goes through
 * the backend's renderCampaignEmailHtml — that stays the single source
 * of truth for what recipients receive; nothing here is ever sent.
 * There's no shared package between the two repos, so if the backend
 * templates change, this needs updating by hand to match.
 *
 * Two deliberate differences from the backend version, both fine for a
 * preview and both already true of the /campaigns/preview endpoint this
 * replaces:
 *  - unsubscribeUrl is always "#" (there's no real recipient yet)
 *  - an empty message shows a placeholder line instead of the backend's
 *    fallback-to-campaign-name behavior, which isn't meaningful pre-send
 */

import { escapeHtml, formatMessage } from "./campaign-rich-text"

const BRAND_PURPLE = "#6b2fa5"
const PAGE_BG = "#f0eaf8"
const DEFAULT_CTA = "View Event"
const COMPANY = {
  name: "Spotix",
  addressLine1: "1, Emeka Akigwe Crescent, Near Nnamdi Azikiwe University",
  addressLine2: "Ifite-Awka, Awka, Anambra, Nigeria",
}
const SPOTIX_USER_URL = "https://spotix.com.ng"

type TemplateParams = {
  eventName: string
  message: string
  color: string
  eventUrl: string
  footer: string
  ctaText: string
}

// The 3 renderers below are byte-for-byte copies of templates.js's
// renderClassic/renderBold/renderMinimal (minus the unused
// unsubscribeUrl param, since footer already has that link baked in).

function renderClassic({ eventName, message, color, eventUrl, footer, ctaText }: TemplateParams) {
  return `<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
    <tr><td style="background:${color};padding:24px 32px;">
      <span style="color:#ffffff;font-size:20px;font-weight:bold;">${escapeHtml(eventName)}</span>
    </td></tr>
    <tr><td style="padding:32px;color:#2d2d2d;font-size:15px;line-height:1.6;">
      ${message}
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;">
        <tr><td style="background:${color};border-radius:8px;">
          <a href="${eventUrl}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-weight:bold;text-decoration:none;font-size:15px;">${escapeHtml(ctaText || DEFAULT_CTA)}</a>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:20px 32px;border-top:1px solid #eee;color:#888;font-size:12px;">${footer}</td></tr>
  </table>`
}

function renderBold({ eventName, message, color, eventUrl, footer, ctaText }: TemplateParams) {
  return `<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#111111;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
    <tr><td style="padding:40px 32px 16px;text-align:center;">
      <span style="color:${color};font-size:13px;letter-spacing:2px;text-transform:uppercase;font-weight:bold;">${escapeHtml(eventName)}</span>
    </td></tr>
    <tr><td style="padding:0 32px 32px;color:#f2f2f2;font-size:16px;line-height:1.7;text-align:center;">
      ${message}
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto 0;">
        <tr><td style="background:${color};border-radius:999px;">
          <a href="${eventUrl}" style="display:inline-block;padding:14px 36px;color:#111111;font-weight:bold;text-decoration:none;font-size:15px;">${escapeHtml(ctaText || DEFAULT_CTA)}</a>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:20px 32px;border-top:1px solid #333;color:#999;font-size:12px;text-align:center;">${footer}</td></tr>
  </table>`
}

function renderMinimal({ eventName, message, color, eventUrl, footer, ctaText }: TemplateParams) {
  return `<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;font-family:Georgia,'Times New Roman',serif;">
    <tr><td style="padding:36px 8px 4px;border-bottom:2px solid ${color};">
      <span style="color:#1a1a1a;font-size:18px;">${escapeHtml(eventName)}</span>
    </td></tr>
    <tr><td style="padding:28px 8px;color:#333;font-size:16px;line-height:1.7;">
      ${message}
      <p style="margin-top:24px;">
        <a href="${eventUrl}" style="color:${color};font-weight:bold;text-decoration:underline;font-size:15px;">${escapeHtml(ctaText || DEFAULT_CTA)} →</a>
      </p>
    </td></tr>
    <tr><td style="padding:16px 8px;border-top:1px solid #eee;color:#999;font-size:11px;">${footer}</td></tr>
  </table>`
}

const RENDERERS: Record<string, (p: TemplateParams) => string> = {
  classic: renderClassic,
  bold: renderBold,
  minimal: renderMinimal,
}

export type CampaignPreviewInput = {
  eventName: string
  eventSlug: string
  templateId: string
  messageText: string
  brandColor: string
  ctaText?: string
}

export function renderCampaignPreviewHtml({
  eventName, eventSlug, templateId, messageText, brandColor, ctaText,
}: CampaignPreviewInput) {
  const eventUrl = `${SPOTIX_USER_URL}/event/${eventSlug}`
  const message = messageText.trim()
    ? formatMessage(messageText)
    : `<p style="margin:0 0 16px;color:#9ca3af;">Your message will appear here…</p>`
  const color = /^#[0-9a-fA-F]{6}$/.test(brandColor || "") ? brandColor : BRAND_PURPLE
  const footer = `${COMPANY.name} · ${COMPANY.addressLine1}, ${COMPANY.addressLine2}<br/>
    <a href="#" style="color:inherit;">Unsubscribe from campaign emails</a>`

  const renderer = RENDERERS[templateId] || RENDERERS.classic
  const bodyTable = renderer({ eventName, message, color, eventUrl, footer, ctaText: ctaText || DEFAULT_CTA })

  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:${PAGE_BG};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE_BG};padding:24px 0;">
    <tr><td align="center">${bodyTable}</td></tr>
  </table>
</body>
</html>`
}
