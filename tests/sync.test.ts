// The accounts seam (ADR 0003) ships switched off: the local defaults never sign anyone in or send anything.
import assert from "node:assert/strict"
import test from "node:test"
import { accountsEnabled } from "../src/lib/flags.ts"
import { accounts, localAuth, localSync } from "../src/lib/sync.ts"

test("accounts are off unless the build turns them on", () => {
  assert.equal(accountsEnabled, false)
})

test("the default provider is local: nobody signs in and nothing syncs", async () => {
  assert.equal(accounts.auth, localAuth)
  assert.equal(accounts.sync, localSync)
  assert.equal(localAuth.connected, false)
  assert.equal(await localAuth.current(), null)
  assert.equal(await localAuth.signIn(), null)
  await localAuth.signOut()
  const account = { id: "x", email: "x@example.com" }
  assert.equal(await localSync.pull(account), null)
  await localSync.push(account, { entries: [], budget: 0 })
})
