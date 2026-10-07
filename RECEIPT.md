# Receipt — usage-headroom gate

Checked: 2026-10-07, against the live Grok Bot product. The page in `demo/` is a draft with sample numbers. It is not evidence that the product does any of this.

**Live product: FAIL on cases 1 through 7.**

This desk did not sign in to Grok Bot Settings, did not call an account usage endpoint, did not post, and did not open a pull request. The verdicts below come from the product docs and the open request this packet answers.

## Sources

- Grok Bot Settings, fetched 2026-10-07: [Settings and notifications](https://docs.x.ai/grok-bot/settings-and-notifications). “Usage & Billing shows weekly included usage and on-demand usage for eligible accounts, and the account menu can show Weekly usage at a glance.” Notifications fire when a bot finishes or needs input. No bot read, no reset clock, no routine gate, no threshold alert.
- Routines, fetched 2026-10-07: [Cursor help](https://cursor.com/help/grok-bot/routines) and [xAI docs](https://docs.x.ai/grok-bot/skills-routines-and-automations). A routine has a schedule and, where supported, an event. History is success and failure (xAI) or Running, Succeeded, and Failed (Cursor help). A failed run can show a reason. The documented response to fast usage is to pause routines by hand. A webhook response of 200 means a run started. Test does real work.
- Plans, fetched 2026-10-07: [Plans and billing](https://cursor.com/help/grok-bot/plans). Included usage is Weekly usage and resets weekly. If on-demand is off, Grok Bot stops when that grant runs out.
- The request this packet answers, posted 2026-10-07 by @NKerzman: [Breakdown in the app by bot and category, and the same data available to bots](https://forum.cursor.com/t/breakdown-in-the-app-by-bot-and-category-and-the-same-data-available-to-bots/173936). “The Usage page in Settings shows a single weekly percentage and the reset date. … the bots can’t see it at all.” The headroom examples are “run this if usage is under 60% with two or more days left” and holding optional work when usage is ahead of pace. Threshold examples are 50%, 75%, and 90%.
- Cursor staff @Colin, 2026-10-05, on [BOT Agent Credit Usage](https://forum.cursor.com/t/bot-agent-credit-usage/173671): “today the Usage section in Grok Bot’s Settings shows your weekly usage for the whole account, not split by Bot. A per-Bot breakdown is something the team is working on.” The CSV he points at is Cursor dashboard Usage for cloud agents and automations, with a Cloud Agent ID and an Automation ID. That is a different meter, and it is an owner export, not a read a Grok Bot routine can make at fire time.
- Related open request, still describing the same hole: [Per-agent Grok Bot usage](https://forum.cursor.com/t/per-agent-grok-bot-usage-who-worked-tokens-cache-and-cost-vs-the-weekly-pool/169926). Callers there say there is no public probe for `week_pct` or a reset timestamp, and that with no on-demand overflow every bot stops at 100%, including essential ones.

Cloud Agents `GET /v1/agents/{id}/usage` returns token counts for a cloud-agent run. It is not the Grok Bot included weekly percent and it has no reset time. It does not satisfy case 1.

## Case 1 — Bots cannot read weekly usage % or time until reset

**FAIL.**

The owner can open Settings → Usage & Billing and see weekly included usage for the whole account. Official docs describe that screen and the account-menu glance. They do not describe a tool, file, or API a bot can read during a routine.

@NKerzman states the bots cannot see the Usage page at all. @Colin describes the same screen as an owner Settings section. The routine docs list what a bot is given at run time (instruction, schedule, event, webhook body). Usage is not in that list.

The only documented way to react to usage is the owner pausing routines, or the product stopping Grok Bot after the weekly grant is gone.

## Case 2 — Bot-read percent disagrees with Settings, or the reset has no clock

**FAIL.**

There is no bot-read percent, so nothing can agree with Settings → Usage.

What the owner is described as seeing is “a single weekly percentage and the reset date” (@NKerzman, 2026-10-07). The settings doc says the screen shows weekly included usage and on-demand usage. It does not document an exact reset timestamp. The plans doc says the grant resets weekly and does not give a clock time.

A date with no clock cannot support “at least N days” as an exact duration, and it cannot support an even-pace check against a seven-day window.

This desk did not open a signed-in Usage screen, so it does not claim a pixel-level reading of that clock. The published description is a weekly percentage and a reset date, and no bot-readable copy of either.

## Case 3 — No routine condition; a prompt would be guessing

**FAIL.**

Routine setup is “what it should do and when.” When-to-run is a schedule or an event (Slack, GitHub, Linear, Sentry, PagerDuty, email, webhook). There is no field for “run only when weekly usage is under X%” and no optional days clause.

Putting that sentence in the instruction would not check a real usage number. Case 1 says the bot cannot read one.

## Case 4 — A gated routine still starts, or a skip leaves no history

**FAIL.**

No gate exists, so a due routine starts and spends usage. Test spends usage. A webhook that returns 200 has started a run.

History does not have a Skipped result. Recorded outcomes are Running, Succeeded, and Failed, and a failure reason is for a run that started and failed. A skip that never started cannot be recorded, because the product does not skip.

## Case 5 — Pace hold also blocks essential routines

**FAIL.**

There is no pace hold, so optional work cannot be held when used percent is ahead of the elapsed week while essential routines keep firing.

The live stop is coarser. With on-demand off, weekly usage running out stops Grok Bot until the reset ([Plans and billing](https://cursor.com/help/grok-bot/plans)). Callers on the per-agent thread describe that stop hitting every bot, including safety-critical ones. Pausing a routine is manual and all-or-nothing for that routine. Nothing in the routine model says “this one is essential and ignores pace.”

## Case 6 — Threshold alerts repeat every run, or never fire

**FAIL.**

50 / 75 / 90 crossings are not a setting. Nothing in Settings or routine docs delivers “weekly usage crossed 75%” once per crossing per week.

The notifications that do exist fire when a bot finishes or needs input, and error notices sit above the composer. Those are not usage crossings, and they are not latched to a weekly threshold. Hitting the usage limit is the product stopping at an empty grant, not an owner-chosen alert on the way there.

## Case 7 — “Fixed” by a per-bot breakdown chart alone

**FAIL.**

A per-bot or per-category chart is a different request. @Colin said that breakdown is being worked on. It is out of scope for this packet, and this repo does not draw one.

That chart would not give a bot the weekly percent and the reset clock, would not add a per-routine condition, would not skip a run, and would not latch threshold alerts. Shipping it alone would leave cases 1 through 6 failed. They are failed now, with or without the chart.

## What this repo is

`demo/index.html` is a draft of the gate only: a Settings-shaped reading, the bot-read object, per-routine ceilings, the days clause, pace hold that does not touch an ungated routine, skip history with the percent seen, and one alert per crossing. `docs/headroom-gate.md` is the copy and the field contract. `node --test tests/gate.test.mjs` checks that draft contract. None of that is the live product.
