# IMS — Whole-App Review & Modernization Plan

**Status:** Approved scope / executable roadmap
**Date:** 2026-09-09
**Owner:** Product & Architecture
**Predecessors (extend, do not duplicate):** `modal-design-spec.md`,
`module-dependencies.md`, `ims-core-and-modules.md`, `ims-optimization-plan.md`.

## 0. Why this plan exists
A full review of the app across four core commitments plus one deliverable that
enables AI-assisted contribution going forward:

1. **Clean the codebase** — remove dead/stale code, and recycle/reuse by wrapping
   as much as possible into reusable functions.
2. **IMS-first, modules second** — the app must read and behave as an Inventory
   Management System core, with industry-specific modules as a clearly-labeled
   secondary, opt-in layer.
3. **Clear, clean, modern UI** — enforced system-wide styling, including
   **modal cleanliness & consistency** as a first-class requirement.
4. **Modules have a clear disconnect from one another** — hard, verified
   independence so turning any module off (or on) never affects core or another
   module.
5. **Deliverable — AI-onboarding doc** (Track 4): a comprehensive markdown doc
   for AI ingestion covering purpose, how it functions, existing functionality,
   proposed new functionality, file structure, and data structure.

Every change ships small, gated (`npm run check` + `npm test`), one commit.

---

## 1. Current state (verified 2026-09-09)

- Real deliverable is the static SPA at `wwwroot/ims-prototype/`
  (git remote `ims-prototype`): ~8.1k JS lines (`data → metadata → store →
  common → grid → router` + 17 page files), ~1.9k CSS lines across
  `styles.css / shared.css / dashboard.css`, one `index.html` shell, **16 views**.
- Core vs module IA is scaffolded (Phase B): core views + a Config page toggling
  modules with a manifest, gating, and dependency validation. Persistence runs
  through typed repos behind a JSON/`apiAdapter` seam (Phase A). Modals were
  restyled to a spec (Phase C). Column profiles (`grid.js`) and a metadata
  registry with multi-vertical `extended_attributes` (Tracks A/B) are in.
- Test harness exists: `npm run check` + `npm test` (jsdom `test/gate.js`).

### Known cleanup targets found in this review
- **`handoff.js` vs `handoff-wiz.js` shadowing** — `handoff.js`
  `openNewRentalModal`/`createRentalFromModal` are the old modal flow, shadowed
  by `handoff-wiz.js` `openNewRentalModal` (loaded after). Heavy overlap; the
  legacy path is dead.
- **ASP.NET Razor scaffold** (`Pages/`, `Pages/Shared/`, default `Index`/
  `Privacy`) is stock .NET template — the real UI is static. Decide: strip to a
  clean static host, or keep as the future API host.
- **CSS overlap** — `styles.css`/`shared.css`/`dashboard.css` need a de-dup and
  token audit; confirm `dashboard.css` even needs separate loading.
- Likely unused helpers / seed data and remaining inline `style=` → confirmed by
  the 1.0 scan below.

---

## 2. Review operating model
- **Review unit = a file/layer**, each run through a fixed checklist with a gate.
- Maintain two living artifacts in `docs/`:
  - **Audit matrix** (`docs/architecture/app-review-audit.md`): one row per
    file/layer → status, dead code found, reuse opportunity, modal/UI notes.
  - **File review checklist** (template below) reused on every unit.
- Sequence: **Audit (2.0) → AI-onboarding doc (T4) → Clean/Reuse (T1) →
  IMS-first + module disconnect (T2) → UI/modern + modal pass (T3) → full
  regression & doc refresh.**

### File review checklist (run on every JS/CSS/page file)
1. No shadowed/overridden/unreachable functions (dead code).
2. No duplicated logic that belongs in `common.js`/`grid.js`/a shared builder.
3. No inline `style=` where a class or token expresses intent.
4. Reads core-first: no core view reaching into a module's data or helpers.
5. No module writes another module's data directly (clear disconnect).
6. Any modal it owns conforms to `modal-design-spec.md` (visual + behavior).
7. Renders + saves under the jsdom gate with the module toggled off and on.

---

## 3. Track 1 — Clean: dead/stale code + reuse

### 1.0 Audit inventory (no behavior change)
- Deepen the code map per file: list every top-level function and its callers.
- Dead-code scan: unused/shadowed funcs, unreferenced helpers, orphan seed data
  and repo methods.
- Duplicate scan: repeated modal/button/column/movement/field patterns across
  page files (report into the audit matrix).

### 1.1 Dead code removal (concrete)
- **`handoff.js` × `handoff-wiz.js`**: reconcile; delete the shadowed
  `openNewRentalModal`/`createRentalFromModal` legacy path; hoist any still-needed
  helpers to `common.js` or keep in the wizard. Gate the "New Order / Check-Out"
  flow after.
