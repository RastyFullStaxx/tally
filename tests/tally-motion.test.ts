import assert from "node:assert/strict"
import test from "node:test"
import { tallyMotion } from "../src/lib/tally-motion.ts"

test("pending work overrides greetings, and waits until the threshold", () => {
  assert.equal(tallyMotion("working", "wave", true, false, false), null)
  assert.equal(tallyMotion("working", "wave", true, false, true), "working")
  assert.equal(tallyMotion("working", "idle", true, true, true), "working")
})
test("hidden, disabled or reduced-motion environments never animate", () => {
  for (const state of ["idle", "working", "success"] as const) {
    assert.equal(tallyMotion(state, "wave", false, false, true), null)
  }
})
test("typing and sheets pause ambient and greeting motion, not real task success", () => {
  assert.equal(tallyMotion("idle", "idle", true, true, false), null)
  assert.equal(tallyMotion("idle", "wave", true, true, false), null)
  assert.equal(tallyMotion("success", "wave", true, true, false), "success")
})
test("idle waits for a scheduled clip; explicit greetings can then play", () => {
  assert.equal(tallyMotion("idle", null, true, false, false), null)
  assert.equal(tallyMotion("idle", "idle", true, false, false), "idle")
  assert.equal(tallyMotion("idle", "wave", true, false, false), "wave")
})
