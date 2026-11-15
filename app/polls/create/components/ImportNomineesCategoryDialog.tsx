"use client"

import { useEffect, useState } from "react"
import { Loader2, ChevronLeft, CheckSquare, Square, Trophy, Layers, Users } from "lucide-react"
import { ResponsiveSheet } from "@/components/ui/responsive-sheet"
import { dicebearAvatarUrl } from "@/lib/dicebear"
import { genContestantId, genCategoryId, type CategoryForm, type ContestantForm } from "../lib/factories"

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

interface ImportNomineesCategoryDialogProps {
  onClose: () => void
  /** Fires with one fully-formed CategoryForm per imported nomination category
   *  (its nominees pre-loaded as contestants). The caller decides where these
   *  land — appended to the root category list, or into the subcategories of
   *  whichever nested category slot the import was opened from. */
  onImport: (categories: CategoryForm[]) => void
  /** Price per vote applied to every imported category — defaults to 100. */
  defaultPollPrice?: number
}

export function ImportNomineesCategoryDialog({ onClose, onImport, defaultPollPrice = 100 }: ImportNomineesCategoryDialogProps) {
  const [step, setStep] = useState<"polls" | "categories">("polls")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [polls, setPolls] = useState<NominationPollSummary[]>([])
  const [selectedPoll, setSelectedPoll] = useState<NominationPollSummary | null>(null)

  // All nominees across every category of the selected poll, fetched in one
  // shot (omitting categoryId returns everything) then grouped client-side.
  const [nominees, setNominees] = useState<Nominee[]>([])
  const [nomineesLoading, setNomineesLoading] = useState(false)
  const [nominationThreshold, setNominationThreshold] = useState<number | null>(null)
  const [qualifiedOnly, setQualifiedOnly] = useState(false)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set())

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

  const openPoll = async (poll: NominationPollSummary) => {
    setSelectedPoll(poll)
    setStep("categories")
    // Every category starts pre-selected — most bookers importing a whole
    // nomination poll want all of its categories.
    setSelectedCategoryIds(new Set(poll.categories.map((c) => c.categoryId)))
    setQualifiedOnly(false)
    setNomineesLoading(true)
    try {
      const res = await fetch(`/api/polls/nominations/${poll.pollId}/nominees`)
      const data = await res.json()
      if (res.ok) {
        setNominees(data.nominees ?? [])
        setNominationThreshold(data.nominationThreshold ?? null)
      }
    } finally {
      setNomineesLoading(false)
    }
  }

  const isQualified = (n: Nominee) => nominationThreshold != null && n.count >= nominationThreshold

  const nomineesFor = (categoryId: string) =>
    nominees.filter((n) => n.categoryId === categoryId).filter((n) => !qualifiedOnly || isQualified(n))

  const toggleCategory = (categoryId: string) => {
    setSelectedCategoryIds((prev) => {
      const next = new Set(prev)
      next.has(categoryId) ? next.delete(categoryId) : next.add(categoryId)
      return next
    })
  }

  const selectAll = () => setSelectedCategoryIds(new Set(selectedPoll?.categories.map((c) => c.categoryId) ?? []))
  const clearAll = () => setSelectedCategoryIds(new Set())

  const handleImport = () => {
    if (!selectedPoll) return
    const chosen = selectedPoll.categories.filter((c) => selectedCategoryIds.has(c.categoryId))

    const categories: CategoryForm[] = chosen.map((cat) => {
      const contestants: ContestantForm[] = nomineesFor(cat.categoryId).map((n) => ({
        contestantId: genContestantId(),
        name: n.name,
        imagePreview: dicebearAvatarUrl(n.name),
        imageUrl: dicebearAvatarUrl(n.name),
        imageType: "generated",
        uploading: false,
      }))

      return {
        categoryId: genCategoryId(),
        name: cat.name,
        pollPrice: defaultPollPrice,
        contestants,
        subcategories: [],
        expanded: true,
      }
    })

    onImport(categories)
    onClose()
  }

  const selectedCount = selectedCategoryIds.size

  return (
    <ResponsiveSheet
      open
      onClose={onClose}
      title={<span className="block truncate" title={step === "categories" ? selectedPoll?.pollName : undefined}>{step === "polls" ? "Import Categories from Nominees" : selectedPoll?.pollName}</span>}
      description={
        step === "polls"
          ? "Import whole categories straight from a nomination poll — each category comes in with its nominees already loaded as contestants."
          : undefined
      }
      icon={
        step === "categories" ? (
          <button onClick={() => setStep("polls")} aria-label="Back" className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <ChevronLeft className="w-5 h-5" />
          </button>
        ) : undefined
      }
      size="lg"
      zIndex={70}
      footer={
        step === "categories" ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-500">{selectedCount} categor{selectedCount === 1 ? "y" : "ies"} selected</p>
            <button
              onClick={handleImport}
              disabled={selectedCount === 0}
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
          {/* Select all / clear */}
          <div className="flex items-center gap-2 mb-3">
            <p className="text-xs text-slate-500 flex-1 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5" /> {selectedPoll?.categories.length ?? 0} categor{(selectedPoll?.categories.length ?? 0) === 1 ? "y" : "ies"} available
            </p>
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
                Only import qualified nominees ({nominationThreshold}+ nominations)
              </span>
            </label>
          )}

          {/* Category list */}
          {nomineesLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-[#6b2fa5]" /></div>
          ) : (
            <div className="space-y-2">
              {selectedPoll?.categories.map((c) => {
                const isSelected = selectedCategoryIds.has(c.categoryId)
                const count = nomineesFor(c.categoryId).length
                return (
                  <button
                    key={c.categoryId}
                    onClick={() => toggleCategory(c.categoryId)}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-xl border transition-colors text-left
                      ${isSelected ? "border-[#6b2fa5] bg-[#6b2fa5]/5" : "border-slate-200 hover:border-slate-300"}`}
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4.5 h-4.5 text-[#6b2fa5] flex-shrink-0" />
                    ) : (
                      <Square className="w-4.5 h-4.5 text-slate-300 flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 truncate">{c.name}</p>
                      <p className="text-xs text-slate-500 flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {count} nominee{count !== 1 ? "s" : ""}
                        {count < 2 && (
                          <span className="text-amber-600 font-medium">· needs at least 2 to be votable</span>
                        )}
                      </p>
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
