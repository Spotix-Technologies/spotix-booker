"use client"

import { useEffect, useState } from "react"
import { Loader2, ChevronLeft, Search, Check, Trophy } from "lucide-react"
import { ResponsiveSheet } from "@/components/ui/responsive-sheet"
import { dicebearAvatarUrl } from "@/lib/dicebear"
import { genContestantId, type ContestantForm } from "../lib/factories"

interface NominationCategory {
  categoryId: string
  name: string
}

interface NominationPollSummary {
  pollId: string
  pollName: string
  pollImage: string
  categories: NominationCategory[]
  status: "active" | "closed"
}

interface Nominee {
  nomineeId: string
  categoryId: string
  name: string
  count: number
}

interface ImportNomineesDialogProps {
  onClose: () => void
  onImport: (contestants: ContestantForm[]) => void
}

export function ImportNomineesDialog({ onClose, onImport }: ImportNomineesDialogProps) {
  const [step, setStep] = useState<"polls" | "nominees">("polls")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [polls, setPolls] = useState<NominationPollSummary[]>([])
  const [selectedPoll, setSelectedPoll] = useState<NominationPollSummary | null>(null)
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)

  const [nominees, setNominees] = useState<Nominee[]>([])
  const [nomineesLoading, setNomineesLoading] = useState(false)
  const [nominationThreshold, setNominationThreshold] = useState<number | null>(null)
  const [qualifiedOnly, setQualifiedOnly] = useState(false)
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // ── Load nomination polls owned by this creator ─────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/polls/nominations")
        const data = await res.json()
        if (!res.ok) { setError(data.error || "Failed to load nomination polls"); return }
        setPolls(data.polls ?? [])
      } catch {
        setError("An unexpected error occurred")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const openPoll = (poll: NominationPollSummary) => {
    setSelectedPoll(poll)
    setActiveCategoryId(poll.categories[0]?.categoryId ?? null)
    setStep("nominees")
    setSelected(new Set())
    setQualifiedOnly(false)
  }

  // ── Load nominees for the active category ───────────────────────────────
  useEffect(() => {
    if (!selectedPoll || !activeCategoryId) return
    const load = async () => {
      setNomineesLoading(true)
      try {
        const res = await fetch(`/api/polls/nominations/${selectedPoll.pollId}/nominees?categoryId=${activeCategoryId}`)
        const data = await res.json()
        if (res.ok) {
          setNominees(data.nominees ?? [])
          setNominationThreshold(data.nominationThreshold ?? null)
        }
      } finally {
        setNomineesLoading(false)
      }
    }
    load()
  }, [selectedPoll, activeCategoryId])

  const isQualified = (n: Nominee) => nominationThreshold != null && n.count >= nominationThreshold

  const filtered = nominees
    .filter((n) => n.name.toLowerCase().includes(search.toLowerCase()))
    .filter((n) => !qualifiedOnly || isQualified(n))

  const toggle = (nomineeId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(nomineeId) ? next.delete(nomineeId) : next.add(nomineeId)
      return next
    })
  }

  const selectAll = () => setSelected(new Set(filtered.map((n) => n.nomineeId)))
  const clearAll = () => setSelected(new Set())

  const handleImport = () => {
    const chosen = nominees.filter((n) => selected.has(n.nomineeId))
    const contestants: ContestantForm[] = chosen.map((n) => ({
      contestantId: genContestantId(),
      name: n.name,
      imagePreview: dicebearAvatarUrl(n.name),
      imageUrl: dicebearAvatarUrl(n.name),
      imageType: "generated",
      uploading: false,
    }))
    onImport(contestants)
    onClose()
  }

  return (
    <ResponsiveSheet
      open
      onClose={onClose}
      title={<span className="block truncate" title={step === "nominees" ? selectedPoll?.pollName : undefined}>{step === "polls" ? "Import from Nominees" : selectedPoll?.pollName}</span>}
      icon={
        step === "nominees" ? (
          <button onClick={() => setStep("polls")} aria-label="Back" className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <ChevronLeft className="w-5 h-5" />
          </button>
        ) : undefined
      }
      size="lg"
      zIndex={70}
      footer={
        step === "nominees" ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-500">{selected.size} selected</p>
            <button
              onClick={handleImport}
              disabled={selected.size === 0}
              className="px-5 py-2.5 rounded-lg bg-[#6b2fa5] text-white text-sm font-medium hover:bg-[#5a1f8a] disabled:opacity-50 transition-colors"
            >
              Import Selected
            </button>
          </div>
        ) : undefined
      }
    >
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#6b2fa5]" /></div>
      ) : error ? (
        <p className="text-center text-red-600 text-sm py-8">{error}</p>
      ) : step === "polls" ? (
        polls.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-500 text-sm">You haven't created any nomination polls yet.</p>
            <a href="/polls/create/nomination" className="text-[#6b2fa5] text-sm font-medium mt-2 inline-block">
              Create one →
            </a>
          </div>
        ) : (
          <div className="space-y-2">
            {polls.map((p) => (
              <button
                key={p.pollId}
                onClick={() => openPoll(p)}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-[#6b2fa5] transition-colors text-left"
              >
                <img src={p.pollImage || "/placeholder.svg"} alt="" className="w-12 h-12 rounded-lg object-cover bg-slate-100 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 truncate">{p.pollName}</p>
                  <p className="text-xs text-slate-500">{p.categories.length} categor{p.categories.length === 1 ? "y" : "ies"}</p>
                </div>
              </button>
            ))}
          </div>
        )
      ) : (
        <div>
          {/* Category filter tabs */}
          <div className="flex gap-2 overflow-x-auto pb-3 -mx-1 px-1">
            {selectedPoll?.categories.map((c) => (
              <button
                key={c.categoryId}
                onClick={() => { setActiveCategoryId(c.categoryId); setSelected(new Set()); setQualifiedOnly(false) }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-colors
                  ${c.categoryId === activeCategoryId ? "bg-[#6b2fa5] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                {c.name}
              </button>
            ))}
          </div>

          {/* Search + select all */}
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search nominees…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-[#6b2fa5]"
              />
            </div>
            <button onClick={selectAll} className="text-xs font-medium text-[#6b2fa5] px-2 py-1 hover:bg-[#6b2fa5]/5 rounded-lg whitespace-nowrap">
              Select all
            </button>
            <button onClick={clearAll} className="text-xs font-medium text-slate-500 px-2 py-1 hover:bg-slate-100 rounded-lg whitespace-nowrap">
              Clear
            </button>
          </div>

          {nominationThreshold != null && (
            <label className="flex items-center gap-2 mb-3 cursor-pointer select-none w-fit">
              <input
                type="checkbox"
                checked={qualifiedOnly}
                onChange={(e) => setQualifiedOnly(e.target.checked)}
                className="w-3.5 h-3.5 accent-[#6b2fa5]"
              />
              <span className="flex items-center gap-1 text-xs font-medium text-slate-600">
                <Trophy className="w-3.5 h-3.5 text-amber-500" />
                Qualified only ({nominationThreshold}+ nominations)
              </span>
            </label>
          )}

          {/* Nominee list */}
          {nomineesLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-[#6b2fa5]" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-slate-400 text-sm py-8">
              {qualifiedOnly ? "No qualified nominees in this category yet." : "No nominees in this category yet."}
            </p>
          ) : (
            <div className="space-y-2">
              {filtered.map((n) => {
                const isSelected = selected.has(n.nomineeId)
                return (
                  <button
                    key={n.nomineeId}
                    onClick={() => toggle(n.nomineeId)}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-xl border transition-colors text-left
                      ${isSelected ? "border-[#6b2fa5] bg-[#6b2fa5]/5" : "border-slate-200 hover:border-slate-300"}`}
                  >
                    <img src={dicebearAvatarUrl(n.name)} alt="" className="w-9 h-9 rounded-full bg-slate-100 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 truncate capitalize">{n.name}</p>
                      <p className="text-xs text-slate-500 flex items-center gap-1">
                        {n.count} nomination{n.count !== 1 ? "s" : ""}
                        {isQualified(n) && (
                          <span className="inline-flex items-center gap-0.5 text-amber-600 font-medium">
                            <Trophy className="w-3 h-3" /> Qualified
                          </span>
                        )}
                      </p>
                    </div>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 border-2
                      ${isSelected ? "bg-[#6b2fa5] border-[#6b2fa5]" : "border-slate-300"}`}>
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </ResponsiveSheet>
  )
}
