// Build-time switches from Vite's env: `.env.local` here, or the Vercel project's environment variables.
// Each is off unless set to "on". Under plain Node (`npm test`) there is no env, so they're all off.

/** Accounts and sync (ADR 0003): shows ··· → Account. Off until a provider is chosen and tried on the iPhone. */
export const accountsEnabled = import.meta.env?.VITE_TALLY_ACCOUNTS === "on"
