# Product Vision & Mindset — Canonical Reference

> This is the source-of-truth document for all product/design decisions.
> Every agent must read this before ANY work on the product.

## One-Line Vision

> *Software that acts as the business owner's Chief of Staff — invisible, omnipresent, delivering a verdict they can act on before they sleep. The Automated Nightly Operations Director for 5–15 branch retail operators.*

## Evaluation Criteria (Defaults)

Every feature, fix, or design change must satisfy ALL of these:

1. **Does this help the user — not the other way around?**
   - If the user has to learn a workflow to use it, it's a failure.
   - The product should adapt to them, not the reverse.
2. **Does this reduce decision fatigue at the front door?**
   - Opening the app should feel like relief, not another inbox.
   - Surface what matters NOW; everything else waits.
3. **Does this respect "when to show what" — judgment over volume?**
   - Timing is as important as correctness.
   - Showing everything = showing nothing.
4. **Does this deepen understanding and the learning loop?**
   - Every user decision (approve/reject/snooze/correct) must persist AND
     train the product. A "Not now" that silently resets is a trust-breaker.
5. **Does this make the user feel understood?**
   - The product should remember context, name things correctly, and
     never ask the user to repeat something it should already know.

## Known Anti-Patterns (do NOT ship these)

| Anti-Pattern | What it looks like | Why it fails |
|---|---|---|
| **Dashboard trap** | A wall of cards that shows "everything" | No judgment; decision fatigue; user tunes out |
| **Hedged screen** | Every action has a "Maybe" / "Not sure" option | Implies the product doesn't know what matters |
| **Lie buttons** | Action buttons that don't actually do anything | Destroy trust immediately and permanently |
| **Passive vault** | Data accumulates but nothing ever acts on it | Resembles a spreadsheet, not an intelligence system |
| **Static stage** | Same UI regardless of user context, time, or patterns | No learning loop; static product |
| **Chatbot passivity** | User must prompt everything; the product initiates nothing | Flips the relationship: user works for the product |
| **Surfacing without learning** | Relevant items surfaced, but user corrections are discarded | Breeds distrust; user expects nothing to change |

## Build Standards — Product-First, No Quick Fixes (Non-Negotiable)

Every iteration targets the entire product, not the moment. A change that only
serves one workflow, one tenant, or one screen is incomplete, not done.

1. **No demo-first code paths.** All migrations run against every stored row;
   all surfaces share one design system; nothing special-cases the demo.
2. **Versioned migrations only.** Schema/manifest changes ship as reversible,
   versioned, idempotent migrations with dry-run and audit reports — never
   ad-hoc scripts or silent in-place rewrites.
3. **Prompts are product content.** Prompt instructions are versioned,
   deterministic, and never lossy: build-time inputs (e.g. the user's original
   prompt) are persisted, not discarded.
4. **One design system.** The same tokens-driven components render every
   surface — capture, verdict, report, dashboard — so the product speaks one
   visual language.
5. **Guardrails are code, not vibes.** Model output that affects arithmetic or
   layout (quickChips, icons, accents) passes pure, tested sanitizers before it
   is believed or rendered. Hallucinations downgrade gracefully, never crash.
6. **Proof, not lint.** Linters prove style, not behavior. Claims ship with the
   repo Test Gate (lint + typecheck + regression suites) and deterministic
   tests that demonstrate the claimed behavior.

## Your Product's Vision

**Who:** Exhausted multi-store retail owners (our first customer is a real 10-branch owner — footwear, optical, bakery, apparel, sweet shops) losing ₹25,000–₹75,000/month to invisible leakage (till shortages, supplier price creep of ₹2–5, target amnesia).

**What:** A three-sided loop: the owner speaks a need on WhatsApp → the engine compiles a validated manifest → a counter QR standee appears → staff snap a photo of the paper register or tap 3 numbers (a 15-second, zero-login workflow) → at 9:30 PM, the owner receives a WhatsApp verdict featuring branch rankings, sales champions, till cash balances, and unannounced supplier price-hike alerts.

**Why it matters:** Owners don't want software; they want a verdict before they sleep. The UPI Soundbox proved that the best software has zero UI, proves itself in seconds, and dissolves anxiety instantly. We bury the builder and sell the outcome at a price point of ₹8,000–₹15,000/month.

## Evaluation Criteria for THIS Product

1. **Zero front door for the owner**
   - PASS: The owner makes decisions entirely from one WhatsApp scorecard message.
   - FAIL: The owner is forced to open a URL, login, or dashboard to act.
2. **15-second zero-login frontline**
   - PASS: Staff scan the counter standee, snap a photo or tap numbers, and are done.
   - FAIL: Staff must install an app, enter an OTP, or navigate a multi-step form.
3. **Engine-exact math, never LLM arithmetic**
   - PASS: Numbers are reconciled strictly via formula and invariant enforcement.
   - FAIL: Arithmetic (sums, discrepancies) is computed by an LLM.
4. **Un-fakeable capture on money/mileage flows**
   - PASS: Forced live camera capture with a server timestamp (never force a thief to report his own theft).
   - FAIL: Gallery upload allowed or anchor timestamp missing.
5. **Immutable versioning**
   - PASS: Editing an app deprecates the old manifest and preserves all history.
   - FAIL: A schema change overwrites or erases past records.
6. **The moat compounds**
   - PASS: Every day on the loop accrues vendor-price baselines, staff-variance fingerprints, and handwriting extraction accuracy, training the system.
   - FAIL: Data sits in a passive vault without improving future extractions or alerts.