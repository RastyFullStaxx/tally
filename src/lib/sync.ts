// The seam for accounts and sync (ADR 0003). The phone's `tally:v1` stays the source of truth; a provider
// only adds a copy in the user's account. Nothing here touches the network: the defaults below do nothing,
// and the Account screen that uses them is behind `accountsEnabled`, which is off.
import type { Data } from "./model"

/** Who is signed in: only what the Account screen shows. The provider keeps its own tokens. */
export type Account = { id: string; email: string; name?: string }

export interface AuthProvider {
  /** Shown on the button: "Sign in with Google". */
  readonly label: string
  /** False while no real provider is behind this, so the screen can say sign-in isn't connected. */
  readonly connected: boolean
  /** The signed-in account from the provider's own storage, or null. Never throws offline. */
  current(): Promise<Account | null>
  /** Starts sign-in. A redirect flow leaves the page; `current()` finds the account when the app reopens. */
  signIn(): Promise<Account | null>
  /** Signs out. The entries on this phone stay. */
  signOut(): Promise<void>
}

export interface SyncAdapter {
  /** The account's copy, or null when there isn't one yet. Rejects, rather than returning junk, when it can't be read. */
  pull(account: Account): Promise<Data | null>
  /** Replaces the account's copy with the already merged data. */
  push(account: Account, data: Data): Promise<void>
}

/** No accounts: everything stays in this phone's storage, as before. */
export const localAuth: AuthProvider = {
  label: "Google",
  connected: false,
  current: async () => null,
  signIn: async () => null,
  signOut: async () => {},
}

export const localSync: SyncAdapter = {
  pull: async () => null,
  push: async () => {},
}

/** What the app uses. A real provider replaces these two, and nothing else changes. */
export const accounts: { auth: AuthProvider; sync: SyncAdapter } = { auth: localAuth, sync: localSync }
