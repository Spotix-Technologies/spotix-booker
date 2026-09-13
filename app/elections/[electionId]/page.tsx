"use client"

/**
 * app/elections/[electionId]/page.tsx
 *
 * Election dashboard shell — fetches the election + offices once, then
 * renders whichever tab is active. Each tab is its own file under
 * ./components/ (OfficesTab, VotersTab, CandidatesTab, ResultsTab,
 * PayoutTab) per the "very modular, broken down into different files"
 * ask.
 *
 * UI pass: stat cards (offices/voters/candidates counts, using the same
 * card language as components/dashboard/stats-grid.tsx elsewhere in the
 * app), a status badge matching the elections list page, a voting-window
 * summary line, and a pill-style tab bar with icons — replacing the old
 * plain-text header and underline tabs. EditElectionDialog (pencil icon
 * next to the title) replaces the old inline EditGraceControl.
 */

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Landmark, Users, UserCheck, BarChart3, Wallet, Calendar, Clock } from "lucide-react"
import { OfficesTab } from "./components/OfficesTab"
import { VotersTab } from "./components/VotersTab"
import { CandidatesTab } from "./components/CandidatesTab"
import { ResultsTab } from "./components/ResultsTab"
import { PayoutTab } from "./components/PayoutTab"
import { EditElectionButton } from "./components/EditElectionDialog"

import { Skeleton } from "../components/Skeleton"

type Tab = "offices" | "voters" | "candidates" | "results" | "payout"

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  scheduled: "bg-blue-100 text-blue-700",
  active: "bg-green-100 text-green-700",
  ended: "bg-gray-200 text-gray-500",
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

export default function ElectionDashboardPage() {
  const { electionId } = useParams<{ electionId: string }>()
  const [tab, setTab] = useState<Tab>("offices")
  const [election, setElection] = useState<any>(null)
  const [offices, setOffices] = useState<any[]>([])
  const [voterCount, setVoterCount] = useState(0)
  const [loading, setLoading] = useState(true)

  function reload() {
    setLoading(true)
    fetch(`/api/elections/${electionId}`)
      .then((r) => r.json())
      .then((d) => {
        setElection(d.election)
        setOffices(d.offices ?? [])
        setVoterCount(d.voterCount ?? 0)
      })
      .finally(() => setLoading(false))
  }

  useEffect(reload, [electionId])

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl overflow-x-hidden px-6 py-10">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-2 h-4 w-40" />
        <div className="mt-6 grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <div className="mt-6 flex gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-9 w-24 rounded-full" />
          ))}
        </div>
        <div className="mt-6 flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      </main>
    )
  }
  if (!election) return <main className="mx-auto max-w-4xl px-6 py-10 text-sm text-red-600">Election not found.</main>

  const candidateCount = offices.reduce((sum, o) => sum + (o.candidate_count ?? 0), 0)
  const graceDays = election.edit_grace_days ?? 0

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "offices", label: "Offices", icon: <Landmark size={15} /> },
    { id: "voters", label: `Voters (${voterCount})`, icon: <Users size={15} /> },
    { id: "candidates", label: "Candidates", icon: <UserCheck size={15} /> },
    { id: "results", label: "Results", icon: <BarChart3 size={15} /> },
    { id: "payout", label: "Payout", icon: <Wallet size={15} /> },
  ]

  return (
    <main className="mx-auto max-w-4xl overflow-x-hidden px-6 py-10">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-gray-900">{election.name}</h1>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[election.status]}`}>
              {election.status}
            </span>
            {election.results_published && (
              <span className="shrink-0 rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-[#6b2fa5]">Results published</span>
            )}
          </div>
          {election.description && <p className="mt-1.5 max-w-xl text-sm text-gray-500">{election.description}</p>}
        </div>
        <EditElectionButton electionId={electionId} election={election} onSaved={reload} />
      </div>

      {/* ── Voting window + candidate edit window meta strip ─────────── */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-gray-500">
        <span className="inline-flex items-center gap-1.5">
          <Calendar size={13} className="text-gray-400" />
          {election.voting_starts_at ? (
            <>
              {fmtDate(election.voting_starts_at)}
              {election.voting_ends_at && <> – {fmtDate(election.voting_ends_at)}</>}
            </>
          ) : (
            "Voting window not set yet"
          )}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock size={13} className="text-gray-400" />
          Candidate edit window: {graceDays === 0 ? "no edits allowed" : `${graceDays} day${graceDays === 1 ? "" : "s"} after submitting`}
        </span>
      </div>

      {/* ── Stat cards ─────────────────────────────────────────────── */}
      <div className="mt-5 grid grid-cols-3 gap-3">
        <StatCard icon={<Landmark size={15} className="text-[#6b2fa5]" />} iconBg="bg-[#6b2fa5]/10" label="Offices" value={offices.length} />
        <StatCard icon={<Users size={15} className="text-blue-600" />} iconBg="bg-blue-50" label="Voters" value={voterCount} />
        <StatCard icon={<UserCheck size={15} className="text-emerald-600" />} iconBg="bg-emerald-50" label="Candidates" value={candidateCount} />
      </div>

      {/* ── Tab bar ────────────────────────────────────────────────── */}
      <div className="mt-6 flex gap-1.5 overflow-x-auto rounded-2xl bg-gray-100 p-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition-colors ${
              tab === t.id ? "bg-white text-[#6b2fa5] shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ────────────────────────────────────────────── */}
      <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        {tab === "offices" && <OfficesTab electionId={electionId} offices={offices} onChanged={reload} />}
        {tab === "voters" && <VotersTab electionId={electionId} />}
        {tab === "candidates" && <CandidatesTab electionId={electionId} offices={offices} />}
        {tab === "results" && <ResultsTab electionId={electionId} offices={offices} election={election} onPublished={reload} />}
        {tab === "payout" && <PayoutTab electionId={electionId} />}
      </div>
    </main>
  )
}

function StatCard({ icon, iconBg, label, value }: { icon: React.ReactNode; iconBg: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm sm:p-4">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-medium leading-none text-gray-400">{label}</p>
        <p className="mt-1 text-lg font-bold leading-none text-gray-900">{value.toLocaleString()}</p>
      </div>
    </div>
  )
}
