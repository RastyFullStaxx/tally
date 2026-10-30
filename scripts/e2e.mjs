// End-to-end checks in a real browser at iPhone size: `npm run e2e` (after `npm run build`). Serves dist/ with
// Vite's preview server and walks the main flows: log lines, the typo check and Fix, delete and Undo, search,
// the CSV export, and answering a detected bill. Playwright isn't a dependency, so `npm ci` and Vercel stay
// light; install it once with `npm i -D playwright && npx playwright install chromium` to run this.
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { preview } from "vite"

let chromium, devices
try {
  // A project install first, then one Node can find on its own (a global install, say).
  ;({ chromium, devices } = await import("playwright").catch(() => createRequire(import.meta.url)("playwright")))
} catch {
  console.error("Playwright isn't installed. Run: npm i -D playwright && npx playwright install chromium")
  process.exit(1)
}

const server = await preview({ preview: { port: 4179, strictPort: true }, logLevel: "error" })
const url = "http://localhost:4179/"
const browser = await chromium.launch()
const failures = []

/** Each flow gets a fresh phone: its own storage, with How to use already seen. */
async function flow(name, seed, run) {
  const context = await browser.newContext({ ...devices["iPhone 13"], serviceWorkers: "block", acceptDownloads: true })
  await context.addInitScript((data) => {
    if (localStorage.getItem("tally:v1")) return
    localStorage.setItem("tally:help-seen", "1")
    if (data) localStorage.setItem("tally:v1", JSON.stringify(data))
  }, seed)
  const page = await context.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(e.message))
  try {
    await page.goto(url)
    await run(page)
    assert.deepEqual(errors, [], "no errors in the page")
    console.log(`ok   ${name}`)
  } catch (error) {
    failures.push(name)
    console.log(`FAIL ${name}\n     ${String(error.message).split("\n")[0]}`)
  } finally {
    await context.close()
  }
}

const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("tally:v1") ?? '{"entries":[]}'))
const line = (page) => page.getByRole("textbox", { name: /New entry/ })
const notice = (page) => page.locator("div[role=status] > div")
const pad = (n) => String(n).padStart(2, "0")
const daysAgo = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

await flow("typing a line saves it with a category", null, async (page) => {
  await line(page).fill("jollibee 245")
  await line(page).press("Enter")
  await page.getByRole("button", { name: /jollibee/ }).waitFor()
  const [e] = (await stored(page)).entries
  assert.deepEqual([e.note, e.amount, e.category], ["jollibee", 24500, "food"])
})

const coffees = { budget: 0, entries: [120, 130, 110, 120, 150].map((p, i) => ({ id: `c${i}`, date: daysAgo(i + 1), amount: p * 100, income: false, note: "coffee", category: "food", createdAt: i })) }

await flow("an amount far off its usual asks about a typo, and Fix opens it", coffees, async (page) => {
  await line(page).fill("coffee 1200")
  await line(page).press("Enter")
  assert.match(await notice(page).textContent(), /10× the usual .* An extra zero\?/)
  await page.getByRole("button", { name: "Fix" }).click()
  assert.equal(await page.getByLabel("Amount in pesos").inputValue(), "1200")
})

await flow("delete, then Undo puts the entry back with the same id", coffees, async (page) => {
  await line(page).fill("taho 50")
  await line(page).press("Enter")
  const before = (await stored(page)).entries.map((e) => e.id)
  await page.getByRole("button", { name: /taho/ }).click()
  await page.getByRole("button", { name: "Delete" }).click()
  await page.getByRole("button", { name: "Tap again to delete" }).click()
  await page.getByRole("button", { name: "Undo" }).click()
  assert.deepEqual(
    (await stored(page)).entries.map((e) => e.id),
    before
  )
})

await flow("search finds entries from any day and shows their total", coffees, async (page) => {
  await page.getByRole("button", { name: "Search entries" }).click()
  await page.getByRole("searchbox", { name: "Search entries" }).fill("coffee")
  await page.getByText("5 entries · ₱630 spent").waitFor()
})

await flow("export for spreadsheets downloads a CSV with every entry", coffees, async (page) => {
  await page.getByRole("button", { name: "More" }).first().click()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Export for spreadsheets" }).click()])
  const text = await (await download.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks).toString("utf8"))
  assert.equal(text.trim().split("\r\n").length, 6, "a header and 5 rows")
})

const months = [2, 1, 0].map((back) => {
  const d = new Date()
  d.setMonth(d.getMonth() - back, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
})
const rent = { budget: 3000000, entries: months.map((m, i) => ({ id: `r${i}`, date: `${m}-01`, amount: 800000, income: false, note: "rent", category: "bills", createdAt: i })) }

await flow("a detected bill asks once, and the answer is kept", rent, async (page) => {
  await page.getByRole("button", { name: "Insights" }).click()
  await page.getByText("Is Rent a monthly bill?").waitFor()
  await page.getByRole("button", { name: "Not a bill" }).click()
  assert.deepEqual((await stored(page)).bills, { rent: "not" })
  await page.getByRole("button", { name: "Rent" }).click()
  assert.equal((await stored(page)).bills, undefined)
})

await browser.close()
await new Promise((resolve) => server.httpServer.close(resolve))
if (failures.length) {
  console.log(`\n${failures.length} failed`)
  process.exit(1)
}
console.log("\nAll flows passed.")
