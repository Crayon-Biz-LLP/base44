<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Autonomous Operations Desk Agent Guide

## Product Vision — Read First (Non-Negotiable)

Before ANY work on the product — new features, bug fixes, UI changes, prompts,
architecture decisions, or migrations — read the canonical vision document:

> **`docs/00-vision-and-mindset.md`**

**The one-line vision:** *Software that acts as the business owner's Chief of Staff — invisible, omnipresent, delivering a verdict they can act on before they sleep. The Automated Nightly Operations Director for 5–15 branch retail operators.*

Every design/implementation decision must satisfy the evaluation criteria from
that document:

1. **Does this help the operator — not the other way around?**
2. **Does this reduce decision fatigue at the front door?**
3. **Does this respect "when to show what" — judgment over volume?**
4. **Does this deepen the product's understanding and its learning loop?**
   (Every operator decision — approve/reject/snooze/correct — must persist AND
   train the product. A "Not now" that silently resets is a trust-breaker.)
5. **Does this make the operator feel understood?**

Known anti-patterns (dashboard trap, hedged screen, lie buttons, passive vault,
static stage, chatbot passivity, surfacing without learning) are listed in the
vision document — if a change resembles one, it needs rethinking.

## User Operating Rule (Non-Negotiable)

1. **Do only what the user asks for** — nothing more, no matter how
   obviously helpful or "clearly next" an action seems.
2. **Check with the user before proceeding with any fix** — present the
   plan and the implementation approach, and get explicit approval BEFORE
   making code changes or taking actions.
3. **Do not proceed otherwise.** If a task implies follow-on work the user
   didn't ask for, stop and ask instead of doing it.

When in doubt: stop and ask. A question costs seconds; an unrequested
change costs trust.

## Project Overview
Next.js 16 + TypeScript + Drizzle ORM on Neon Postgres + Vercel AI SDK.
The Automated Nightly Operations Director for 5–15 branch retail operators. This repo is a work in progress; the canonical product
reference lives in `../Revised Deck.html` and `docs/`.

## Codebase Discovery Workflow

- Prefer ripgrep/globs for code discovery unless a code-graph index (e.g.
  codebase-memory MCP) is available; if one is configured, prefer its graph
  search, trace, and schema tools for structural questions.
- **DB-investigation split (schema vs code):** table schema, columns, foreign
  keys, types → live database tooling (Neon / psql / drizzle-studio). Which
  code reads/writes a table → grep for the literal table-name pattern.
- For non-code files (Dockerfiles, shell scripts, configs), grep/glob are the
  primary tool.
- **Frontend:** this is Next.js 16, not the Next.js in your training data.
  Read `node_modules/next/dist/docs/` before writing framework code.

## Root Cause Investigation Procedure (Non-Negotiable)

Before applying any fix, follow this procedure step by step. Do NOT skip steps.

**Enforcement**: a `.githooks/commit-msg` hook rejects any commit without a
`Root Cause:` line. The 4W1H documentation (Step 10) feeds this line. There is
no way to commit a fix without documenting its root cause — the hook enforces
it, the procedure defines it.

### Step 1: Read the error traceback exactly
Note the exact error message, error code, file path, line number, and column.
Do NOT assume you know the error from the message alone.

### Step 2: Read the failing code
Open every file in the traceback. Understand what each line does. For SQL
errors embedded in code, also fetch the actual SQL from the database.

### Step 3: Verify the schema
For database errors (type mismatches, constraint violations), query the schema
of EVERY table and column involved. Do NOT assume column types from name
conventions. Sample actual data to confirm type assumptions.

### Step 4: Trace every column pair in a UNION
List every column position in both sides of the UNION; verify each position's
source type vs anchor type. The mismatch is ALWAYS at one specific position.

### Step 5: Reproduce the error directly
Call the failing function/query with real parameters. Confirm the error
matches the original traceback. This is the only way to be certain.

### Step 6: Check git history
Search for when and why the code was introduced (`git log -p`, `git log -S`).
Read the commit message to understand original intent — the fix must preserve
it. If code was created outside version control, trace when linked code was
committed.

### Step 7: Check for sibling callers
Before modifying shared code, grep every caller. Patching only the path the
error reports may leave sibling callers broken.

### Step 8: Verify no other structural issues in the same query
Check the entire query/function for other type mismatches or issues.

### Step 9: Propose the fix
Only after all 8 preceding steps confirm the root cause. The fix must be the
smallest change that addresses the root cause — NOT a workaround or symptom
patch.

### Step 10: Document the 4W1H
Before committing:

