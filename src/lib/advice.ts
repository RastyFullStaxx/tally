// Tally's advice: the plain-language tips on Insights, ranked by what you've found helpful. Split from
// insights.ts so it loads with the Insights screen, not at launch; the numbers it reasons from live there.
// Pure functions, so `npm test` runs them under plain Node.
import {
  ESSENTIALS,
  NECESSITIES,
  NEEDS,
  type Tip,
  WANTS,
  type Window,
  categoryDetail,
  daysBetween,
  describeItems,
  essentialsPerDay,
  expensesIn,
  firstDate,
  forecastMonth,
  incomeProfile,
  itemOf,
  median,
  onHand,
  pct,
  recurringBills,
  rolling,
  safeToSpend,
  savingsSummary,
  shortDate,
  spendingPatterns,
  sum,
  topItems,
  unusualWeeks,
} from "./insights.ts"
import { CATEGORIES, isExpense, isIncome, isSaving, type CategoryId, type Entry, type Goal, type TipVote } from "./model.ts"
import { wordsOf } from "./parse.ts"
import { monthName, monthOf, pad, shiftDay, shiftMonth } from "./dates.ts"
import { formatPesoWhole as pesos, capitalize } from "./format.ts"
import { lastMonths, monthSummary, type Summary } from "./ledger.ts"

