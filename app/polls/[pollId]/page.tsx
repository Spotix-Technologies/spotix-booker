"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import { authFetch, getAccessToken, tryRefreshTokens } from "@/lib/auth-client"
import { InlineTrend } from "@/components/ui/inline-trend"
import { ResponsiveSheet } from "@/components/ui/responsive-sheet"
import { SkeletonBlock, SkeletonRows } from "@/components/ui/skeleton"
import {
  toContestantArray,
  contestantCount as countContestantsField,
  sumVotes as sumContestantVotes,
  computeStandings,
  type ContestantsField,
  type ContestantRecord,
} from "@/lib/contestants"
import {
  Loader,
  ArrowLeft,
  Users,
  Clock,
  CheckCircle,
  XCircle,
  Crown,
  Pencil,
  Banknote,
  Share2,
  Check,
  Settings2,
  Link2,
  ExternalLink,
  Link2Off,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  Tag,
  Eye,
  EyeOff,
  Receipt,
  LayoutGrid,
  RefreshCw,
  AlertTriangle,
  Sparkles,
  Ban,
  Scale,
  FileDown,
} from "lucide-react"

// ─ Types ─

/** @deprecated kept as an alias so existing prop/type references below still
 *  read naturally — use ContestantRecord from @/lib/contestants directly in
 *  new code. */
type Contestant = ContestantRecord

interface CategoryNode {
  categoryId: string
  name: string
  pollPrice: number
  // Contestants can come back as an array OR a map keyed by contestantId —
  // always read through toContestantArray()/countContestantsField(), never
  // off this field directly. See @/lib/contestants.
  contestants: ContestantsField
  subcategories: CategoryNode[]
}

interface Poll {
  id: string
  pollName: string
  pollImage: string
  pollDescription: string
  pollStartDate: string
  pollStartTime: string
  pollEndDate: string
  pollEndTime: string
  pollPrice: number
  pollAmount: number
  pollCount: number
  pollType: "single" | "group"
  categories: CategoryNode[]
  statsVisible: boolean
  // Array or map keyed by contestantId — see @/lib/contestants.
  contestants: ContestantsField
  updatedAt: string | null
  linkedEventId: string | null
  linkedEventName: string | null
  /** True while this poll is waiting on real contestants (e.g. an open
   *  nomination poll hasn't closed yet) — set at creation via the
   *  "Contestants TBD" toggle. Cleared automatically once a
   *  PATCH /api/polls/update brings the poll above the minimum
   *  contestant count. See spotix-booker/app/api/polls/update/route.ts. */
  contestantsTBD?: boolean
  /** Tie-breaker configuration — see app/polls/[pollId]/settings/components/TieBreakerPanel.tsx */
  enabledTieBreaker?: boolean
  tieBreakerDuration?: number | null
  tieBreakerRounds?: number | null
  /** Day-over-day voteSales trend (today vs yesterday) — fetched from
   *  /api/polls/one and merged in after the initial /api/polls/list load.
   *  See lib/sales-trend.ts. */
  salesTrend?: { pct: number | null; tone: "up" | "down" | "flat" } | null
  /** Live tie-breaker round state, keyed by scope ("single" or a leaf categoryId). See
   *  spotix-user/src/app/lib/tie-breaker.ts / spotix-backend/v1/lib/tie-breaker.js for the
   *  state machine that produces this — this codebase only reads and displays it. */
  tieBreakers?: Record<string, TieBreakerLiveState>
}

interface TieBreakerLiveState {
  status: "active" | "fptp" | "resolved"
  round: number
  contestantIds: string[]
  endsAt: string | null
  isFinalRound: boolean
  winnerId: string | null
  resolvedMethod: "tiebreaker-round" | "fptp" | null
}

interface TieBreakerConfig {
  enabled:  boolean
  duration: number | null
  rounds:   number | null
}

interface EntryRow {
  reference: string
  uid: string | null
  payerName: string | null
  payerEmail: string | null
  payerPhone: string | null
  voteCount: number
  price: number
  contestantId: string
  contestantName: string
  categoryId: string | null
  isGuest: boolean
  totalAmount: number
  netAmount: number
  date: string | null
}

