import assert from "node:assert/strict"
import test from "node:test"
import { preloadable } from "../src/lib/preload.ts"

test("starts the import once and shares it", async () => {
  let calls = 0
  const load = preloadable(async () => ++calls)
  const [a, b] = await Promise.all([load(), load()])
  assert.equal(a, 1)
  assert.equal(b, 1)
  assert.equal(await load(), 1)
  assert.equal(calls, 1)
})

test("a failed import is retried on the next call", async () => {
  let calls = 0
  const load = preloadable(async () => {
    calls++
    if (calls === 1) throw new Error("offline")
    return "chunk"
  })
  await assert.rejects(load(), /offline/)
  assert.equal(await load(), "chunk")
  assert.equal(calls, 2)
})
