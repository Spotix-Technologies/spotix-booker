"use client"

/**
 * SearchableSelect
 *
 * A type-to-filter combobox — looks like the existing `<select>` fields
 * elsewhere in create-event, but the value is entered as free text that
 * filters the option list live, with a dropdown of matches to click (or
 * arrow-key + Enter) instead of a native OS dropdown. Used by
 * EventLocation for both Country and State/Region so organizers with a
 * long list (250 countries, sometimes 50+ states) can jump straight to
 * what they want instead of scrolling a native <select>.
 *
 * Deliberately free-typing, not select-only: on blur, if the typed text
 * doesn't exactly match an option, the field reverts to the last
 * confirmed `value` — so the parent's state can never end up holding an
 * un-selected fragment while still letting the organizer filter as they
 * type.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, Loader2 } from "lucide-react"

interface SearchableSelectProps {
  value: string
  onChange: (value: string) => void
  options: string[]
  placeholder?: string
  loadingPlaceholder?: string
  loading?: boolean
  disabled?: boolean
  disabledPlaceholder?: string
  required?: boolean
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Select...",
  loadingPlaceholder = "Loading...",
  loading = false,
  disabled = false,
  disabledPlaceholder,
  required,
}: SearchableSelectProps) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Keep the visible text in sync when the parent's value changes from
  // outside (e.g. country change resetting state, or a draft restore).
  useEffect(() => {
    setQuery(value)
  }, [value])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || q === value.toLowerCase()) return options
    return options.filter((o) => o.toLowerCase().includes(q))
  }, [query, options, value])

  useEffect(() => {
    if (open) setHighlighted(0)
  }, [query, open])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        // Revert to the last confirmed value — never leave an unselected
        // fragment sitting in the parent's state.
        setQuery(value)
      }
    }
    if (open) document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [open, value])

  const selectOption = (option: string) => {
    onChange(option)
    setQuery(option)
    setOpen(false)
    inputRef.current?.blur()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true)
      return
    }
    if (!open) return

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlighted((h) => Math.max(h - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (filtered[highlighted]) selectOption(filtered[highlighted])
    } else if (e.key === "Escape") {
      setOpen(false)
      setQuery(value)
    }
  }

  const effectivePlaceholder = loading
    ? loadingPlaceholder
    : disabled && disabledPlaceholder
      ? disabledPlaceholder
      : placeholder

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          if (!open) setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={effectivePlaceholder}
        disabled={disabled || loading}
        required={required}
        autoComplete="off"
        className="w-full px-4 py-3 pr-10 border-2 border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200 text-slate-900 placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-400"
      />
      {loading ? (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin pointer-events-none" />
      ) : (
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
      )}

      {open && !disabled && !loading && (
        <div className="absolute z-20 mt-1.5 w-full max-h-60 overflow-y-auto rounded-lg border-2 border-slate-200 bg-white shadow-lg">
          {filtered.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-400">No matches</p>
          ) : (
            filtered.map((option, i) => (
              <button
                key={`${option}-${i}`}
                type="button"
                onMouseDown={(e) => e.preventDefault()} // keep focus so onBlur/outside-click logic doesn't fire first
                onClick={() => selectOption(option)}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                  i === highlighted
                    ? "bg-[#6b2fa5]/10 text-[#6b2fa5]"
                    : "text-slate-700 hover:bg-slate-50"
                } ${option === value ? "font-semibold" : ""}`}
              >
                {option}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
