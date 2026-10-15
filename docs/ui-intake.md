# UI & Design Resource Intake

Registry of external UI, motion, and design resources reviewed for adoption in
this product. Each resource is triaged, scored against the audit checklist, and
only enters the product when **the owner explicitly says "use this"** and its
adoption-gate row is green.

## How Intake Works

1. A link arrives from the owner.
2. It is triaged into a **bucket** (see below) and given a **verdict**.
3. A row is appended to the master table with the evidence: stack, license,
   extract method, notes, date.
4. Nothing is adopted automatically. Adoption is an explicit owner decision.

### Buckets

| Bucket | Meaning | Review depth |
| --- | --- | --- |
| **A — console-relevant** | Can inform the single-file vanilla artifact (CSS-only, agent skills, pattern/technique handbooks) | Full review |
| **B — wrapper-only** | React/Motion/Shadcn libraries that can only touch the Next.js wrapper surfaces, never the artifact | One-paragraph triage |
| **C — inspiration** | Catalogs, demos, and backlogs of patterns; reimplementation on adoption | Itemized as references |

### Verdict Vocabulary

| Verdict | Meaning |
| --- | --- |
| **Skip** | Will not use. Reason recorded (legal, taste, architecture). |
| **Watch** | Legal and interesting, but not worth adopting yet. Revisit if the chassis changes. |
| **Reference** | Mine for patterns; reimplement by hand when a need appears. No dependency. |
| **Adopt-technique** | Adopt a named interaction/technique, hand-rolled in our own tokens. Source code is never vendored. |
| **Adopt-toolchain** | Adopt as working knowledge/tooling for the build process (e.g. agent skills). |
| **Adopt** | Full adoption, gated below. |

## Architecture Context (why buckets exist)

The product ships two kinds of surface:

- **The artifact** — each generated app is a **single-file, vanilla, no-build
  console**. It cannot carry React, Tailwind, a bundler, or a motion runtime.
  Anything that must survive on a cheap staff phone has to be hand-rolled CSS
  driven by our own tokens.
- **The wrapper** — the Next.js app around the artifact (gallery, setup surface,
  owner views). React/Tailwind live here, and shadcn-installable libraries are
  technically at home.

This is why the same library can be a hard **Skip** for the artifact and a
harmless **Watch** for the wrapper. The bucket is the fit axis; the verdict is
the decision.

## License Baseline

Only these license shapes are safe to ship from, with no further legal review:

- **MIT / Apache-2.0 / BSD / ISC** — permissive. Apache-2.0 adds NOTICE
  retention and a patent grant; keep license headers on anything copied.
- **Unstated / no LICENSE file** — treated as **all rights reserved**. We may
  read the site for ideas and reimplement patterns independently, but never
  copy code, snippets, or assets from it.