- Remove unused helpers/columns/settings/repos surfaced by 1.0.

### 1.2 Stale scaffold decision (owner call)
- Option A — strip `Pages/`, reduce `Program.cs` to clean static hosting of the
  SPA at root.
- Option B — keep ASP.NET as the future backend and begin the `apiAdapter`
  server contract.
- Either way, delete the default "Welcome to ASP.NET" Index/Privacy content.

### 1.3 Recycle → reusable functions
- Centralize repeated markup into shared builders (`common.js`/`grid.js`):
  action-button-row builder, status `<select>` options, vertical-extended
  column/field helpers, receiving-log flow, empty-state markup, badge variants.
- Collapse near-identical grids (bulk/consumable/parts/attachment already share a
  shape) behind `grid.js` column profiles.
- Consolidate duplicated date/money/format/accessor helpers to one set.

### 1.4 CSS de-dup + tokens
- Merge `shared.css`/`dashboard.css` into one token-driven system; single source
  for radii/shadows/spacing/type/status colors; drop unused selectors.

**Gate:** `npm run check` + `npm test` + manual smoke of all 16 views.

---

## 4. Track 2 — IMS-first, and hard module disconnect

### 2.0 Verification audit (disconnect is the bar)
Re-run the impact map in `module-dependencies.md` against actual code and prove,
not just claim, these rules:
- A module may depend only on **core** or a module **declared in `requires[]`**
  (all modules are currently core-only — preserve that cleanest state).
- **No module reads or writes another module's tables/state**; modules only reach
  core data via the registry/repos.
- **Core never references a module** (no core → module coupling).
Record every violation in the audit matrix; fix or quarantine each.

### 2.1 Core-first IA & copy
- Regroup nav into **Core** (Operations Dashboard, Items & Stock, Parties &
  Orders, Item Hand-Off/Custody, Receiving & Locations, Categories) vs an
  explicit **Industry Modules** group (Allocations, Dispatch, Telemetry, Labor,
  Field Service, Rentals, Billing) + Administration.
- Default/landing view = a core view.

### 2.2 Declarative module registry
- Collapse `RENDER/TITLES/DESCRIPTIONS/MODULE_META` + `MODULE_VIEW` + nav groups
  into one registration object consumed uniformly by router, nav, Config, and
  badge/notification gating. Adding a module becomes one declarative entry
  (route, label, meta, module key, requires[], owned tables).

### 2.3 Module-off proofs baked into the gate
- Extend `test/gate.js` with an automated suite: for each module, toggle off →
  assert every core view renders with graceful empty states and no orphaned
  module UI; toggle on → full view suite still passes. This makes the disconnect
  guarantee a regression test, not a one-off manual check.

### 2.4 Vocabulary purity
- Sweep core copy/data for last rental-specific terms; core should read purely as
  order/party/item/movement/location/inventory with module language quarantined.

**Gate:** new "module-off → core OK" assertions added to `gate.js` and green.

---

## 5. Track 3 — Clear, clean, modern UI (incl. modal pass)

