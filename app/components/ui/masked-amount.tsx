"use client"

import { Eye, EyeOff } from "lucide-react"
import { useBalanceVisibility } from "@/hooks/use-balance-visibility"

type BlockKey = "revenue" | "balance" | "paidOut"

interface MaskedAmountProps {
  value: string
  className?: string
  size?: "sm" | "md" | "lg" | "xl"
  /** If provided, this block has its own toggle. Falls back to global visible. */
  blockKey?: BlockKey
  showToggle?: boolean
  iconClassName?: string
}

const SIZE_CLASSES = {
  sm: "text-sm",
  md: "text-base",
  // Fluid, container-aware sizing: scales down smoothly as the figure grows
  // (more digits) or the card it sits in gets narrower, instead of
  // overflowing the card's edges. Requires an ancestor with `@container`.
  lg: "text-[clamp(1.05rem,7cqw,1.5rem)]",
  xl: "text-[clamp(1.25rem,8cqw,1.875rem)]",
}

const ICON_SIZE = {
  sm: 13,
  md: 14,
  lg: 16,
  xl: 18,
}

export function MaskedAmount({
  value,
  className = "",
  size = "lg",
  blockKey,
  showToggle = true,
  iconClassName = "",
}: MaskedAmountProps) {
  const { visible, blocks, toggle, toggleBlock } = useBalanceVisibility()

  // If a blockKey is given, use that block's visibility; otherwise use global
  const isVisible = blockKey ? blocks[blockKey] : visible
  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (blockKey) toggleBlock(blockKey)
    else toggle()
  }

  return (
    <span className="inline-flex items-center gap-1.5 select-none min-w-0 max-w-full">
      <span
        title={isVisible ? value : undefined}
        className={`${SIZE_CLASSES[size]} font-bold tabular-nums whitespace-nowrap ${className}`}
      >
        {isVisible ? value : "₦••••••"}
      </span>
      {showToggle && (
        <button
          type="button"
          onClick={handleToggle}
          aria-label={isVisible ? "Hide amount" : "Show amount"}
          className={`opacity-50 hover:opacity-100 transition-opacity flex-shrink-0 ${iconClassName}`}
        >
          {isVisible
            ? <EyeOff size={ICON_SIZE[size]} />
            : <Eye size={ICON_SIZE[size]} />
          }
        </button>
      )}
    </span>
  )
}

/**
 * Global toggle button — controls all three blocks at once.
 * Eye is closed only when ALL blocks are hidden.
 */
export function BalanceToggleButton({ className = "" }: { className?: string }) {
  const { visible, toggle } = useBalanceVisibility()
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={visible ? "Hide all balances" : "Show all balances"}
      className={`p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all ${className}`}
    >
      {visible ? <EyeOff size={14} /> : <Eye size={14} />}
    </button>
  )
}
