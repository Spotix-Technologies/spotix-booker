# Changes

## 1. Event edit history → Supabase (orchestrated by spotix-backend)
- `app/lib/edit-history.ts` (**new**) – `recordEditHistory()` (fire-and-forget via `after()`, 4s timeout, never throws, never blocks a save), `fetchEditHistory()`, helpers `pickFields`, `toPlain`, `ownerActor`, `actorFromAccess`. Sends before/after snapshots to `POST {BACKEND}/v1/edit-history`; the backend diffs them. Uses the existing `NEXT_PUBLIC_BACKEND_URL` + `CRON_SECRET`.
- `app/api/event/list/[eventId]/route.ts` – records history for: `edit` (`event_updated`), `setSlug`, `apiAccess`, `toggleAgentActivity` (enabled/disabled), `setAgentIncentive`, `toggleDiscount`, `editDiscount`, `setFeeBurden` (legacy `buyerBearsBurden` resolved like admin), and POST `addDiscount`. Actor = organizer, or teammate with their role.
- `app/api/event/list/[eventId]/referrals/route.ts` – records `referral_added` / `referral_removed`; the access resolver now also returns `organizerId` + `actor`.
- `app/api/event/list/[eventId]/edit-history/route.ts` (**new**) – `GET ?limit=&before=` cursor-paginated history; Creator/Admin only.
- `app/lib/team-tabs.ts` – new `history` tab (owner + built-in Admin only; deliberately not grantable to custom roles).
- `app/event-info/[eventId]/page.tsx` – "Edit History" tab (lazy-mounted like the others).
- `app/components/event-info/edit-history-tab.tsx` – now fetches itself (no props needed beyond `eventId`), shows actor name + role, relative time, summary, object/discount diffs, ticket-tier diffs, pagination, refresh and error states.
- `app/hooks/useEditHistory.ts`, `app/types/edit-history.ts`, `app/components/event-info/helper/edit-history-format.ts` (**new**) – split out per modular layout.

Not recorded on purpose: check-in, payouts/vault/payout methods, attendee exports, agent-request approvals (sensitive or operational; they have their own logs).