### 3.0 UI audit
- Inline-`style=` scan (verify Phase C's claim; remove remaining).
- Design-token coverage; empty/loading/focus/disabled states; contrast; responsive
  at 320/768/1200px. Per-view/component findings → audit matrix.

### 3.1 Enforce tokens + utilities
- Build on the existing CSS-variable theme: one type scale, spacing scale,
  component tokens; light/dark; drop stray `font-size`/`margin` hints for
  utilities (`text-xs`/`text-xs2`/`text-12`, `mt-*`).

### 3.2 Shell & navigation
- Modernize sidebar/topbar to visually separate Core vs Industry Modules; clear
  active states; consistent empty/error/no-data states.

### 3.3 Component consistency
- One look for buttons/forms/badges/tables via `shared.css`; optional component
  gallery page for QA.

### 3.4 Modal cleanliness & consistency (deep pass — required)
Goal: **every** modal is both clean *and* identical in structure/behavior —
extend, don't duplicate, `modal-design-spec.md`. Verification is visual **and**
mechanical.

- **3.4.1 Consistency contract (codify in the spec):**
  - Same header anatomy (icon + 800-weight title + `X`), footer anatomy
    (primary right `.btn-ims`, secondary/outline left, Cancel/Close present),
    body internal-scroll so footers pin.
  - Same field rhythm: 12px label above aligned full-width inputs; long forms
    grouped via `.divider` section heads.
  - Same a11y contract: `role="dialog"`/`aria-modal`, labelled title id, Escape
    closes, first field/control focused on open, visible focus ring.
- **3.4.2 Machine-checkable rules** added to the lint/gate:
  - No modal emits inline `style=`; every footer has the standard primary +
    secondary action classes; every dialog carries `role="dialog"` +
    `aria-modal`.
- **3.4.3 Visual inventory sweep:** open every modal in the `modal-design-spec.md`
  inventory against the checklist (opens centered/right size, header/body/footer
  anatomy, no horizontal page shift, actions work open/close/save). Already
  conforming modals get a visual re-check, not a rewrite.

### 3.5 Final visual QA + accessibility pass across all 16 views and every modal.

**Gate:** visual + a11y checklist + new modal-contract lint assertions +
full `npm test`.

---

## 6. Track 4 — AI-onboarding markdown document

### 6.0 Goal
Author one **comprehensive, self-contained markdown document** whose primary job
is fast, low-noise AI ingestion: a fresh agent (or a human) should load it and
understand what the app is, how it works, what exists today, what is proposed,
and how files and data are laid out — without having to read every source file.

### 6.1 Output artifact
A single canonical doc, e.g.
`wwwroot/ims-prototype/docs/AI-ONBOARDING.md` (linked from the README and from
`next-session-seed.md`). Keep it current whenever the codebase changes — a doc
that drifts from the code defeats its purpose.

### 6.2 Required sections
1. **Purpose** — what the product is (an IMS-first suite with opt-in industry
   modules), who it serves, and the "core inventory engine, not rental" thesis.
2. **How it functions** — the runtime story: static SPA shell → script load order
   → `data → metadata → store → common → grid → router → pages`; how views render
   into `#content`, how state persists (repos → JSON/localStorage/`apiAdapter`),
   how modules are toggled/gated, and how the sim loops work.
3. **Existing functionality** — the 16 views grouped core vs modules, what each
   does, plus cross-cutting systems (grid/column profiles, metadata +
   `extended_attributes`, modals, notifications/search/badges, Config).
4. **Proposed new functionality** — the roadmap in this plan and its sibling docs:
   cleanup/reuse targets (T1), IMS-first + module-disconnect hardening (T2),
   UI/modern + modal consistency pass (T3), and any tracked future work.
5. **File structure** — tree + one-line purpose per file/dir (the JS load order,
   CSS files, `index.html`, docs, and the `test/` gate harness).
6. **Data structure** — the `IMS` global object: every table/collection, its
   fields, the typed item registry, `extended_attributes`, `settings`, and the
   repo/persistence contract (`store.js`), so an agent knows where to read/write.

### 6.3 Ingestion friendliness rules
- Written for a reader with **zero prior context**; no reliance on tribal
  knowledge.
- Concrete identifiers (exact table keys, function names, route ids) over vague
  prose; include a short worked example (e.g., the read/write path for one item).
- Section numbering + a small TOC; each section scannable in isolation.
- Reference the deeper architecture docs by filename rather than restating them,
  but keep the six required sections **self-sufficient** at a summary level.
- Note the invariants an agent must preserve (core never touches a module;
  JSON-only state; no DOM-backed state; no alias layer) and the test gates to run
  (`npm run check`, `npm test`).

### 6.4 Gate
Doc exists, is linked from the README, is factually consistent with the current
source, and covers all six required sections. Treated as **living** — updated in
the same commit as any behavioral change it describes.

---

## 7. Sequencing & cadence
1. Freeze this plan.
2. Run **1.0 audit** → publish `app-review-audit.md` (the "review the whole app"
   backbone: one row per file/layer with dead-code, reuse, module-disconnect, and
   UI/modal findings).
3. Author **Track 4 — `AI-ONBOARDING.md`** while the codebase is still
   unrefactored, so cleanup (T1) can be measured against an accurate baseline and
   an AI agent can contribute from the start.
4. Execute **T1** file-by-file (dead code → reuse → gate). Start with the
   `handoff.js`/`handoff-wiz.js` shadow and the scaffold decision.
5. Execute **T2**: disconnect verification, registry refactor, module-off gate
   proofs.
6. Execute **T3**: shell/component/token modernization, then the **3.4 modal
   consistency pass** with machine-checkable rules.
7. Full regression; refresh `README.md`, `next-session-seed.md`, the audit
   matrix, and **keep `AI-ONBOARDING.md` in sync** with the finished state.

## 8. Non-negotiables (unchanged)
- Core owns shared data/helpers; modules consume only core or declared deps.
- JSON is the only data shape; no DOM-backed state.
- Every change ships gated (syntax + jsdom view/modal suite + module-off proofs).
- No alias layer — names are the real domain terms.
