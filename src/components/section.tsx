import type { ReactNode } from "react"

/** The small uppercase label at the top of each Insights card, like VS Code's panel headers. */
export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{children}</h2>
}
