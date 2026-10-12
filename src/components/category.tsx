import { cn } from "cn"

import { CATEGORIES, type CategoryId } from "@/lib/ledger"

// The order the validator passed on navy: neighbours stay distinct for colourblind eyes (worst ΔE 10.4).
export const CATEGORY_ORDER: CategoryId[] = ["food", "bills", "groceries", "transport", "shopping", "leisure", "health", "other"]

export const categoryColor = (category: CategoryId) => `var(--cat-${category})`

export function CategoryChip({ category, label, className }: { category: CategoryId; label?: string; className?: string }) {
  const color = categoryColor(category)
  return (
    <span
      className={cn("shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] leading-none font-medium", className)}
      style={{
        color: `color-mix(in oklab, ${color} 70%, white)`,
        backgroundColor: `color-mix(in oklab, ${color} 16%, transparent)`,
      }}
    >
      {label ?? CATEGORIES[category]}
    </span>
  )
}
