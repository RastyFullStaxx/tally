import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { accounts, type Account } from "@/lib/sync"

/**
 * ··· → Account, shown only when `accountsEnabled` is on (ADR 0003). Signing in adds a copy in the account;
 * the phone keeps its own. While the provider is the local default, it explains that and stays disconnected.
 */
export function AccountPanel({ onDone }: { onDone: () => void }) {
  const { auth } = accounts
  const [account, setAccount] = useState<Account | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    auth.current().then(
      (found) => live && setAccount(found),
      () => {}
    )
    return () => {
      live = false
    }
  }, [auth])

  // Sign-in and sign-out both report a failure here instead of closing the sheet.
  const run = async (step: () => Promise<Account | null>) => {
    setBusy(true)
    setProblem(null)
    try {
      setAccount(await step())
    } catch {
      setProblem("That didn't work. Check the connection and try again. Your entries on this phone are fine.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 overflow-y-auto px-1 pb-[env(safe-area-inset-bottom)]">
      <DrawerHeader className="p-2 pb-0">
        <DrawerTitle>Account</DrawerTitle>
        <DrawerDescription>{account ? `Signed in as ${account.email}.` : "Keep a copy of your entries in your account, so another phone can have them too."}</DrawerDescription>
      </DrawerHeader>
      <ul className="space-y-1.5 px-1 text-sm text-muted-foreground">
        <li>Your entries stay on this phone and keep working offline. Signing in only adds a copy.</li>
        <li>Signing out never deletes what's on this phone.</li>
        <li>Export a backup first (··· → Export backup), just in case.</li>
      </ul>
      {!auth.connected && <p className="rounded-md bg-white/[0.03] px-2.5 py-2 text-xs text-muted-foreground">Sign-in isn't connected in this version yet.</p>}
      {problem && (
        <p role="alert" className="px-1 text-sm text-over">
          {problem}
        </p>
      )}
      <DrawerFooter className="gap-1.5 px-0 pt-1">
        {account ? (
          <Button size="lg" variant="secondary" disabled={busy} onClick={() => run(async () => (await auth.signOut(), null))}>
            Sign out
          </Button>
        ) : (
          <Button size="lg" disabled={busy || !auth.connected} onClick={() => run(() => auth.signIn())}>
            Sign in with {auth.label}
          </Button>
        )}
        <Button size="lg" variant="ghost" onClick={onDone}>
          Not now
        </Button>
      </DrawerFooter>
    </div>
  )
}