- **Source-available with a commercial restriction** (Commons Clause, "no
  resale", "free for non-commercial") — **Skip for product code.** Modifying
  the source does not change the license; permission comes from the license.
- **Aggregation libraries** (a repo whose components derive from other projects)
  — the repo's own license covers only its own code. Each component's upstream
  license governs that component, so provenance is verified **per component**
  before any copy.

## Audit Checklist

Every row is scored against all six criteria. The owner calls the consolidated
audit; it re-evaluates every row fresh and updates verdicts.

| # | Criterion | Question | Fail condition |
| --- | --- | --- | --- |
| 1 | **License safety** | Can we ship this, with what attribution? | Any non-commercial or no-resale clause; unstated license if code would be copied; unverified provenance in an aggregation library |
| 2 | **Console-path fit** | Can this enter the single-file vanilla artifact? | Requires a runtime the artifact cannot carry (React, Tailwind build, Framer/Motion) |
| 3 | **Wrapper fit** | Is it worth touching the Next.js surfaces for? | Consumer-flash stock with no bearing on gallery/setup/owner views |
| 4 | **Doctrine fit** | Does it serve judgment over volume on cheap phones? | Consumer glitz, dashboard-trap aesthetic, or patterns that inflate the front door. Anchored to the five tests in `docs/00-vision-and-mindset.md` and its anti-pattern list |
| 5 | **Maintenance risk** | Will it still be maintained and legible in a year? | Abandoned, single-commit, or unclear upgrade path |
| 6 | **Extract method** | Pattern reimplemented with our tokens, or vendored code? | Only usable by vendoring the library's own code into the product |

## Adoption Gate

Before any resource enters the product, its row must be **green on all four**:

- [ ] **License cleared** — permissive, and attribution/NOTICE obligations recorded.
- [ ] **Extraction is clean** — we ship our own hand-rolled implementation (or
      adopt knowledge/tooling), never the library's code.
- [ ] **Doctrine pass** — serves an operator outcome, not a visual effect in
      isolation; survives the cheap-phone gate.
- [ ] **Owner decision** — the owner explicitly says "use this".

**No row adopts itself.** A green checklist is eligibility, not authorization.

## Master Table

| # | Resource | Stack | License | Bucket | Verdict | Extract method | Reviewed | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | [rare-ui](https://rare-ui.com) | React + Motion | MIT + **Commons Clause** + attribution | B | **Skip** | — | 2026-09-24 | Restricts selling/redistributing components "alone, in a bundle, or as a ported version". Attribution survives modification. Legal blocker is decisive. |
| 2 | [ObsidianUI](https://gitlab.com/Atharvsinh-codez/obsidianui) | React + Tailwind | MIT | B | **Watch** | Reference only | 2026-09-24 | ~1 week old at review, immature. Aesthetic reference if the wrapper needs a different register. |
| 3 | [designspells.com](https://designspells.com) | Inspiration catalog | n/a | C | **Reference** | Reimplement patterns | 2026-09-24 | Not code. Useful as a curated micro-interaction backlog (success check, error shake, long-press). |
| 4 | [transitions.dev](https://transitions.dev) | Vanilla CSS + agent skills | **Unstated** | A | **Adopt-technique** | Hand-rolled in our tokens | 2026-09-24 | No LICENSE file ⇒ all rights reserved. Read the patterns, write our own CSS. Fits the vanilla chassis doctrine exactly. Pro tier is paid/commercial. |
| 5 | [easyui](https://github.com/Surajmaurya1/easyui) | React 19 + Tailwind + Framer Motion | MIT | B | **Skip** | — | 2026-09-24 | License clean, but consumer-app polish is off-brand and the Motion runtime cannot enter the artifact. Immature (14 stars at review). |
| 6 | [emilkowalski/skills](https://github.com/emilkowalski/skills) | Agent skills (knowledge, not components) | MIT | A | **Adopt-toolchain** | Snapshot relevant SKILL.md files to `.opencode/skills/` | 2026-09-24 | Recommended. `mobile-native` as a permanent cheap-phone pre-ship gate; `animate`, `review-animations`, `animation-vocabulary`, `find-animation-opportunities`, `improve-animations`, `pick-ui-library` for the chassis craft pass. Caveat: consumer-app taste must stay under our doctrine. Local `prototype` skill already exists — redundant. |
| 7 | [spectrum-ui](https://github.com/arihantcodes/spectrum-ui) | React + shadcn + Tailwind + Motion + Radix | Apache-2.0 (**verify per-component upstream**) | B | **Watch** | Reference only | 2026-09-24 | 250+ components, shadcn-ready, active (440 commits), 1.4k stars. An aggregation ("built using Aceternity UI, Magic UI and ShadCN") so per-component provenance governs. Animated consumer stock. Its MCP-server install flow is a notable agent-native pattern. |
| 8 | [uselayouts](https://github.com/iurvish/uselayouts) | React + Framer Motion + Tailwind | MIT | B | **Watch** | Reimplement patterns | 2026-09-24 | Micro-interaction concept is the right instinct; the 3D-flourish execution is the wrong flavor for a factory floor. 550 stars, 358 commits, single author. Pattern fodder for the chassis craft pass, not a dependency. |

## Cluster Note

Items 2, 5, 7, and 8 are one cluster: *permissive, copy-paste, animated React
components on Framer Motion, shadcn registry*. For this product they are
interchangeable — none can touch the artifact, and their only value is
inspiration for hand-rolled chassis micro-interactions. Reviews for this cluster
stay one paragraph each unless a resource is exceptional.

The scarce resource in the intake list is not components. It is **taste and
technique** for a vanilla, cheap-phone console (items 3, 4, 6).

## Audit Log

Consolidated audits run on owner request. Each pass re-evaluates every row
against the six criteria and records verdict changes here.

| Audit date | Scope | Rows re-evaluated | Verdict changes | Notes |
| --- | --- | --- | --- | --- |
| — | — | — | — | No audit run yet. |
