import type { HistoryActor, HistoryValue } from "@/types/edit-history"

export function titleCase(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export const ACTION_LABELS: Record<string, string> = {
  event_updated: "Event details edited",
  slug_changed: "Event link changed",
  api_settings_updated: "API & widget settings changed",
  agent_activity_enabled: "Agent activity turned on",
  agent_activity_disabled: "Agent activity turned off",
  agent_incentive_updated: "Agent incentive changed",
  fee_burden_updated: "Fee payer changed",
  discount_created: "Discount created",
  discount_updated: "Discount edited",
  discount_toggled: "Discount switched on/off",
  discount_deleted: "Discount deleted",
  referral_added: "Referral code added",
  referral_removed: "Referral code removed",
}

export function actionLabel(action?: string) {
  if (!action) return "Event edit"
  return ACTION_LABELS[action] ?? titleCase(action)
}

export function actorLabel(actor?: HistoryActor) {
  if (!actor) return "Unknown"
  const name = actor.name?.trim()
  const role =
    actor.type === "Spotix" ? "Spotix"
    : actor.type === "organizer" ? "Organizer"
    : actor.role ? titleCase(actor.role)
    : "Teammate"
  return name ? `${name} · ${role}` : role
}

const NAIRA = new Intl.NumberFormat("en-NG")

export function scalarValue(value: HistoryValue, field?: string): string {
  if (value === null || value === undefined || value === "") return "Not set"
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (typeof value === "number") {
    return field && /price|value|amount|fee/i.test(field) ? NAIRA.format(value) : String(value)
  }
  if (Array.isArray(value)) return value.length ? value.map((v) => scalarValue(v)).join(", ") : "None"
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${titleCase(k)}: ${scalarValue(v, k)}`)
      .join(" · ")
  }
  const text = String(value)
  // ISO timestamps → readable
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) {
    const d = new Date(text)
    if (!Number.isNaN(d.getTime())) return d.toLocaleString()
  }
  return text
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function timeAgo(iso?: string | null) {
  if (!iso) return "Pending timestamp"
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return "Just now"
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(iso).toLocaleDateString()
}
