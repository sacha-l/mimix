# Release Plan — Mimix v1

> **Living doc.** The operator's playbook for taking Mimix from demo to first
> paying customers. Update it as the motion is tested and numbers come in.

---

## Positioning

**AI personas test your app like real users and tell you where they got stuck —
a UX report in minutes, no research team.**

Mimix hires a panel of AI personas (each with a distinct patience level,
technical skill, and tolerance for friction). They browse your app in a real
browser, attempt the goal you give them, and report — in their own voice —
exactly where the experience broke down. It is the cheapest, fastest UX
research a small team can run.

## Ideal customer (ICP)

Solo founders and small product teams shipping a **web app** who:
- have just launched or are about to, and
- cannot afford a UX researcher or a moderated-testing tool, and
- need an outside read on whether real users can actually complete the core
  flow (sign-up, onboarding, checkout, the "aha" action).

Warm-start segment: the **Solana ecosystem** — Mimix already runs Solana dApp
runs natively (Phantom stub, devnet, real onchain txs), so crypto builders are
the lowest-friction first conversations. Expand outward to general web apps from
there.

## Channels

- **Build-in-public on X** — post run reports (with permission), persona quotes,
  before/after UX fixes. The persona-voice observations are inherently shareable.
- **Show HN / Product Hunt** — one strong launch once the web-app flow is solid.
- **Indie-hacker communities** — where the ICP already asks "can someone test my
  landing page?"
- **Superteam / Solana channels** — warm, existing niche; good for the first
  cohort and case studies.
- **Direct outreach** — to teams that launched something in the last 30 days
  (Product Hunt, Show HN, Launch threads). Offer a free run.

## First-10 motion (concierge)

The first ~10 customers are landed by hand — the goal is learning and proof, not
scale:

1. Personally onboard each customer (a call or a thread).
2. Run Mimix *with* them — pick personas, set the goal, watch the run.
3. Hand-deliver the report; walk through the top findings.
4. Ask: "what would you fix first?" — capture it.
5. Collect a testimonial + permission to publish a (redacted) case study.
6. Cohort 1 is **comped** (or steeply discounted) in exchange for the case study
   and candid feedback.

After ~10 runs the motion that converted best becomes the repeatable funnel.

## Onboarding process (operator runbook)

For every new customer, the same sequence:

1. **Intake** — confirm it's a web app with a public URL and a clear core flow.
2. **Register** — `/register`: app URL, the customer's email, and the **goal**
   ("what should a user be able to do?"). The goal drives the personas' journey.
3. **Pick personas** — start with all 3 live personas for breadth.
4. **Pay** — USDC to the Mimix payout wallet (comped for cohort 1 via the debug
   skip).
5. **Run** — agents execute sequentially; the live dashboard streams events.
6. **Report** — emailed automatically on completion; also viewable at `/report`.
7. **Debrief** — a 15-minute call: top 3 findings, what they'll fix, did the
   personas feel realistic.
8. **Ask** — for a testimonial and one referral.

## Pricing rationale

Pricing is **cost-plus on LLM tokens** — the operator pays Anthropic per token
upfront, so the per-run price must cover that with margin. Cost is dominated by
the vision loop (a screenshot per turn).

| Tier | Price | Model | Turns | Est. token cost | Gross margin |
|---|---|---|---|---|---|
| Preview | Free | scripted (no LLM) | — | $0 | — |
| Standard | $9 / persona-run | Claude Sonnet 4.6 | 20 | ~$0.30–0.60 | ~95% |
| Pro | $29 / persona-run | Claude Opus 4.7 | 40 | ~$3–5 | ~85% |

Settlement is in **USDC on Solana**. Per-run (not per-seat) pricing keeps the
unit of value honest: a run is a report that moves the product.

## Success metrics (first 90 days)

- Runs completed (target: 25+).
- Paying customers after the comped cohort (target: 5+).
- Testimonials collected (target: 8+).
- Referrals generated (target: 3+).
- Report → "we fixed something" conversion — the real proof the product works.

## Status / open items

- Engine decoupled from Solana so any web app can be tested — see
  `next-features.md` for what's shipped vs pending.
- Launch-blockers and follow-ups are tracked in `next-features.md`.