```
Root Cause: <why the bug happened, not what you changed — the chain of events that led to the faulty state>
What:       <what the fix does at the code level>
Where:      <which files, which functions, which line ranges>
When:       <reproduction conditions — what input, what state, what sequence triggers it>
How:        <how this fix prevents recurrence — not just "fixed it" but why it won't come back>
```

- The `Root Cause:` line is enforced by the commit-msg hook.
- If the fix is purely additive documentation or config: `Root Cause: N/A — docs/config update`.

## Engineering Standards & Claims (Non-Negotiable)

1. **Do not overstate safety guarantees.** Distinguish clearly between heavily
   reduced risk, structural validity, and absolute atomic immunity.
2. **Differentiate recovery from atomic idempotency.** A sentinel check plus a
   read-before-write is a *recovery mechanism*, not "race-proof", unless the
   underlying system natively enforces uniqueness.
3. **Timezone hygiene over fixed offsets.** Use timezone-aware objects and
   anchor to real capture times. Do not mask time logic with
   `datetime.now(...)` fallbacks where delayed processing would warp relative
   time contexts.
4. **Prove behavior, don't just lint.** Linters prove style compliance, not
   concurrency safety, datetime correctness, or workflow semantics. Safety
   claims must be backed by documented evidence: execution traces of forced
   failure paths, delayed-processing proofs, edge-case coverage.

## Test Gate (Non-Negotiable)

Every change must pass the gate before it is considered done.

- **Pre-push gate** (enforced by `.githooks/pre-push`):
  `npm run lint` + `npx tsc --noEmit` — the fast, hermetic checkpoint that
  catches failures BEFORE they land on main. No server required.
- **CI remains the repo-level gate**; the pre-push hook is the local
  checkpoint.
- Server-dependent checks (`npm run test:prompts`, `npm run test:dashboards`)
  require a running dev server and are deliberately NOT in the push gate.
  Run them before deploying.
- **Quick self-check before pushing:** `npm run lint && npx tsc --noEmit`.
  Bypass (`--no-verify`) is for genuine emergencies only.

## Session Anchored Summary

- **Product charter (non-negotiable, do not violate):** NO QUICK FIXES. Every
  iteration targets the entire product, not the moment — all migrations run
  against every stored row, one design system across all surfaces, prompts as
  versioned product content, guardrails as tested code. Anchor:
  `docs/00-vision-and-mindset.md` (Build Standards section) + decision record
  `docs/adr/0001-manifest-v5-visual-schema-and-migration.md`.
- **Manifest V5 (2026-09-18):** added field/column/row `visual` block
  (`variant | accent | icon` via `ICON_SET`) + `quickChips` in
  `src/lib/domain/manifest.ts`; `MANIFEST_SCHEMA_VERSION = 5`. Presentation
  ONLY — never alters keys/targets/verdict arithmetic (asserted by test).
- **Guardrail functions:** `deriveChips` (deterministic migration inference),
  `sanitizeChips` (LLM-provided chips sanitizer: dedupe/clamp/bounds),
  `resolveIcon`/`assertIconCoverage` (`src/components/ds/icons.ts`,
  neutral-fallback, corruption-proof). Unit tests: `npm run test:unit`
  (`tests/manifest-v5.mts`, 29 assertions) — tsx added as devDependency.
- **Data census:** demo tenant `f0df4a1e` has **225 workflows**; curated demo
  apps are the most recent rows (invoice `c48d0e88`, roster `d301abe4`).
  `schemaVersion` is a workflows *column*. `userPrompt` is NOT persisted yet —
  lossless-artifact-regen fix pending in the migration slice (P3).
- **Known baseline:** `test:prompts` is flaky (11 fails 2026-09-18 run vs ~7
  earlier) — failures are Phase-1 extraction/repair-loop issues
  (`Failed to generate valid output after 3 attempts`, list-vs-grid confusion),
  confirmed via dev log as unrelated to the additive schema change.
  `test:dashboards` green (4/4).
- **UI resource intake (2026-09-24):** external UI/motion/design resources are
  registered in `docs/ui-intake.md` — master table, bucket/verdict vocabulary,
  license baseline, six-criterion audit checklist, and the formal adoption
  gate. Nothing adopts automatically; the owner triggers both adoption and the
  consolidated audit. Currently 8 resources reviewed; only
  `transitions.dev` (hand-rolled techniques) and `emilkowalski/skills`
  (toolchain) are marked for adoption.

## How to Use Skills

When a task matches a skill's description, load it via the agent's skill
mechanism (e.g. `skillkit read <skill-name>` / the skill tool). Skills live in
`.opencode/skills/`.