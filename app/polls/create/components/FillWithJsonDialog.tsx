"use client"

import { useState } from "react"
import { ResponsiveSheet } from "@/components/ui/responsive-sheet"
import { FileJson, AlertCircle, CheckCircle2, Mail } from "lucide-react"
import {
  parseContestantsJson, parseCategoriesJson,
  buildContestantsFromNames, buildCategoryTreeFromJson,
  type JsonImportSkipCounts,
} from "../lib/json-import"
import type { ContestantForm, CategoryForm } from "../lib/factories"

interface FillWithJsonDialogProps {
  pollType: "single" | "group"
  onClose: () => void

  /** Poll being edited — used only to prefill the "higher limits" email
   *  subject. Omitted on the create flow (poll doesn't exist yet). */
  pollId?: string

  // ── Single poll ────────────────────────────────────────────────────────────
  /** How many contestants are already in the list — the import budget is
   *  maxSingleContestants minus this, so JSON only ever adds, never replaces. */
  existingContestantsCount?: number
  maxSingleContestants?: number
  onImportContestants?: (contestants: ContestantForm[]) => void

  // ── Group poll ─────────────────────────────────────────────────────────────
  /** Current top-level category count and total sub-category count (see
   *  countSubcategories() in lib/poll-config.ts) — imported categories are
   *  always appended at the root, alongside whatever's already there. */
  existingTopCount?: number
  existingTotalSubcount?: number
  maxGroupTopCategories?: number
  maxGroupTotalSubcategories?: number
  maxContestantsPerCategory?: number
  onImportCategories?: (categories: CategoryForm[]) => void
}

const SINGLE_EXAMPLE = `["Jane Doe", "John Smith", "Amara Okafor"]`

const GROUP_EXAMPLE = `{
  "categories": [
    {
      "name": "Best Actor",
      "pollPrice": 100,
      "contestants": ["Actor A", "Actor B"],
      "subcategories": [
        { "name": "Regional", "contestants": ["Actor C", "Actor D"] }
      ]
    }
  ]
}`

export function FillWithJsonDialog({
  pollType, onClose, pollId,
  existingContestantsCount = 0, maxSingleContestants = 50, onImportContestants,
  existingTopCount = 0, existingTotalSubcount = 0,
  maxGroupTopCategories = 50, maxGroupTotalSubcategories = 150, maxContestantsPerCategory = 35,
  onImportCategories,
}: FillWithJsonDialogProps) {
  const [jsonText, setJsonText] = useState("")
  const [parseError, setParseError] = useState<string | null>(null)
  const [result, setResult] = useState<{ accepted: number; skipped: JsonImportSkipCounts } | null>(null)

  const mailtoSubject = pollId ? `Higher limits for poll with ${pollId}` : "Higher limits for a new poll"
  const mailtoHref = `mailto:support@spotix.com.ng?subject=${encodeURIComponent(mailtoSubject)}`

  const handleImport = () => {
    setParseError(null)
    setResult(null)
    if (!jsonText.trim()) { setParseError("Paste some JSON first."); return }

    if (pollType === "single") {
      const parsed = parseContestantsJson(jsonText)
      if ("error" in parsed) { setParseError(parsed.error); return }
      const budget = Math.max(0, maxSingleContestants - existingContestantsCount)
      const { accepted, skipped } = buildContestantsFromNames(parsed.list, budget)
      if (accepted.length > 0) onImportContestants?.(accepted)
      setResult({ accepted: accepted.length, skipped: { contestants: skipped, categories: 0 } })
    } else {
      const parsed = parseCategoriesJson(jsonText)
      if ("error" in parsed) { setParseError(parsed.error); return }
      const topBudget = Math.max(0, maxGroupTopCategories - existingTopCount)
      const subBudget = Math.max(0, maxGroupTotalSubcategories - existingTotalSubcount)
      const { categories, skipped } = buildCategoryTreeFromJson(parsed.list, {
        topBudget, subBudget, maxContestantsPerCategory,
      })
      if (categories.length > 0) onImportCategories?.(categories)
      setResult({ accepted: categories.length, skipped })
    }
  }

  return (
    <ResponsiveSheet
      open
      onClose={onClose}
      title="Fill with JSON"
      icon={
        <div className="w-8 h-8 rounded-lg bg-[#6b2fa5]/10 flex items-center justify-center">
          <FileJson className="w-4 h-4 text-[#6b2fa5]" />
        </div>
      }
      size="lg"
      zIndex={70}
      bodyClassName="px-5 py-4 space-y-3"
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">
            {result ? "Done" : "Cancel"}
          </button>
          <button
            onClick={handleImport}
            className="px-5 py-2.5 rounded-lg bg-[#6b2fa5] text-white text-sm font-medium hover:bg-[#5a1f8a] transition-colors"
          >
            Import
          </button>
        </div>
      }
    >
      <p className="text-xs text-slate-500">
        {pollType === "single"
          ? "Paste a JSON array of contestant names — each one gets a Dicebear avatar automatically, and you can swap it for an uploaded photo afterwards, same as any manually added contestant."
          : "Paste your category structure as JSON. Categories can nest up to 3 levels deep (a top-level category → its sub-categories → their sub-categories); contestants only belong on the deepest level of each branch. Every contestant gets a default avatar automatically, edit to change them to customized photos."}
      </p>

      <textarea
        value={jsonText}
        onChange={(e) => setJsonText(e.target.value)}
        placeholder={pollType === "single" ? SINGLE_EXAMPLE : GROUP_EXAMPLE}
        rows={10}
        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono outline-none focus:border-[#6b2fa5] resize-y"
      />

      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer font-medium text-slate-600 hover:text-[#6b2fa5]">
          Show example format
        </summary>
        <pre className="mt-2 p-3 rounded-lg bg-slate-50 border border-slate-200 overflow-x-auto whitespace-pre-wrap">
          {pollType === "single" ? SINGLE_EXAMPLE : GROUP_EXAMPLE}
        </pre>
      </details>

      {parseError && (
        <p className="text-xs text-red-600 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {parseError}
        </p>
      )}

      {result && (
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
          {result.accepted > 0 && (
            <p className="text-xs text-emerald-700 flex items-start gap-1.5 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              {pollType === "single"
                ? `${result.accepted} contestant${result.accepted === 1 ? "" : "s"} imported.`
                : `${result.accepted} categor${result.accepted === 1 ? "y" : "ies"} imported.`}
            </p>
          )}
          {result.accepted === 0 && result.skipped.contestants === 0 && result.skipped.categories === 0 && (
            <p className="text-xs text-slate-500">Nothing to import.</p>
          )}
          {result.skipped.contestants > 0 && (
            <p className="text-xs text-red-600 flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              {result.skipped.contestants} contestant{result.skipped.contestants === 1 ? "" : "s"} couldn't be imported — the limit was reached.
            </p>
          )}
          {result.skipped.categories > 0 && (
            <p className="text-xs text-red-600 flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              {result.skipped.categories} categor{result.skipped.categories === 1 ? "y" : "ies"} couldn't be imported — the limit was reached.
            </p>
          )}
        </div>
      )}

      <p className="text-xs text-slate-400 flex items-center gap-1.5 pt-1">
        <Mail className="w-3.5 h-3.5 flex-shrink-0" />
        Need higher limits? Send an email to{" "}
        <a href={mailtoHref} className="text-[#6b2fa5] font-medium hover:underline">
          support@spotix.com.ng
        </a>
      </p>
    </ResponsiveSheet>
  )
}