type PollStatus = "active" | "ended" | "upcoming"

function getPollStatus(p: Poll): PollStatus {
  const now   = new Date()
  const start = new Date(`${p.pollStartDate}T${p.pollStartTime}`)
  const end   = new Date(`${p.pollEndDate}T${p.pollEndTime}`)
  if (now < start) return "upcoming"
  if (now > end)   return "ended"
  return "active"
}

const STATUS_PILL: Record<PollStatus, { cls: string; icon: typeof CheckCircle; label: string }> = {
  active:   { cls: "bg-green-100 text-green-700",   icon: CheckCircle, label: "Live"     },
  ended:    { cls: "bg-gray-100 text-gray-600",     icon: XCircle,     label: "Ended"    },
  upcoming: { cls: "bg-yellow-100 text-yellow-700", icon: Clock,       label: "Upcoming" },
}
// Overrides the pill above entirely while contestantsTBD is true — being
// "Upcoming" is irrelevant if there's nobody to vote for yet.
const COMING_SOON_PILL = { cls: "bg-purple-100 text-purple-700", icon: Sparkles, label: "Coming Soon" }

// ─ Standings row (shared leaf renderer) 

function StandingsList({
  contestants,
  status,
  emptyMessage = "No contestants yet",
  tieBreaker,
  liveState,
}: {
  contestants: ContestantsField
  status: PollStatus
  emptyMessage?: string
  /** Poll-level tie-breaker config, only relevant once status === "ended". */
  tieBreaker?: TieBreakerConfig
  /** Live round state for this scope, if a tie-breaker has ever kicked in — see TieBreakerLiveState. */
  liveState?: TieBreakerLiveState
}) {
  // Normalize once, up front — contestants may arrive as an array or a
  // map keyed by contestantId (see @/lib/contestants), everything below
  // reads off the flat, sorted array.
  const { sorted, totalVotes, noVotes: noVotesRaw, tied: tiedTop, isTie: rawIsTie } = computeStandings(contestants)
  const topScore = sorted[0]?.votes ?? 0

  const ended   = status === "ended"
  // Edge case 1: nobody voted — never crown a winner off a 0-0 "lead".
  const noVotes = ended && noVotesRaw
  // Edge case 2: 2+ contestants share the top score — sorted[0] is just
  // array order at that point, not a real winner, so don't crown it either.
  // If a tie-breaker round already resolved this scope, its winnerId is
  // authoritative — trust it over the raw vote tally (a stray late vote
  // landing after resolution shouldn't flip the displayed winner).
  const tieBreakerLive = liveState?.status === "active" || liveState?.status === "fptp"
  const resolvedByTieBreaker = liveState?.status === "resolved" ? liveState.winnerId : null

  const isTie    = ended && (rawIsTie || tieBreakerLive) && !resolvedByTieBreaker
  const winnerId = resolvedByTieBreaker ?? (ended && !noVotes && !rawIsTie ? sorted[0]?.contestantId ?? null : null)
  const tiedIds  = tieBreakerLive ? (liveState?.contestantIds ?? []) : tiedTop.map((c) => c.contestantId)

  if (sorted.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-6">{emptyMessage}</p>
  }

  return (
    <div className="space-y-3">
      {noVotes && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 bg-gray-100 border border-gray-200 rounded-xl">
          <Ban className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <p className="text-xs text-gray-500 font-medium">No votes were cast — no winner.</p>
        </div>
      )}

      {resolvedByTieBreaker && (
        <div className="flex items-start gap-2.5 px-3.5 py-2.5 bg-green-50 border border-green-200 rounded-xl">
          <Crown className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-green-800">
            Decided by tie-breaker{liveState?.resolvedMethod === "fptp" ? " (first-past-the-post)" : ` (round ${liveState?.round})`}.
          </p>
        </div>
      )}

      {isTie && !tieBreakerLive && (
        <div className="flex items-start gap-2.5 px-3.5 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
          <Scale className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800">
            <p className="font-semibold">
              {tiedTop.length}-way tie at {topScore.toLocaleString()} vote{topScore !== 1 ? "s" : ""} — no winner crowned yet.
            </p>
            {tieBreaker?.enabled ? (
              <p className="mt-0.5 text-amber-700">
                Tie-breaker is enabled for this poll — {tieBreaker.duration ? `${tieBreaker.duration}h per round` : "duration not set"}
                {tieBreaker.rounds ? `, up to ${tieBreaker.rounds} round${tieBreaker.rounds !== 1 ? "s" : ""}` : ", 1 round"}, then decided
                first-past-the-post.
              </p>
            ) : (
              <p className="mt-0.5 text-amber-700">
                No tie-breaker is configured — enable one from Poll Settings to resolve ties automatically next time.
              </p>
            )}
          </div>
        </div>
      )}

      {tieBreakerLive && (
        <div className="flex items-start gap-2.5 px-3.5 py-2.5 bg-purple-50 border border-purple-200 rounded-xl">
          <Scale className="w-4 h-4 text-[#6b2fa5] flex-shrink-0 mt-0.5" />
          <div className="text-xs text-purple-800">
            <p className="font-semibold">
              {liveState?.status === "fptp"
                ? "First-past-the-post — next vote among the tied contestants wins."
                : `Tie-breaker round ${liveState?.round}${liveState?.isFinalRound ? " (final round)" : ""} is open.`}
            </p>
            {liveState?.status === "active" && liveState?.endsAt && (
              <p className="mt-0.5 text-purple-700">
                Round closes {new Date(liveState.endsAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}.
              </p>
            )}
          </div>
        </div>
      )}

      {sorted.map((c, idx) => {
        const pct      = totalVotes > 0 ? Math.round(((c.votes ?? 0) / totalVotes) * 100) : 0
        const isWinner = winnerId === c.contestantId
        const isTied   = isTie && tiedIds.includes(c.contestantId)
        return (
          <div
            key={c.contestantId}
            className={`flex items-center gap-3 p-3 rounded-xl ${
              isWinner ? "bg-yellow-50 border border-yellow-200" : isTied ? "bg-amber-50 border border-amber-200" : "bg-gray-50"
            }`}
          >
            <span className="w-5 text-xs font-bold text-gray-400 text-center">{idx + 1}</span>
            <img
              src={c.image || "/placeholder.svg"}
              alt={c.name}
              className="w-9 h-9 rounded-full object-cover flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                {isWinner && <Crown className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />}
                {isTied && <Scale className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
              </div>
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#6b2fa5] rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-bold text-gray-900">{(c.votes ?? 0).toLocaleString()}</p>
              <p className="text-xs text-gray-400">{pct}%</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─ Category panel (recursive) — group-poll standings ─

function CategoryStandingsPanel({
  category, depth, status, tieBreaker, tieBreakers,
}: {
  category: CategoryNode
  depth: number
  status: PollStatus
  tieBreaker?: TieBreakerConfig
  /** Full poll-level tie-breaker state map, keyed by scope — this panel looks up its own leaf category's entry. */
  tieBreakers?: Record<string, TieBreakerLiveState>
}) {
  const [open, setOpen] = useState(depth === 0)
  const hasSubcategories = (category.subcategories ?? []).length > 0
  const isLeaf = !hasSubcategories
  const leafContestants = isLeaf ? toContestantArray(category.contestants) : []
  const totalVotes = isLeaf ? sumContestantVotes(category.contestants) : 0

  const bgClass = depth === 0
    ? "bg-white border-gray-200"
    : depth === 1
    ? "bg-purple-50/40 border-purple-100"
    : "bg-blue-50/30 border-blue-100"

  return (
    <div className={`rounded-2xl border overflow-hidden ${bgClass}`} style={depth > 0 ? { marginLeft: Math.min(depth * 12, 32) } : undefined}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-4 hover:bg-black/[0.02] transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[#6b2fa5]/10 flex items-center justify-center flex-shrink-0">
            {hasSubcategories ? <FolderOpen className="w-4 h-4 text-[#6b2fa5]" /> : <Tag className="w-4 h-4 text-[#6b2fa5]" />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{category.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {hasSubcategories
                ? `${category.subcategories.length} sub-categor${category.subcategories.length === 1 ? "y" : "ies"}`
                : `${leafContestants.length} contestant${leafContestants.length !== 1 ? "s" : ""} · ${category.pollPrice > 0 ? `₦${category.pollPrice.toLocaleString()}/vote` : "Free"} · ${totalVotes.toLocaleString()} votes`}
            </p>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-inherit pt-4 space-y-3">
          {hasSubcategories
            ? category.subcategories.map((sub) => (
                <CategoryStandingsPanel key={sub.categoryId} category={sub} depth={depth + 1} status={status} tieBreaker={tieBreaker} tieBreakers={tieBreakers} />
              ))
            : <StandingsList contestants={category.contestants} status={status} tieBreaker={tieBreaker} liveState={tieBreakers?.[category.categoryId]} />}
        </div>
      )}
    </div>
  )
}

// ─ Entries tab 

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })
  } catch {
    return iso
  }
}

function EntriesTab({ pollId, pollType }: { pollId: string; pollType: "single" | "group" }) {
  const [entries,   setEntries]   = useState<EntryRow[]>([])
  const [loading,   setLoading]   = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [cursor,    setCursor]    = useState<string | null>(null)
  const [hasMore,   setHasMore]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  const load = useCallback(async (nextCursor: string | null, append: boolean) => {
    if (append) setLoadingMore(true); else setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ pollId, limit: "25" })
      if (nextCursor) params.set("cursor", nextCursor)
      const res  = await authFetch(`/api/polls/entries?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error || "Failed to load entries"); return }
      setEntries((prev) => append ? [...prev, ...data.entries] : data.entries)
      setCursor(data.nextCursor)
      setHasMore(!!data.hasMore)
    } catch {
      setError("Failed to load entries")
    } finally {
      setLoading(false); setLoadingMore(false)
    }
  }, [pollId])

  useEffect(() => { load(null, false) }, [load])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader className="w-6 h-6 animate-spin text-[#6b2fa5]" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-red-800">{error}</p>
          <button onClick={() => load(null, false)} className="text-xs text-red-600 underline mt-1">Try again</button>
        </div>
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-16 bg-white/50 rounded-2xl border-2 border-dashed border-gray-200">
        <Receipt className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        <p className="text-gray-400 text-sm font-medium">No vote entries yet</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Receipt className="w-4 h-4 text-[#6b2fa5]" /> Vote Entries
        </h3>
        <button onClick={() => load(null, false)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="divide-y divide-gray-100">
        {entries.map((e) => (
          <div key={e.reference} className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#6b2fa5]/10 flex items-center justify-center flex-shrink-0 text-xs font-bold text-[#6b2fa5]">
              {(e.payerName || "G").slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-gray-900 truncate">{e.payerName || "Guest voter"}</p>
                {e.isGuest && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">Guest</span>}
              </div>
              <p className="text-xs text-gray-400 truncate">
                Voted for <span className="text-gray-600 font-medium">{e.contestantName}</span>
                {pollType === "group" && e.categoryId ? " · in a category" : ""} · {fmtDate(e.date)}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-bold text-gray-900">{e.voteCount.toLocaleString()} vote{e.voteCount !== 1 ? "s" : ""}</p>
              <p className="text-xs text-gray-400">₦{e.totalAmount.toLocaleString()}</p>
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="p-4 border-t border-gray-100">
          <button
            onClick={() => load(cursor, true)}
            disabled={loadingMore}
            className="w-full py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loadingMore ? <><Loader className="w-4 h-4 animate-spin" /> Loading…</> : "Load more"}
          </button>
        </div>
      )}
    </div>
  )
}

// ─ Page 

export default function PollManagePage() {
  const router = useRouter()
  const params = useParams()
  const pollId = params.pollId as string

  const [poll,    setPoll]    = useState<Poll | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"overview" | "entries">("overview")
  const [copied,        setCopied]        = useState(false)
  const [showEventMenu, setShowEventMenu] = useState(false)

  //  Download Result (results PDF) ─
  const [resultStatus, setResultStatus]   = useState<"idle" | "preparing" | "ready" | "error">("idle")
  const [resultUrl,    setResultUrl]      = useState<string | null>(null)
  const [resultError,  setResultError]    = useState<string | null>(null)
  const [showResultDialog, setShowResultDialog] = useState(false)

  /**
   * Generates a NEW report — only meaningful the first time (or after a
   * failed attempt). Once resultStatus is "ready", the button below calls
   * handleResultButtonClick instead, which just opens resultUrl straight
   * away — the server route is also idempotent on its own now (see
   * api/polls/[pollId]/results/route.ts), but there's no reason to make a
   * network round trip at all when we already have the URL in hand.
   */
  const handleDownloadResult = async () => {
    setShowResultDialog(true)
    setResultStatus("preparing")
    setResultError(null)
    try {
      const res  = await authFetch(`/api/polls/${pollId}/results`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        setResultStatus("error")
        setResultError(data.error || "Something went wrong. Please try again.")
        return
      }
      setResultUrl(data.downloadUrl)
      setResultStatus("ready")
    } catch {
      setResultStatus("error")
      setResultError("Something went wrong. Please try again.")
    }
  }

  /** What the "Download Report" button actually does — reuse the already-
   *  generated result the instant we have one, generate only if we don't. */
  const handleResultButtonClick = () => {
    if (resultStatus === "ready" && resultUrl) {
      window.open(resultUrl, "_blank", "noopener,noreferrer")
      return
    }
    handleDownloadResult()
  }

  const handleShare = async () => {
    const url = `https://polls.spotix.com.ng/poll/${encodeURIComponent(poll?.id ?? "")}`
    try {
      if (navigator.share) {
        await navigator.share({ title: poll?.pollName, text: `Vote on: ${poll?.pollName}`, url })
      } else {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  //  Auth + data load ─

  useEffect(() => {
    const init = async () => {
      let token = getAccessToken()
      if (!token) {
        const refreshed = await tryRefreshTokens()
        if (!refreshed) { router.push("/login"); return }
        token = getAccessToken()
      }
      if (!token) { router.push("/login"); return }

      const res = await authFetch("/api/polls/list")
      if (res.ok) {
        const data = await res.json()
        const found = (data.polls ?? []).find((p: Poll) => p.id === pollId)
        if (!found) { router.push("/polls"); return }

        // /api/polls/list deliberately returns categories: [] for every
        // poll (it can return dozens of polls per call and fetching each
        // one's full category subcollection there would be expensive —
        // see that route's comments). This page only ever shows ONE poll,
        // so it's cheap to fetch the real tree (group polls) and the
        // day-over-day revenue trend from /api/polls/one and merge them in
        // — without the category fetch, a group poll's "Standings" section
        // always rendered as if it had no categories or contestants at all.
        try {
          const oneRes = await authFetch(`/api/polls/one?pollId=${encodeURIComponent(pollId)}`)
          if (oneRes.ok) {
            const oneData = await oneRes.json()
            if (found.pollType === "group") {
              found.categories = oneData.poll?.categories ?? []
              found.contestantsTBD = oneData.poll?.contestantsTBD ?? found.contestantsTBD
            }
            found.salesTrend = oneData.poll?.salesTrend ?? null
          }
        } catch {
          // Non-fatal — page still renders, just without categories/trend.
        }

        setPoll(found)

        // If a report was already generated on a previous visit, reflect
        // that immediately instead of making the organizer click Download
        // Result again just to find out one exists.
        try {
          const rRes = await authFetch(`/api/polls/${pollId}/results`)
          if (rRes.ok) {
            const rData = await rRes.json()
            if (rData.exists && rData.status === "ready") {
              setResultUrl(rData.downloadUrl)
              setResultStatus("ready")
            }
          }
        } catch {
          // Non-fatal — organizer can still generate a report on demand.
        }
      }
      setLoading(false)
    }
    init()
  }, [pollId, router])

  //  Render 

  if (loading || !poll) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <SkeletonBlock className="h-5 w-28 mb-6" />

          {/* Poll header card skeleton */}
          <div className="bg-white rounded-2xl border border-gray-200 mb-6 overflow-hidden">
            <SkeletonBlock className="h-44 w-full rounded-none" />
            <div className="p-5 space-y-4">
              <SkeletonBlock className="h-6 w-2/3" />
              <SkeletonBlock className="h-4 w-full" />
              <div className="grid grid-cols-3 gap-3">
                <SkeletonBlock className="h-16" />
                <SkeletonBlock className="h-16" />
                <SkeletonBlock className="h-16" />
              </div>
              <SkeletonBlock className="h-10 w-full" />
            </div>
          </div>

          <SkeletonRows count={4} rowClassName="h-16" />
        </div>
      </div>
    )
  }

  const status = getPollStatus(poll)
  const { cls: statusCls, icon: StatusIcon, label: statusLabel } = poll.contestantsTBD
    ? COMING_SOON_PILL
    : STATUS_PILL[status]
  const isGroup = poll.pollType === "group"

  // Total votes across the whole poll — for group polls, sum every leaf category.
  function sumCategoryVotes(cats: CategoryNode[]): number {
    return cats.reduce((sum, cat) => {
      if ((cat.subcategories ?? []).length > 0) return sum + sumCategoryVotes(cat.subcategories)
      return sum + sumContestantVotes(cat.contestants)
    }, 0)
  }
  function countContestantsInTree(cats: CategoryNode[]): number {
    return cats.reduce((sum, cat) => {
      if ((cat.subcategories ?? []).length > 0) return sum + countContestantsInTree(cat.subcategories)
      return sum + countContestantsField(cat.contestants)
    }, 0)
  }

  const totalVotes = isGroup ? (poll.pollCount ?? sumCategoryVotes(poll.categories ?? [])) : (poll.pollCount ?? 0)
  const contestantCount = isGroup ? countContestantsInTree(poll.categories ?? []) : countContestantsField(poll.contestants)

  const tieBreakerConfig: TieBreakerConfig = {
    enabled:  poll.enabledTieBreaker ?? false,
    duration: poll.tieBreakerDuration ?? null,
    rounds:   poll.tieBreakerRounds ?? null,
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">

        {/* Back */}
        <Link
          href="/polls"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Polls
        </Link>

        {/* Poll header card */}
        <div className="bg-white rounded-2xl border border-gray-200 mb-6">
          <div className="h-44 bg-gray-100">
            {poll.pollImage && (
              <img src={poll.pollImage} alt={poll.pollName} className="w-full h-full object-cover" />
            )}
          </div>
          <div className="p-5">
            <div className="flex items-start justify-between gap-3 mb-2">
              <h1 className="text-xl font-bold text-gray-900">{poll.pollName}</h1>
              <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0 ${statusCls}`}>
                <StatusIcon className="w-3 h-3" /> {statusLabel}
              </span>
            </div>
            <p className="text-sm text-gray-500 mb-3">{poll.pollDescription}</p>

            {poll.contestantsTBD && (
              <div className="flex items-center gap-2 bg-purple-50 border border-purple-100 rounded-xl px-3.5 py-2.5 mb-4">
                <Sparkles className="w-4 h-4 text-[#6b2fa5] flex-shrink-0" />
                <p className="text-xs text-purple-700">
                  Contestants haven't been added yet — this poll won't show as votable to
                  visitors until you add at least {isGroup ? "1 category with contestants" : "2 contestants"} from
                  the Edit page.
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 mb-4">
              {isGroup && (
                <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold flex items-center gap-1.5">
                  <LayoutGrid className="w-3 h-3" /> Group Poll
                </span>
              )}
              <span className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 ${poll.statsVisible ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}>
                {poll.statsVisible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                {poll.statsVisible ? "Stats visible to voters" : "Stats hidden from voters"}
              </span>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="p-3 bg-gray-50 rounded-xl text-center">
                <p className="text-lg font-bold text-gray-900">{totalVotes.toLocaleString()}</p>
                <p className="text-xs text-gray-400">Total Votes</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl text-center">
                <p className="text-lg font-bold text-gray-900">{contestantCount}</p>
                <p className="text-xs text-gray-400">Contestants</p>
              </div>
              <div className="p-3 bg-[#6b2fa5]/5 rounded-xl text-center">
                <p className="text-lg font-bold text-[#6b2fa5]">₦{(poll.pollAmount ?? 0).toLocaleString()}</p>
                <p className="text-xs text-gray-400">Revenue</p>
                {poll.salesTrend && (
                  <div className="flex justify-center">
                    <InlineTrend pct={poll.salesTrend.pct} tone={poll.salesTrend.tone} />
                  </div>
                )}
              </div>
            </div>

            {/* Linked event row */}
            {poll.linkedEventId && (
              <div className="relative mt-4 mb-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Linked Event</p>
                <button
                  onClick={() => setShowEventMenu((v) => !v)}
                  className="w-full flex items-center gap-2 px-4 py-3 bg-[#6b2fa5]/5 border border-[#6b2fa5]/20 rounded-xl text-sm text-[#6b2fa5] font-medium hover:bg-[#6b2fa5]/10 transition-colors"
                >
                  <Link2 className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate flex-1 text-left">{poll.linkedEventName}</span>
                </button>
                {showEventMenu && (
                  <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-[200] overflow-hidden">
                    <Link
                      href={`/event-info/${poll.linkedEventId}`}
                      className="flex items-center gap-2 px-4 py-3.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                      onClick={() => setShowEventMenu(false)}
                    >
                      <ExternalLink className="w-4 h-4 text-slate-400" />
                      Visit event info
                    </Link>
                    <Link
                      href={`/polls/${poll.id}/settings`}
                      className="flex items-center gap-2 px-4 py-3.5 text-sm text-red-600 hover:bg-red-50 transition-colors border-t border-slate-100"
                      onClick={() => setShowEventMenu(false)}
                    >
                      <Link2Off className="w-4 h-4" />
                      Unlink event
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2 flex-wrap">
              <Link
                href={`/polls/${pollId}/edit`}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-colors min-w-[100px]"
              >
                <Pencil className="w-4 h-4" /> Edit Poll
              </Link>
              <Link
                href={`/polls/${pollId}/settings`}
                className="flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-100 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-200 transition-colors"
                title="Poll Settings"
              >
                <Settings2 className="w-4 h-4" />
              </Link>
              <button
                onClick={handleShare}
                className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition-colors ${
                  copied
                    ? "bg-green-100 text-green-700"
                    : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                }`}
                title="Share poll link"
              >
                {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                {copied ? "Copied!" : "Share"}
              </button>
              <Link
                href={`/polls/${pollId}/payout`}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#6b2fa5] text-white rounded-xl text-sm font-semibold hover:bg-[#5a1f8a] transition-colors min-w-[100px]"
              >
                <Banknote className="w-4 h-4" /> Payout
              </Link>
              <button
                onClick={handleResultButtonClick}
                disabled={status !== "ended" || resultStatus === "preparing"}
                title={status !== "ended" ? "Available once the poll ends" : undefined}
                className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition-colors min-w-[100px]
                  bg-white border border-[#6b2fa5]/30 text-[#6b2fa5] hover:bg-[#6b2fa5]/5
                  disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
              >
                {resultStatus === "preparing"
                  ? <><Loader className="w-4 h-4 animate-spin" /> Preparing…</>
                  : <><FileDown className="w-4 h-4" /> {resultStatus === "ready" ? "Download Report" : "Download Result"}</>
                }
              </button>
            </div>

            {status !== "ended" && (
              <p className="text-xs text-gray-400 mt-2">
                Results can be generated once this poll ends ({poll.pollEndDate} · {poll.pollEndTime}).
              </p>
            )}
          </div>
        </div>

        {/* Download Result dialog */}
        <ResponsiveSheet
          open={showResultDialog}
          onClose={() => setShowResultDialog(false)}
          ariaLabel="Download results"
          size="sm"
          zIndex={300}
          bodyClassName="px-5 pb-6 pt-5"
        >
        {resultStatus === "preparing" && (
          <>
            <div className="w-11 h-11 rounded-full bg-[#6b2fa5]/10 flex items-center justify-center mb-4">
              <Loader className="w-5 h-5 text-[#6b2fa5] animate-spin" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Preparing your results</h3>
            <p className="text-sm text-gray-500">We are preparing the results. Check back later.</p>
          </>
        )}

        {resultStatus === "ready" && (
          <>
            <div className="w-11 h-11 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <FileDown className="w-5 h-5 text-green-600" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">We have generated your report</h3>
            <p className="text-sm text-gray-500 mb-4">Click to download the results PDF.</p>
            <a
              href={resultUrl ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setShowResultDialog(false)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#6b2fa5] text-white rounded-xl text-sm font-semibold hover:bg-[#5a1f8a] transition-colors"
            >
              <FileDown className="w-4 h-4" /> Click to download
            </a>
          </>
        )}

        {resultStatus === "error" && (
          <>
            <div className="w-11 h-11 rounded-full bg-red-100 flex items-center justify-center mb-4">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Couldn't generate results</h3>
            <p className="text-sm text-gray-500 mb-4">{resultError || "Something went wrong. Please try again."}</p>
            <button
              onClick={handleDownloadResult}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#6b2fa5] text-white rounded-xl text-sm font-semibold hover:bg-[#5a1f8a] transition-colors"
            >
              Try again
            </button>
          </>
        )}
        </ResponsiveSheet>

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-4 bg-white border border-gray-200 rounded-xl p-1.5 w-fit">
          {([
            { key: "overview", label: "Overview", icon: LayoutGrid },
            { key: "entries",  label: "Entries",  icon: Receipt },
          ] as const).map((tab) => {
            const Icon = tab.icon
            const active = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors
                  ${active ? "bg-[#6b2fa5] text-white" : "text-gray-500 hover:bg-gray-50"}`}
              >
                <Icon className="w-3.5 h-3.5" /> {tab.label}
              </button>
            )
          })}
        </div>

        {activeTab === "overview" && (
          <>
            {/* Schedule */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#6b2fa5]" /> Schedule
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Starts</p>
                  <p className="font-medium text-gray-900">{poll.pollStartDate} · {poll.pollStartTime}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Ends</p>
                  <p className="font-medium text-gray-900">{poll.pollEndDate} · {poll.pollEndTime}</p>
                </div>
              </div>
            </div>

            {/* Standings — single poll: flat list. Group poll: category tree. */}
            {isGroup ? (
              <div className="space-y-3">
                {(poll.categories ?? []).length === 0 ? (
                  <div className="text-center py-16 bg-white/50 rounded-2xl border-2 border-dashed border-gray-200">
                    <p className="text-gray-400 text-sm font-medium">
                      {poll.contestantsTBD ? "Contestants TBD — add categories from the Edit page" : "No categories added yet"}
                    </p>
                  </div>
                ) : (
                  poll.categories.map((cat) => (
                    <CategoryStandingsPanel key={cat.categoryId} category={cat} depth={0} status={status} tieBreaker={tieBreakerConfig} tieBreakers={poll.tieBreakers} />
                  ))
                )}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#6b2fa5]" /> Contestant Standings
                </h3>
                <StandingsList
                  contestants={poll.contestants ?? []}
                  status={status}
                  emptyMessage={poll.contestantsTBD ? "Contestants TBD — add them from the Edit page" : "No contestants yet"}
                  tieBreaker={tieBreakerConfig}
                  liveState={poll.tieBreakers?.["single"]}
                />
              </div>
            )}
          </>
        )}

        {activeTab === "entries" && (
          <EntriesTab pollId={pollId} pollType={poll.pollType} />
        )}

      </div>
    </div>
  )
}
