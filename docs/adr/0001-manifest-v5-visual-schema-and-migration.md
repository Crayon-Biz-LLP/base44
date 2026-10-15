# ADR 0001 — Manifest V5: Visual Vocabulary, Versioned Migration, One Design System

Status: Accepted
Date: 2026-09-18

## Context

Generated forms looked flat and rigid next to vended examples like Gemini
Canvas. Diagnosis: the LLM was tasked with expressing only data schema
(`layout_type`, rows, columns, labels, targets), and the native renderers
(`ListForm`/`GridForm`) performed zero aesthetic lifting. Design intent — hero
metrics, quick-tap denominations, status pills, icons, accents — had no
vocabulary in the manifest and no honoring in the renderers. Existing
`theme`/`description`/`subtitle`/`analytics` manifest blocks were already
stored but unrendered.

The product already ships two surfaces that must stay siblings, not rivals:
the typed native forms (correctness + verdict path) and the generated artifact
apps (free-form HTML in a sandboxed iframe).

Scope facts: 225 stored workflows under the demo tenant; `schemaVersion` is a
workflows **column** (currently `4` live; chat route bumps it on edit). The
build-time `userPrompt` was derived from the last chat message and **not
persisted** — regeneration of artifacts is currently lossy.

## Decision

1. **Manifest V5 adds a field-level `visual` block** to every field, column,
   and row (list + grid + personal): `variant` (`hero | quick_tap | standard |
   compact`), `accent` (`emerald | amber | blue | violet | neutral`), `icon`
   (enum bounded by a single `ICON_SET` const that is the one source of truth
   for both the Zod enum and the Lucide registry). A `quickChips` field holds
   suggested values.

2. **Visual intent is presentation-only.** It never changes field keys,
   targets, or verdict arithmetic. `events.verdict` paths are untouched; this
   invariant is asserted by test.

3. **Safeguards are pure, shared functions:**
   - `deriveChips(field)` for deterministic migration inference; guards
     against zero / negative / fractional / non-finite targets.
   - `sanitizeChips(candidate, field)` for any model-provided chips: dedupe,
     sort, clamp to bounds, integer bounds for count regimes.
   - `resolveIcon(name)` with a neutral fallback; unknown icons downgrade
     gracefully, never crash. Applied at upgrader, load-time parse, and render.
   - Chip taps are suggestions only; invariants/verdict run on final saved
     value regardless of provenance.

4. **Full product-wide migration, not a demo patch.** All stored manifests are
   upgraded through a versioned `ManifestUpgrader` chain (`vN → v5`), idempotent
   and reversible, executed as **lazy-upgrade on schema read** plus an explicit
   `npm run migrate` backfill with dry-run, row counts, and a failure report.
   Deterministic inference rules: sole cash/currency metric → `hero`; primitive
   → accent (cash → emerald, digital → blue, variance → amber); `target` →
   `deriveChips`.

5. **Lossless regeneration fix:** the builder now persists `userPrompt` into
   `config` at build time so artifacts can be regenerated for all workflows
   without degrading to title-only reconstruction.

6. **One design system across all surfaces.** `src/components/ds/` provides the
   tokens-driven primitives (`HeroStatInput`, `QuickChipInput`, `StatusPill`,
   `Masthead`); ListForm/GridForm/personal mode and verdict/report/dashboard
   all render through it. Hero inputs use `inputMode="decimal"`; chips sit
   above the display in a vertical stack; submit is a sticky bottom bar with
   safe-area insets and `dvh` handling — no fixed mid-layout elements the soft
   keyboard can obscure.

7. **Artifact prompt is product content**, versioned and upgraded to the same
   visual language; artifacts already receive the full manifest in-context, so
   V5 decorators flow in for free.

## Alternatives Considered

- **Additive defaults only (no migration).** Rejected: old manifests would
  render defaulted forever without real visual intent; doesn't satisfy the
  no-quick-fix charter.
- **Migrate only the curated demo apps.** Rejected: demo-first, violates the
  product charter.
- **Free-form HTML as the only path (Canvas-style for everything).** Rejected:
  keeps the typed path as the correctness/verdict backbone; artifacts stay as
  the sandboxed presentation sibling.
- **Insert `visual` into an existing block vs. new block.** New top-level
  field-level block chosen: keeps decorators separate from compute-affecting
  blocks (`logic`, `intelligence`, `schedule`).

## Consequences

- **Positive:** one expressive vocabulary both renderers honor; deterministic
  presentation; artifact and native paths converge on the same design
  language; all 225 rows converge without silent rewrites; regeneration
  becomes lossless.
- **Negative/rollback:** migration is data transformation on JSONB — rollback
  is a reversible upgrader mapping (v5 → v4) that strips `visual`/`quickChips`
  keys. Lazy-upgrade means a read-time upgrade happens on every read until the
  backfill runs; the upgrader must be idempotent and report on each run.
- **Risk:** model-provided chips/icons must be sanitized at every boundary
  (upgrader, load parse, render). Handled by the pure functions above and
  tested table-driven.

## Open Items

- Real-device keyboard/ui pass (P7) — hero + chips tappable with keyboard open.
- `userPrompt` persistence column/backfill for the 225 existing rows happens in
  the migration step (P3).