const TONE_ORDER = { warn: 0, tip: 1, good: 2 }
// The steps of a recovery plan rank straight after the warning they answer, ahead of tips weighed by pesos alone.
const PLAN = 1e12
const SUBSCRIPTIONS = new Set("netflix spotify youtube icloud disney hbo prime viu apple chatgpt canva adobe xbox playstation".split(" "))

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`
const up500 = (centavos: number) => Math.ceil(centavos / 50000) * 50000
const down500 = (centavos: number) => Math.floor(centavos / 50000) * 50000

/** The day the month's running spend first passed the budget (YYYY-MM-DD), or null if it hasn't. */
function budgetRanOut(s: Summary, month: string, budget: number): string | null {
  const i = budget ? s.cumulative.findIndex((v) => v > budget) : -1
  return i < 0 ? null : `${month}-${pad(i + 1)}`
}

export type Usual = { spent: number; income: number; essentials: number; months: number }

/**
 * Your usual month: medians over up to 3 full months before `month` (tracking had begun by the 3rd), or null
 * with fewer than 2. Income comes from the months that had any; essentials are bills, groceries, transport, health.
 */
export function usualMonth(entries: Entry[], month: string): Usual | null {
  const since = firstDate(entries, month)
  const full = lastMonths(entries, shiftMonth(month, -1), 3).filter((m) => m.spent > 0 && `${m.month}-03` >= since)
  if (full.length < 2) return null
  const paid = full.filter((m) => m.income > 0)
  return {
    spent: median(full.map((m) => m.spent)),
    income: paid.length >= 2 ? median(paid.map((m) => m.income)) : 0,
    essentials: median(full.map((m) => sum(expensesIn(entries, m.month).filter((e) => NEEDS.includes(e.category))))),
    months: full.length,
  }
}

/** How many months your savings would cover essentials (bills, groceries, transport and health). */
export function cushion(entries: Entry[], today: string): { months: number; monthly: number; total: number } | null {
  const month = monthOf(today)
  let monthly = usualMonth(entries, month)?.essentials ?? 0
  if (!monthly) {
    const s = monthSummary(entries, month, 0, today)
    if (s.day < 14) return null
    const bills = s.byCategory.find((c) => c.category === "bills")?.total ?? 0
    monthly = bills + (sum(expensesIn(entries, month).filter((e) => ESSENTIALS.includes(e.category))) / s.day) * s.days
  }
  const total = savingsSummary(entries, undefined, today).total
  return monthly > 0 ? { months: total / monthly, monthly, total } : null
}

/**
 * What to do, the way a financial advisor would put it: where the month stands, then a plan for the days left,
 * from your own numbers. Advice is about what's still ahead, never money already spent. Priorities run: don't
 * run out before the month ends, cover bills, keep a safety cushion, then goals, then habits. Warnings come
 * first, then the plan, then tips by how many pesos they're worth, scaled by how helpful you've found that
 * kind of tip. A tip you marked Not helpful stays hidden.
 */
export function advise(entries: Entry[], month: string, budget: number, today: string, extra: { goal?: Goal; votes?: TipVote[]; notBills?: readonly string[] } = {}): Tip[] {
  const s = monthSummary(entries, month, budget, today)
  if (!s.day) return []
  const p = spendingPatterns(entries, month, today)
  const cats = categoryDetail(entries, month, today)
  const current = s.daysLeft > 0
  const name = monthName(month)
  const prevName = monthName(shiftMonth(month, -1))
  const nextName = monthName(shiftMonth(month, 1))
  const when = current ? "this month" : `in ${name}`
  const expenses = expensesIn(entries, month)
  const toMonthEnd = (amount: number) => (current ? Math.round((amount / s.day) * s.days) : amount)
  const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`
  const lower = (c: CategoryId) => CATEGORIES[c].toLowerCase()
  const tips: (Tip & { weight: number })[] = []
  const add = (kind: string, subject: string, tone: Tip["tone"], weight: number, title: string, why: string, action: string) =>
    tips.push({ id: `${kind}:${subject}:${month}`, kind, tone, weight, title, why, action })
  // Categories a tip has already talked about, so the next one doesn't say it again.
  const mentioned = new Set<CategoryId>()

  const bills = cats.find((c) => c.category === "bills")?.total ?? 0
  const topWant = cats.find((c) => WANTS.includes(c.category))
  const topNeed = cats.find((c) => NEEDS.includes(c.category))
  const listCats = (group: CategoryId[]) =>
    cats
      .filter((c) => group.includes(c.category))
      .map((c) => `${CATEGORIES[c.category]} ${pesos(c.total)}`)
      .join(", ")
  // Splits a daily limit the way this month's everyday spending divides (bills are paid once, so left out).
  const dayToDay = s.spent - bills
  const split = (perDay: number) =>
    dayToDay > 0 ? ` Roughly ${pesos((perDay * (p.needs - bills)) / dayToDay)} for things you need and ${pesos((perDay * (p.wants + p.other)) / dayToDay)} for everything else.` : ""
  const notBills = extra.notBills ?? []
  const forecast = forecastMonth(entries, month, today, notBills)
  const safe = current ? safeToSpend(entries, budget, today, notBills) : null
  const comingUp = forecast.upcoming ? `, and ${pesos(forecast.upcoming)} in bills is still to come` : ""

  // What the rest of the month needs: essentials at your usual daily cost, plus the bills still due.
  const ess = current ? essentialsPerDay(entries, today) : null
  const need = ess === null ? null : Math.round(ess * (s.days - s.day)) + forecast.upcoming
  const landing = need === null ? null : s.spent + need
  const cash = s.income - s.spent - s.saved
  const usual = usualMonth(entries, month)
  // Income and savings come whenever you have them, so Tally learns them instead of asking: where income comes
  // from, a usual and a lean month, how often it lands. Ratios use the last 90 days, and money left carries over.
  const inc = incomeProfile(entries, today)
  const lean = inc?.months ? inc.lean : 0 // the month to plan on
  const roll = current ? rolling(entries, today) : null
  const hand = onHand(entries, today)
  const started = firstDate(entries, today)
  const freshThisMonth = started >= `${month}-01`
  const daySpend = roll ? roll.spent / roll.days : s.day ? s.spent / s.day : 0
  const excess = roll ? hand - daySpend * 30 : 0 // in hand beyond a month of spending
  let saveNudged = false // one "save now" amount at a time
  const fresh = entries
    .filter((e) => isIncome(e) && e.date <= today && daysBetween(e.date, today) <= 14)
    .filter((e) => !entries.some((x) => isSaving(x) && !x.income && x.date >= e.date && x.date <= today))
    .reduce<Entry | null>((a, b) => (!a || b.amount > a.amount ? b : a), null)
  const over = budget > 0 && s.spent > budget
  const overForecast = budget > 0 && current && forecast.total > budget

  // The budget.
  if (!budget) {
    const last = monthSummary(entries, shiftMonth(month, -1), 0, today).spent
    const base = usual?.spent ?? last
    // 10% under what you usually spend, and never so much that your leanest month can't still save 20%.
    const capped = lean > 0 && lean * 0.8 < base * 0.9
    const suggest = Math.max(50000, down500(capped ? lean * 0.8 : base * 0.9))
    add(
      "budget-set",
      "",
      "tip",
      Number.MAX_SAFE_INTEGER,
      "Set a monthly budget",
      `${usual ? `You usually spend ${pesos(usual.spent)} a month. ` : last ? `Last month you spent ${pesos(last)}. ` : ""}A budget lets Tally warn you before you overspend.${capped ? " Your income varies, so this leaves 20% to save even in your leanest month." : ""}`,
      base ? `Tap ··· at the top, then Monthly budget. Try ${pesos(suggest)}.` : "Tap ··· at the top, then Monthly budget."
    )
  } else if (over) {
    const extrasShare = p.wants / s.spent
    const drivers = cats.filter((c) => extrasShare < 0.5 || WANTS.includes(c.category)).slice(0, 2)
    for (const c of drivers) mentioned.add(c.category)
    const named = drivers.map((c) => `${CATEGORIES[c.category]} ${pesos(c.total)}`).join(", ")
    const because = extrasShare >= 0.5 ? `Extras were ${pct(extrasShare)} of it: ${named}.` : `Most went to ${named}.`
    if (current) {
      const ranOut = budgetRanOut(s, month, budget)
      add(
        "budget-over",
        "",
        "warn",
        s.spent - budget,
        ranOut ? `Your budget ran out on ${shortDate(ranOut)}` : `You're ${pesos(s.spent - budget)} over your budget`,
        `${pesos(s.spent)} of ${pesos(budget)} spent, with ${days(s.daysLeft)} to go. ${because}`,
        need
          ? `Essentials only until the 1st: about ${pesos(need)} for groceries, transport${forecast.upcoming ? ", health and bills still due" : " and health"}. That ends ${name} near ${pesos(landing!)}.`
          : "Essentials only until the 1st, and wait 48 hours before buying any extra."
      )
    } else
      add(
        "budget-over",
        "",
        "warn",
        s.spent - budget,
        `You went ${pesos(s.spent - budget)} over budget in ${name}`,
        `You spent ${pesos(s.spent)} of your ${pesos(budget)} budget. ${because}`,
        topWant ? `In ${nextName}, cut ${lower(topWant.category)} first. It cost ${pesos(topWant.total)}.` : `In ${nextName}, set a budget closer to what you really spend.`
      )
  } else if (!current) {
    add("budget-done", "", "good", 0, `You stayed ${pesos(budget - s.spent)} under budget`, `You spent ${pesos(s.spent)} of your ${pesos(budget)} budget in ${name}.`, "Put the leftover into savings.")
  } else if (s.day >= 7 || forecast.fromHistory) {
    const perDay = safe?.perDay ?? s.perDay
    if (overForecast) {
      // A daily limit below what essentials alone cost can't be kept: say so, and give the realistic landing.
      const impossible = ess !== null && landing !== null && perDay < ess && landing > budget
      add(
        "budget-forecast-over",
        "",
        "warn",
        forecast.total - budget,
        `You're on track to overspend by ${pesos(forecast.total - budget)}`,
        `You're spending about ${pesos(forecast.dailyRate)} a day on everyday things${comingUp}. That adds up to about ${pesos(forecast.total)} this month, but your budget is ${pesos(budget)}.`,
        impossible
          ? `Essentials alone usually cost about ${pesos(ess)} a day, so ${pesos(budget)} can't be met now. Skip extras and you'll land near ${pesos(landing)}, ${pesos(landing - budget)} over.`
          : `To stay within budget, spend no more than ${pesos(perDay)} a day from now on.${split(perDay)}${topWant ? ` Cut ${lower(topWant.category)} first.` : ""}`
      )
    } else
      add(
        "budget-forecast-ok",
        "",
        "good",
        0,
        `You're on track to have ${pesos(budget - forecast.total)} left over`,
        `At this rate${comingUp ? ", counting the bills still to come," : ""} you'll spend about ${pesos(forecast.total)} of your ${pesos(budget)} budget.`,
        `You can spend up to ${pesos(perDay)} a day and still stay within budget.`
      )
  } else if (s.spent > s.pace) {
    // Under a week of data and no history: a month-end projection is mostly noise, so say what's true instead.
    const perDay = safe?.perDay ?? s.perDay
    add(
      "budget-early",
      "",
      "tip",
      s.spent - s.pace,
      `You've already used ${pct(s.spent / budget)} of your budget`,
      `It's only day ${s.day} and you've spent ${pesos(s.spent)}.${bills ? ` ${pesos(bills)} of that was bills.` : ""}`,
      `Spend no more than ${pesos(perDay)} a day for the rest of the month.${split(perDay)}`
    )
  }

  // A budget you can keep: when this one is broken, or far from what you usually spend.
  if (current && budget) {
    if (over && landing !== null) {
      const fit = up500(landing)
      const spare = s.income - fit - Math.max(0, s.saved)
      // Once Tally knows your leanest month, the new budget has to fit that, not just a good month.
      if (fit > budget && lean)
        add(
          "budget-fit",
          "",
          "tip",
          PLAN + fit - budget,
          `A budget you can keep: ${pesos(fit)}`,
          `Even with essentials only, ${name} lands near ${pesos(landing)}.`,
          lean >= fit
            ? `Set ${nextName} to ${pesos(fit)}. Even your leanest month (${pesos(lean)}) covers it, with ${pesos(lean - fit)} left to save.`
            : `Set ${nextName} to ${pesos(fit)}, and keep ${pesos(fit - lean)} in savings for months like your leanest (${pesos(lean)}), which won't cover it.`
        )
      else if (fit > budget && (!s.income || spare >= 0))
        add(
          "budget-fit",
          "",
          "tip",
          PLAN + fit - budget,
          `A budget you can keep: ${pesos(fit)}`,
          `Even with essentials only, ${name} lands near ${pesos(landing)}.`,
          !s.income
            ? `Set ${nextName} to ${pesos(fit)}, and log your income so Tally can check it fits.`
            : s.saved > 0
              ? `Set ${nextName} to ${pesos(fit)}. You'd still save ${pesos(s.saved)} and keep about ${pesos(spare)} spare.`
              : `Set ${nextName} to ${pesos(fit)}, which leaves about ${pesos(spare)} of your income for savings.`
        )
    } else if (usual && budget < usual.spent * 0.8)
      add(
        "budget-fit",
        "",
        "tip",
        usual.spent - budget,
        "Your budget is below what you usually spend",
        `You usually spend ${pesos(usual.spent)} a month, going by your last ${usual.months} months. Your budget is ${pesos(budget)}.`,
        `Try ${pesos(down500(usual.spent * 0.9))} in ${nextName}, 10% under your usual, and cut extras first. A budget you can keep beats one you break.`
      )
    else if (usual && budget > usual.spent * 1.5)
      add(
        "budget-fit",
        "",
        "tip",
        budget - usual.spent,
        "Your budget has room to spare",
        `You usually spend ${pesos(usual.spent)} a month, but your budget is ${pesos(budget)}.`,
        `Lower it to ${pesos(up500(usual.spent * 1.1))} and move the difference to savings each payday.`
      )
  }

  // Bills you usually pay around now that aren't logged yet.
  if (current) {
    const soon = shiftDay(today, 7)
    for (const b of recurringBills(entries, today, notBills)) {
      if (b.paid || monthOf(b.due) !== month || b.due > soon) continue
      const late = b.due < today
      add(
        "bill-due",
        b.item,
        "tip",
        b.amount,
        late ? `${capitalize(b.item)} is usually paid by now` : `${capitalize(b.item)} is coming up`,
        `You usually pay about ${pesos(b.amount)} around ${shortDate(b.due)}. It's not logged yet this month.`,
        late ? `Paid it already? Log it so your numbers stay right. If not, keep ${pesos(b.amount)} aside for it.` : `Keep ${pesos(b.amount)} aside for it.`
      )
    }
  }

  // Money in hand for the rest of the month: everything that came in and wasn't spent or saved, carried across
  // months, against what essentials and bills still need. Income that usually comes back later this month counts.
  if (current && inc && hand >= 0) {
    const coming = inc.expected
    if (need && hand + coming < need)
      add(
        "cash-short",
        "",
        "warn",
        need - hand - coming,
        "Money may run short before the 1st",
        `${pesos(hand)} is left after spending and savings. Essentials${forecast.upcoming ? " and bills still due" : ""} usually need about ${pesos(need)} more by the ${ordinal(s.days)}${coming ? `, even with the ${pesos(coming)} that usually comes in later` : ""}.`,
        "Spend on essentials only. If it still runs out, take just what you need from savings with withdraw."
      )
    else if (hand > 0 && (over || overForecast))
      add(
        "cash-left",
        "",
        "tip",
        PLAN + hand,
        `You still have ${pesos(hand)}${freshThisMonth ? " this month" : ""}`,
        freshThisMonth
          ? `You earned ${pesos(s.income)}, ${s.saved > 0 ? `spent ${pesos(s.spent)} and saved ${pesos(s.saved)}` : `and spent ${pesos(s.spent)}`}.`
          : `That's what's left of everything you've logged since ${shortDate(started)}, after spending and savings.`,
        `Pay for the rest of ${name} from this, not from savings.`
      )
  }

  // Income. Healthy limits: extras 30% of what comes in, essentials 50%, savings 20%. Income comes whenever, so the
  // ratios use the last 90 days once there's 4 weeks of history; before that, or reviewing a past month, that month.
  if (!entries.some(isIncome)) {
    add(
      "income-missing",
      "",
      "tip",
      2,
      "Add your income",
      "Then Tally can tell you whether you're saving money or losing it.",
      "Type it with a plus sign, like +25000 salary, whenever money comes in."
    )
  } else {
    const w: Window = roll ?? { days: 0, income: s.income, spent: s.spent, saved: s.saved, extras: p.wants, essentials: p.needs }
    // Monthly limits come from your leanest month once Tally knows it, else the window's pace as a 30-day month.
    const monthIn = lean || (roll ? (roll.income / roll.days) * 30 : s.income)
    if (w.income > 0) {
      if (w.spent > w.income) {
        const gap = w.spent - w.income
        if (roll)
          add(
            "income-gap",
            "",
            "warn",
            gap,
            `You've spent ${pesos(gap)} more than came in`,
            `${pesos(w.income)} came in and ${pesos(w.spent)} went out over the last ${roll.days} days.`,
            `Bring spending under what comes in: about ${pesos((gap / roll.days) * 30)} a month less${topWant ? `, starting with ${lower(topWant.category)}` : ""}.`
          )
        else
          add(
            "income-gap",
            "",
            current && inc && inc.expected >= gap ? "tip" : "warn",
            gap,
            current ? `You've spent ${pesos(gap)} more than you've earned so far` : `You've spent ${pesos(gap)} more than you earned`,
            `You${current ? "'ve" : ""} earned ${pesos(s.income)} and spent ${pesos(s.spent)} ${when}.${current && inc?.expected ? ` About ${pesos(inc.expected)} usually still comes in this month.` : ""}`,
            current
              ? "Essentials only until more money comes in."
              : topWant
                ? `In ${nextName}, cut ${lower(topWant.category)} first. It cost ${pesos(topWant.total)}.`
                : `In ${nextName}, keep spending under your income.`
          )
      }
      // The over-budget plan already named the extras, so this one would only repeat it.
      if (w.extras > w.income * 0.3 && !(over && mentioned.size))
        add(
          "extras-high",
          "",
          "tip",
          w.extras - w.income * 0.3,
          "Too much is going to extras",
          roll
            ? `${pct(w.extras / w.income)} of what came in over the last ${roll.days} days went to food, shopping and leisure. A healthy limit is 30%.`
            : `${pct(w.extras / w.income)} of your income went to food, shopping and leisure (${listCats(WANTS)}). A healthy limit is 30%, or ${pesos(w.income * 0.3)}.`,
          roll
            ? `Keep extras under ${pesos(monthIn * 0.3)} a month${lean ? ", 30% of your leanest month" : ""}.`
            : current
              ? `No more extras this month. In ${nextName}, keep them under ${pesos(w.income * 0.3)}.`
              : `In ${nextName}, keep extras under ${pesos(w.income * 0.3)}.`
        )
      else if (w.essentials > w.income * 0.5 && topNeed)
        add(
          "essentials-high",
          "",
          "tip",
          w.essentials - w.income * 0.5,
          "Your essentials cost a lot",
          roll
            ? `${pct(w.essentials / w.income)} of what came in over the last ${roll.days} days went to bills, groceries, transport and health. A healthy limit is 50%.`
            : `${pct(w.essentials / w.income)} of your income went to bills, groceries, transport and health (${listCats(NEEDS)}). A healthy limit is 50%, or ${pesos(w.income * 0.5)}.`,
          `Essentials are hard to cut fast. Start with your biggest one, ${lower(topNeed.category)} at ${pesos(topNeed.total)}${roll ? " this month" : ""}.`
        )
      // The savings rate: money actually put aside, against what came in.
      const rate = w.saved / w.income
      const of = roll ? "of what comes in" : "of your income"
      if (w.saved > 0 && rate >= 0.2)
        add(
          "saving-rate",
          "",
          "good",
          0,
          `You're saving ${pct(rate)} ${of}`,
          `${pesos(w.saved)} of ${pesos(w.income)}${roll ? ` over the last ${roll.days} days` : ""}${rate >= 0.4 ? ", twice the 20% to aim for." : ". Aim for at least 20%, and you're there."}`,
          over ? "Keep it. The budget is the tight part, not your savings." : "Keep putting a share aside each time money comes in."
        )
      else if (entries.some(isSaving) && (!current || s.day >= 7 || roll)) {
        const short = Math.round(w.income * 0.2) - Math.max(0, w.saved)
        add(
          "saving-low",
          "",
          "tip",
          short,
          w.saved > 0 ? `You're saving ${pct(rate)} ${of}` : roll ? "Nothing saved lately" : current ? "Nothing saved yet this month" : `Nothing saved in ${name}`,
          `20% of the ${pesos(w.income)} that came in ${roll ? `over the last ${roll.days} days` : when} would be ${pesos(w.income * 0.2)}. You've put aside ${pesos(Math.max(0, w.saved))}.`,
          inc
            ? `Each time money comes in, put 20% aside first: ${pesos((fresh ?? inc.last).amount * 0.2)} from ${fresh ? `the ${pesos(fresh.amount)} on ${shortDate(fresh.date)}` : `your last ${pesos(inc.last.amount)}`}.`
            : "Each time money comes in, put 20% aside first."
        )
      }
    }

    if (current && inc) {
      // How your income behaves, learned from what you've logged: plan on the lean month, not the good one.
      if (inc.months && inc.typical > 0) {
        if (inc.lean === 0)
          add(
            "income-plan",
            "",
            "tip",
            inc.high / 4,
            "Some months bring no income",
            `Over the last ${inc.months} months the most that came in was ${pesos(inc.high)}, and the least was nothing.`,
            `Keep a month of spending, about ${pesos(usual?.spent ?? monthIn)}, in savings for months like that.`
          )
        else if (!inc.steady)
          add(
            "income-plan",
            "",
            "tip",
            (inc.high - inc.lean) / 4,
            `Plan on ${pesos(inc.lean)} a month`,
            `Your income ranged from ${pesos(inc.lean)} to ${pesos(inc.high)} over the last ${inc.months} months, ${pesos(inc.typical)} in a usual one.`,
            "Budget on your leanest month, and treat anything above it as extra: save at least half of it."
          )
        else
          add(
            "income-plan",
            "",
            "good",
            0,
            `Your income is steady at about ${pesos(inc.typical)} a month`,
            `Every one of the last ${inc.months} months came within 20% of that.`,
            `Steady income suits a fixed budget. Save 20% of it, ${pesos(inc.typical * 0.2)}, as soon as it lands.`
          )
      }
      // Money that just came in with nothing saved from it yet. More in hand than a month of spending gets one
      // instruction (savings-buffer, below), not two different amounts to save.
      if (fresh && excess < 100000 && inc.usualPayment && fresh.amount >= Math.max(inc.usualPayment * 1.5, 100000)) {
        saveNudged = true
        add(
          "windfall",
          fresh.id,
          "tip",
          fresh.amount * 0.5,
          "A bigger payment came in",
          `${pesos(fresh.amount)}${fresh.note ? ` from ${fresh.note}` : ""} on ${shortDate(fresh.date)}, against a usual ${pesos(inc.usualPayment)}.`,
          `Give it a job before it gets spent: half into savings (type save ${Math.floor(fresh.amount / 200)}), the rest for lean months.`
        )
      } else if (fresh && excess < 100000 && fresh.amount >= 50000 && entries.some(isSaving)) {
        saveNudged = true
        add(
          "save-from-income",
          fresh.id,
          "tip",
          fresh.amount * 0.2,
          `Nothing saved from ${shortDate(fresh.date)}'s ${pesos(fresh.amount)} yet`,
          "Saving a share of each payment as it lands is how money that comes and goes turns into savings.",
          `Put 20% aside now: type save ${Math.floor(fresh.amount / 500)}.`
        )
      }
      // A dry spell: longer than usual since money last came in.
      if (inc.gapDays && inc.sinceDays >= 14 && inc.sinceDays > inc.gapDays * 1.5) {
        const lasts = daySpend > 0 ? Math.floor(hand / daySpend) : 0
        add(
          "dry-spell",
          "",
          lasts < 14 ? "warn" : "tip",
          daySpend * 30,
          `No income logged for ${inc.sinceDays} days`,
          `It usually comes every ${Math.round(inc.gapDays)} days or so.`,
          hand > 0 && lasts > 0
            ? `Essentials only until money comes in. What's left, ${pesos(hand)}, lasts about ${days(lasts)} at your usual spending. If some came in, log it.`
            : "Essentials only until money comes in. If some came in, log it so the numbers stay right."
        )
      }
    }
  }

  // Savings, the safety cushion and the goal.
  const savings = savingsSummary(entries, extra.goal, today)
  // More in hand than a month of spending: keep a month for the gaps between payments, save the rest.
  const monthSpend = daySpend * 30
  if (excess >= 100000)
    add(
      "savings-buffer",
      "",
      "tip",
      excess * 0.5,
      `You're holding ${pesos(excess)} more than a month of spending`,
      `${pesos(hand)} is left from what's come in, and a month usually costs you about ${pesos(monthSpend)}.`,
      `Keep a month at hand for the gaps between payments, and move the rest to savings: type save ${Math.floor(excess / 100)}.`
    )
  else if (!roll && s.income > 0 && cash >= 100000 && (!current || s.day >= 20))
    add(
      "savings-leftover",
      "",
      "tip",
      cash * 0.5,
      `You have ${pesos(cash)} left over`,
      `You earned ${pesos(s.income)}, spent ${pesos(s.spent)} and saved ${pesos(s.saved)} ${when}.`,
      current ? `Move it to savings before it gets spent: type save ${Math.floor(cash / 100)}.` : "Move it to savings."
    )
  const withdrawn = sum(entries.filter((e) => isSaving(e) && e.income && e.date.startsWith(month)))
  if (withdrawn > 0 && (over || s.net < 0))
    add(
      "savings-withdrawn",
      "",
      "tip",
      withdrawn,
      `You took ${pesos(withdrawn)} out of savings`,
      `Spending ran past ${over ? "your budget" : "your income"} ${when}.`,
      `Put it back the next time money comes in: type save ${Math.floor(withdrawn / 100)}.`
    )
  const g = savings.goal
  // A safety cushion comes before goals: 3 to 6 months of essentials put aside is the usual advice, and the full
  // 6 when income swings from month to month.
  const c = current ? cushion(entries, today) : null
  const target = inc?.months && !inc.steady ? 6 : 3
  if (c && c.total > 0 && c.months < target) {
    const m = Math.round(c.months * 10) / 10
    add(
      "cushion",
      "",
      "tip",
      (c.monthly * 3 - c.total) / 10,
      `Your savings cover ${m < 1 ? "less than a month" : m === 1 ? "1 month" : `${m} months`} of essentials`,
      `${pesos(c.total)} saved, and bills, groceries, transport and health usually cost ${pesos(c.monthly)} a month. ${target === 6 ? "With income that varies, aim for 6 months put aside." : "Aim for 3 to 6 months put aside for emergencies."}`,
      g ? `Keep the first ${pesos(c.monthly * target)} for emergencies before spending savings on ${g.name}.` : `Build it to ${pesos(c.monthly * target)} before any big purchase.`
    )
  }
  if (g && g.left === 0) add("savings-goal-done", g.name, "good", 0, `You reached your ${g.name} goal`, `${pesos(savings.total)} saved of ${pesos(g.amount)}.`, "Set a new goal from the ··· menu.")
  else if (g && savings.total <= 0)
    add("savings-goal-start", g.name, "tip", g.amount * 0.05, `Start your ${g.name}`, "You haven't put anything aside for it yet.", "After payday, type save and an amount, like save 1000.")
  else if (g && savings.monthlyAvg > 0) {
    const monthsLeft = Math.ceil(g.left / savings.monthlyAvg)
    // The lever: a quarter of this month's biggest extra, moved to savings.
    const quarter = topWant ? topWant.total / 4 : 0
    const sooner = quarter ? monthsLeft - Math.ceil(g.left / (savings.monthlyAvg + quarter)) : 0
    const faster = monthsLeft > 1 ? g.left / (monthsLeft - 1) - savings.monthlyAvg : 0
    add(
      "savings-goal",
      g.name,
      "good",
      0,
      `${g.name}: ${pct(g.progress)} of the way`,
      savings.deposits === 1
        ? `You've saved ${pesos(savings.total)} of ${pesos(g.amount)}, in one go so far. Saving that much each month gets you there by ${g.eta}.`
        : `You've saved ${pesos(savings.total)} of ${pesos(g.amount)}. At your pace so far, about ${pesos(savings.monthlyAvg)} a month, you'll get there by ${g.eta}.`,
      sooner >= 1
        ? `Moving a quarter of your ${lower(topWant!.category)} spending (about ${pesos(quarter)} a month) to savings gets you there ${sooner === 1 ? "a month" : `${sooner} months`} sooner.`
        : faster
          ? `Saving ${pesos(faster)} more a month gets you there a month sooner.`
          : "One more month like this and you're there."
    )
  } else if (!g && inc && !entries.some(isSaving) && !saveNudged && excess < 100000)
    add(
      "savings-start",
      "",
      "tip",
      inc.last.amount * 0.2,
      "Pay yourself first",
      "You've logged income but haven't set any money aside yet.",
      `Each time money comes in, put a share in savings first: 20% of your last ${pesos(inc.last.amount)} is ${pesos(inc.last.amount * 0.2)}. Type save ${Math.floor(inc.last.amount / 500)}. It won't count as spending.`
    )

  // Extras growing against the same days of last month. Needs follow the calendar (rent day, grocery Saturdays).
  const grown = cats
    .filter((x) => WANTS.includes(x.category) && x.before > 0 && x.total - x.before >= 50000 && x.total >= x.before * 1.25 && !mentioned.has(x.category))
    .sort((x, y) => y.total - y.before - (x.total - x.before))[0]

  // A week that's unusual for you. A category already growing on the month gets that one tip, not two.
  if (current)
    for (const u of unusualWeeks(entries, today, notBills)) {
      if (u.direction === "high" && u.category !== grown?.category && !mentioned.has(u.category)) {
        const week = entries.filter((e) => isExpense(e) && e.category === u.category && e.date > shiftDay(today, -7) && e.date <= today)
        mentioned.add(u.category)
        add(
          "unusual",
          u.category,
          "tip",
          (u.thisWeek - u.usual) * 4,
          `${CATEGORIES[u.category]} is unusually high this week`,
          `You spent ${pesos(u.thisWeek)} on ${lower(u.category)} in the last 7 days, mostly ${describeItems(topItems(week, 2))}. Your usual week is about ${pesos(u.usual)}, going by your last ${u.weeks} weeks.`,
          `Go easy on ${lower(u.category)} for the next few days to get back to normal.`
        )
      } else if (u.direction === "low")
        add(
          "calm",
          u.category,
          "good",
          0,
          `${CATEGORIES[u.category]} is lower than usual`,
          `${pesos(u.thisWeek)} in the last 7 days, against about ${pesos(u.usual)} in a normal week.`,
          `Nice. That's ${pesos(u.usual - u.thisWeek)} you didn't spend.`
        )
    }

  if (grown) {
    mentioned.add(grown.category)
    const save = toMonthEnd(grown.total - grown.before)
    const cap = Math.round(grown.before / s.day / 1000) * 1000
    add(
      "category-up",
      grown.category,
      "tip",
      save,
      `You're spending more on ${lower(grown.category)}`,
      `By this time in ${prevName} you'd spent ${pesos(grown.before)} on it. Now it's ${pesos(grown.total)}, ${pct((grown.total - grown.before) / grown.before)} more. Mostly ${describeItems(grown.top.slice(0, 2))}.`,
      current ? `Try to keep it under ${pesos(cap)} a day, like last month. You'd save about ${pesos(save)} a month.` : `Spending like ${prevName} would have saved you ${pesos(save)}.`
    )
  }

  // One kind of extra taking a big share.
  const top = cats.find((x) => WANTS.includes(x.category))
  // Not when one purchase makes up most of it: that's a one-off (its own tip covers it), not a habit to trim.
  if (top && !mentioned.has(top.category) && s.spent >= 300000 && top.share >= 0.35 && top.biggest.amount < top.total / 2) {
    const trim = toMonthEnd(top.total) / 10
    add(
      "category-share",
      top.category,
      "tip",
      trim,
      `${CATEGORIES[top.category]} is where most of your money goes`,
      `It's ${pct(top.share)} of everything you spent: ${pesos(top.total)} over ${top.count} purchases, about ${pesos(top.average)} each. Mostly ${describeItems(top.top)}.`,
      `Spending 10% less on it saves about ${pesos(trim)} a month, ${pesos(trim * 12)} a year.`
    )
  }

  // The same treat, again and again. Extras only: a daily commute isn't a habit to break.
  const repeats = new Map<string, { count: number; total: number }>()
  for (const e of expenses) {
    const w = wordsOf(e.note)[0]
    if (!w || NECESSITIES.has(w) || !WANTS.includes(e.category)) continue
    const r = repeats.get(w) ?? { count: 0, total: 0 }
    repeats.set(w, { count: r.count + 1, total: r.total + e.amount })
  }
  const habit = [...repeats].sort((x, y) => y[1].total - x[1].total).find(([, r]) => r.count >= 4 && r.total >= 50000)
  if (habit) {
    const [w, r] = habit
    const monthly = toMonthEnd(r.total)
    add(
      "habit",
      w,
      "tip",
      monthly / 2,
      `You spent on ${capitalize(w)} ${r.count} times ${when}`,
      `That's ${pesos(r.total)}, about ${pesos(r.total / r.count)} each time.${current ? ` At this rate it'll be ${pesos(monthly)} by the end of the month.` : ""}`,
      `Doing it half as often saves about ${pesos(monthly / 2)} a month, ${pesos(monthly * 6)} a year.`
    )
  }

  // Small extras adding up (fares and lunches are needs, so they don't count).
  const small = expenses.filter((e) => e.amount < 20000 && WANTS.includes(e.category) && !NECESSITIES.has(itemOf(e)))
  const smallSum = sum(small)
  if (small.length >= 10 && smallSum >= 100000 && smallSum / s.spent >= 0.15) {
    const cap = Math.round(((smallSum / s.day) * 0.7) / 1000) * 1000
    const saved = toMonthEnd(smallSum) * 0.3
    add(
      "small-buys",
      "",
      "tip",
      smallSum * 0.3,
      "Small extras are adding up",
      `${small.length} extras under ₱200 came to ${pesos(smallSum)}, ${pct(smallSum / s.spent)} of what you spent ${when}. Mostly ${describeItems(topItems(small, 2))}.`,
      `Try to keep small extras under ${pesos(cap)} a day. You'd save about ${pesos(saved)} a month, ${pesos(saved * 12)} a year.`
    )
  }

  // Weekends against weekdays.
  const { weekendAvg, weekdayAvg } = p
  if (p.weekendDays >= 2 && p.weekdayDays >= 4 && weekdayAvg > 0 && weekendAvg >= weekdayAvg * 1.5 && weekendAvg - weekdayAvg >= 20000) {
    const cap = Math.round((weekdayAvg * 1.25) / 1000) * 1000
    add(
      "weekends",
      "",
      "tip",
      (weekendAvg - weekdayAvg) * 8,
      "You spend a lot more on weekends",
      `On weekends you spend about ${pesos(weekendAvg)} a day on food, shopping and leisure. On weekdays it's ${pesos(weekdayAvg)}.`,
      `Try a ${pesos(cap)} limit on weekend days. You'd save about ${pesos((weekendAvg - cap) * 8)} a month.`
    )
  }

  // One expense big enough to plan for, and what the month looks like without it.
  // Any expense, bills included: setting money aside each week for a big rent is sound advice.
  const big = expenses.reduce<Entry | null>((a, b) => (!a || b.amount > a.amount ? b : a), null)
  if (big && s.spent >= 300000 && big.amount / s.spent >= 0.15) {
    const without = s.spent - big.amount
    add(
      "big-expense",
      itemOf(big),
      "tip",
      big.amount * 0.1,
      `One purchase was ${pct(big.amount / s.spent)} of your spending`,
      `${capitalize(big.note || CATEGORIES[big.category])} on ${shortDate(big.date)} cost ${pesos(big.amount)}.${over && without <= budget ? ` Without it you'd be ${pesos(budget - without)} under budget.` : ""}`,
      big.category === "bills"
        ? `If you pay this every month, set aside ${pesos(big.amount / 4)} each week so the money is ready.`
        : WANTS.includes(big.category)
          ? `For treats this size, put ${pesos(up500(big.amount))} aside at the start of the month, and wait 48 hours before any extra over ₱1,000.`
          : `If it comes again, set aside ${pesos(big.amount / 4)} each week so it's ready.`
    )
  }

  if (current) {
    // Subscriptions among the bills that repeat: small each, big over a year.
    const subs = recurringBills(entries, today, notBills).filter((b) => SUBSCRIPTIONS.has(b.item))
    const subsTotal = subs.reduce((n, b) => n + b.amount, 0)
    if (subs.length >= 2 || subsTotal >= 50000)
      add(
        "subscriptions",
        "",
        "tip",
        subsTotal * 2,
        `Your subscriptions cost ${pesos(subsTotal)} a month`,
        `${subs.map((b) => `${capitalize(b.item)} ${pesos(b.amount)}`).join(", ")}. That's ${pesos(subsTotal * 12)} a year.`,
        "Cancel any you didn't use this month. Each one you drop saves its price twelve times a year."
      )

    // Spending creeping up, month after month.
    const [m1, m2, m3] = lastMonths(entries, shiftMonth(month, -1), 3)
    if (m1.spent > 0 && `${m1.month}-03` >= firstDate(entries, month) && m1.spent < m2.spent && m2.spent < m3.spent && m3.spent >= m1.spent * 1.15)
      add(
        "creep",
        "",
        "tip",
        m3.spent - m1.spent,
        "Your spending has grown 3 months in a row",
        `${monthName(m1.month)} ${pesos(m1.spent)}, ${monthName(m2.month)} ${pesos(m2.spent)}, ${monthName(m3.month)} ${pesos(m3.spent)}.`,
        `Hold ${name} to ${pesos(m3.spent)} or less, ${monthName(m3.month)}'s level, so it stops climbing.`
      )

    // A payday splurge: the 3 days after money came in, against a usual day. Needs 3 weeks of history.
    const pay = entries.filter((e) => isIncome(e) && e.date <= shiftDay(today, -3) && e.date >= shiftDay(today, -35)).sort((x, y) => y.date.localeCompare(x.date))[0]
    if (pay && firstDate(entries, today) <= shiftDay(today, -21)) {
      const extrasIn = (from: string, to: string) => sum(entries.filter((e) => isExpense(e) && WANTS.includes(e.category) && e.date >= from && e.date <= to))
      const after = extrasIn(pay.date, shiftDay(pay.date, 2))
      const start = shiftDay(today, -28)
      const inside = pay.date >= start
      // ponytail: a payday just before the 28-day window is only partly netted out; fine for a nudge.
      const usualDay = (extrasIn(start, shiftDay(today, -1)) - (inside ? after : 0)) / (inside ? 25 : 28)
      if (usualDay > 0 && after >= 100000 && after / 3 >= usualDay * 2)
        add(
          "payday",
          pay.date,
          "tip",
          after - usualDay * 3,
          "You spend most right after payday",
          `${pesos(after)} on extras in the 3 days after you were paid on ${shortDate(pay.date)}, against about ${pesos(usualDay)} on a usual day.`,
          `On payday, save first, then give the next 3 days a ${pesos(Math.max(50000, up500(usualDay * 4.5)))} limit for extras.`
        )
    }
  }

  if (current && p.noSpend >= 3) add("no-spend", "", "good", 0, `${p.noSpend} days with no spending`, "Days this month when you didn't spend anything.", "Try to add one more each week.")

  // Rank by what you've found helpful: each kind's weight scales by (helpful + 1) / (not helpful + 1).
  const votes = extra.votes ?? []
  const hidden = new Set(votes.filter((v) => v.vote < 0).map((v) => v.id))
  const helpfulness = (kind: string) => {
    const mine = votes.filter((v) => v.kind === kind)
    return (mine.filter((v) => v.vote > 0).length + 1) / (mine.filter((v) => v.vote < 0).length + 1)
  }
  return tips
    .filter((t) => !hidden.has(t.id))
    .map((t) => ({ ...t, weight: t.weight * helpfulness(t.kind) }))
    .sort((x, y) => TONE_ORDER[x.tone] - TONE_ORDER[y.tone] || y.weight - x.weight)
    .slice(0, 6)
    .map(({ id, kind, tone, title, why, action }) => ({ id, kind, tone, title, why, action }))
}
