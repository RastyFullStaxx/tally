import { cn } from "cn"

import type { Notice } from "@/hooks/useNotice"

const ACTION = "h-11 shrink-0 rounded-sm px-4 font-medium text-primary active:bg-primary/10"

/** The notice above the tab bar. The live region stays mounted, so screen readers announce each notice as it appears. */
export function NoticeBar({ notice, onFix, onUndo }: { notice: Notice | null; onFix: (id: string) => void; onUndo: (removed: NonNullable<Notice["undo"]>) => void }) {
  return (
    <div role="status" className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+3.5rem)] z-50 mx-auto max-w-md">
      {notice && (
        <div className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-raised py-1 pl-3 text-sm shadow-lg animate-in duration-200 fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none">
          <span className={cn("min-w-0 flex-1 py-1", notice.undo ? "truncate" : !notice.fix && "pr-3")}>{notice.text}</span>
          {notice.fix && (
            <button type="button" onClick={() => onFix(notice.fix!)} className={ACTION}>
              Fix
            </button>
          )}
          {notice.undo && (
            <button type="button" onClick={() => onUndo(notice.undo!)} className={ACTION}>
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  )
}
