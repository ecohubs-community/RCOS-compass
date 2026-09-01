---
status: draft for discussion
version: 0.1
date: 2026-08-31
relates_to: ../design_files/platform/*.dc.html
---

# Component & Design-System Guidelines

The mockups in `design_files/platform/` are the visual source of truth. This
document is how that becomes a component system that stays coherent after the
fiftieth screen.

---

## 1. Three tiers, and nothing in between

| Tier | Location | May know about | Example |
|---|---|---|---|
| **Primitive** | `$lib/components/ui/` | Nothing about RCOS. Props in, events out. | `Button`, `Dialog`, `Select`, `Tooltip`, `Popover`, `Tabs`, `Field` |
| **Domain** | `$lib/components/rcos/` | RCOS vocabulary and types. No data access. | `StatusChip`, `ClauseRef`, `ReadinessBar`, `DefinitionCard`, `DecisionRow`, `LinterPanel`, `ProvisionalBadge`, `AiDraftedTag` |
| **Route-local** | `routes/**/_components/` | This one screen. | `FreezeModal`, `MappingStack`, `PathReorderList` |

Primitives are **thin wrappers around Bits UI**: Bits owns focus trapping, ARIA,
keyboard behaviour and portalling; we own the Tailwind classes and the variant
API. Do not restyle Bits UI inline at call sites — if a screen needs a new look,
it needs a new variant on the primitive.

Promotion is one-directional and deliberate: route-local → domain when a second
screen needs it; domain → primitive essentially never.

---

## 2. When to create a component

Create one when **any two** of these are true:

- it appears in two or more places (or will, per the mockups),
- it exceeds ~120 lines or three levels of nesting in its parent,
- it owns its own state machine (open/closed, draft/dirty, step 1..n),
- it has a non-trivial accessibility contract (a dialog, a listbox, a live region),
- it is the visual identity of a domain concept that must look identical everywhere
  (status chips, clause references, readiness bars — get these wrong in one place
  and the app looks untrustworthy).

**Do not create one** for: a wrapper that only forwards props, a single `<div>`
with classes, "the header of this page", or an abstraction over two things that
merely look alike today (a status chip and a confidence badge are not the same
component — they will diverge).

If you are unsure, inline it. A 200-line `+page.svelte` is easier to fix than a
premature hierarchy.

---

## 3. What a component may contain

- `let { … }: Props = $props()` with an exported `interface Props`. Every
  component's props are typed; no `any`, no untyped rest spread except an
  explicit `...rest: HTMLButtonAttributes`.
- `$state`, `$derived`, `$effect` (sparingly — `$effect` for DOM sync only, never
  to derive values).
- Snippets (`{#snippet}` / `{@render}`) for slot-like composition.
- A `class` prop merged **last** through `tailwind-merge`, so a caller can adjust
  spacing without a variant explosion.
- `aria-*` wiring and a documented keyboard contract for anything interactive.
- Its own loading and empty states when it renders a collection.

## 4. What a component must NOT contain

- **Data fetching.** No `fetch`, no `load`, no imports from `$lib/server/*`.
  A component that needs data takes it as a prop. This is enforced: `$lib/server`
  is unimportable from `.svelte` by convention and by an ESLint boundary rule.
- **Authorisation decisions.** Never `{#if user.role === 'steward'}` inside a
  component. The page passes `canFreeze={…}` computed server-side. Role checks in
  components drift from the server matrix, and the drift is a security bug.
- **Business rules.** Readiness percentages, compliance state, decision-ID
  formatting, clause satisfaction — all computed on the server and passed in.
- **Global store mutation.** There are exactly two app-level stores (toast queue,
  command-palette state) and only their own modules write to them.
- **`<style>` blocks** — see §5.
- **Hard-coded colours, spacing or font sizes.** Use the tokens.
- **`onMount` for layout measurement** where CSS can do it.

---

## 5. The styling rule

**Tailwind utilities only. No inline `style=`, no scoped `<style>`, no plain CSS
files beyond `app.css`.**

The three exceptions, each requiring a one-line comment saying which applies:

1. **A value that genuinely cannot be a class** — a computed bar width
   (`style="width:{pct}%"`), a CSS custom property set from data, a
   `transform` driven by drag position.
2. **Third-party or print surfaces** — overriding a PDF-viewer widget, `@media print`
   for the exported register, `@page` rules.
3. **Keyframes and complex selectors** Tailwind cannot express — these go in
   `app.css` under `@layer components`, not in a component.

`@apply` is banned outside `app.css`. Repeated class strings become a component
or a `tv()`/`cva`-style variant map, never an `@apply` alias.

### Tokens

Defined once in `app.css` with Tailwind 4's `@theme`, mirroring the mockup
palette. Components use the semantic name, never the hex:

```css
@theme {
  --color-bg: #0E1011;          --color-surface: #16191A;
  --color-raised: #1D2122;      --color-border: #262B2C;
  --color-border-strong: #3A4142;
  --color-fg: #E8EAE9;          --color-fg-secondary: #9BA3A1;
  --color-fg-muted: #6B7574;
  --color-accent: #059669;      --color-accent-hover: #047857;
  --color-accent-deep: #064E3B;
  --color-attention: #D97706;   --color-info: #3E82C4;  --color-danger: #DC5B4A;
  --radius-card: 8px;           --radius-control: 6px;
  --text-body: 13px; --text-meta: 12px;
}
```

Single dark theme for MVP, as the design prompt specifies — but every colour is a
token so a light theme or a high-contrast theme is a token file, not a rewrite.
**No component may reference a hex value.**

### Status vocabulary is a component, not a convention

`Not started · Drafting · In discussion · In vote · Adopted · Needs review`, plus
the two orthogonal modifiers `Provisional` (dashed outline) and `AI-drafted`
(muted, spark icon). One `<StatusChip status modifier />` renders all of them,
driven by a single exported map. If a new status appears in a mockup, it is added
to the map — never approximated at a call site.

---

## 5a. Explaining the product inside the product

This app asks people to learn a vocabulary — *definition*, *artifact*, *clause*,
*provisional*, *enforceable*, *transparency exception*, *readiness*. Most members
will never read a manual. So the explanation lives next to the thing.

**Rule: every term or control that is not self-evident to a first-time member
carries a `?` affordance.** Written down because it is the kind of thing that
gets skipped under deadline and then never added.

- One component, **`<HelpTip id="linter" />`**, renders the `?` and its content.
  It takes an id, never inline prose.
- **All help text lives in one registry** (`$lib/help/`, one entry per id,
  translated like any other string). Same term, same words, everywhere it
  appears — and a writer can review the whole vocabulary in one file.
- An entry is: one sentence of what it is, one of why it exists, and an optional
  link to the fuller explanation (the glossary panel, the standard browser, or a
  doc page).
- **Not hover-only.** It is a button: click or tap opens a popover, Escape and
  outside-click close it, focus returns. Hover may open it on pointer devices as
  a convenience, never as the only way in (§7 — the whole app works on a phone).
- The popover is `role="dialog"` with an accessible name, or a plain tooltip with
  `aria-describedby` for one-liners. Bits UI provides both; do not hand-roll.

Where they are required, at minimum: the **Definition linter** and each of its
checks; the three definition types (enforceable / interpretive / expressive);
**Readiness** vs **Compliance**; **Provisional** and the interim adoption rule;
**AI-drafted**; **Evidence** vs a definition; **Transparency exception**;
**Effort tags**; the Path's **ordering weights**; **Run self-audit**; the
`MUST / SHOULD / MAY` chips; and every status in the status vocabulary.

Two things a HelpTip must never be: an apology for a confusing label (fix the
label), or a place to hide information the screen needs anyway.

## 6. Accessibility contract

Non-negotiable, checked in review and by the a11y test pass:

- Every interactive element is reachable and operable by keyboard; visible focus
  ring on the accent colour at ≥3:1 against its background.
- Colour is never the only signal — status chips carry a label, the linter carries
  ✓/⚠ glyphs *and* text, the confidence hints carry words.
- Text contrast ≥4.5:1 for body, ≥3:1 for ≥18px. **Known issue from the mockups:**
  `--color-fg-muted` (#6B7574) on `--color-bg` is ~4.1:1 — acceptable at 13px+ but
  below AA for the 11px meta text it is used for in the sidebar and table footers.
  Either lift muted to ~#7C8685 or raise those sizes to 12px. Decide once, in tokens.
- Dialogs trap focus and restore it (Bits UI does this — do not hand-roll modals).
- Live regions announce freeze results, linter completion, and save failures.
- `prefers-reduced-motion` disables all transitions.
- Every icon-only button has an accessible name.

---

## 7. Responsive behaviour — the whole app works on a phone

The mockups are 1440×900 desktop artboards. That is the *reference* resolution,
not the supported one. **Every screen works on mobile, down to 375px.** Not a
reduced read-only version, not "core screens only" — a member can be handed a
phone and do the whole job: read the standard, draft a definition, run the
linter, discuss, respond to a consent round, freeze a decision, map a document
passage, publish.

A lot of real participation will happen on a phone in a kitchen, and a governance
tool that makes you go to a desk to take part quietly re-creates the access
asymmetry RCOS exists to remove. That is a product argument, not a technical one,
and it outranks the convenience of building desktop-first.

The tiers describe **optimisation, not availability**:

| Tier | Width | Character |
|---|---|---|
| **Mobile** | 375–767px | Single column, sheets instead of modals, tabs instead of columns, cards instead of tables. Everything reachable; some flows take more taps. |
| **Tablet / small laptop** | 768–1279px | Two columns where the content wants them; the sidebar collapses to an icon rail or a sheet. |
| **Desktop** | ≥1280px | The artboards as drawn, including the three-column definition view and side-by-side document mapping. |

Screen-by-screen decisions, so nobody has to invent them under deadline:

- **Definition detail** — the triad (*requirement / what we said / how we got
  here*) becomes **three tabs, not a vertical stack**. Stacking buries provenance
  three screens down and defeats the column's whole purpose. The tab bar is
  sticky; *what we said* is the default tab.
- **Documents & mapping** — the side-by-side becomes a two-step flow: the passage
  in context, then the suggested clause with confirm/change/dismiss. A
  swipe-through queue, not a split pane.
- **The Path** — drag handles are pointer-only. Touch gets explicit *move up /
  move down* controls and a "move to position…" action. Same ordering state, same
  publish flow, same audit entry.
- **Freeze modal and the setup interview** — full-height sheets with a sticky
  action bar, never a cramped centred dialog. The freeze form is long; it scrolls
  and remembers its place.
- **Decision register, definitions list, artifacts** — card rows below 768px,
  with the two most important fields visible and the rest on tap. **Never a
  horizontally scrolling table on a phone.**
- **Standard browser** — the layer tree becomes a sticky filter chip row.
- **Global search / reverse lookup** — full-screen overlay on mobile, results as
  a list. This is one of the most likely mobile uses (*"what did we decide about
  guests?"* mid-conversation), so it gets first-class treatment, not a squeezed
  desktop popover.
- **Long text editing** on mobile uses a plain textarea with the linter results
  below, not a floating panel.

Rules that follow:

- Touch targets ≥44px everywhere, not only in "read" screens.
- No hover-only affordances anywhere — the row actions that appear on hover in
  the artboards must be permanently visible or behind an explicit menu on touch.
- Test at **375 / 768 / 1024 / 1440** in the a11y and e2e passes, and run the
  full core-loop e2e spec at 375 as well as at 1440.
- `env(safe-area-inset-*)` respected on sticky bars.
- The public artifact index is mobile-first — it is the page most likely to be
  opened from a link on a phone by someone who is not a member.

## 8. Conventions

- **Files:** `PascalCase.svelte`. One component per file. Co-located
  `Component.types.ts` only when the types are shared.
- **Props:** required first, then optional, then `class`, then `children`. Booleans
  are positive (`disabled`, not `notEnabled`).
- **Events:** callback props (`onSelect`), not `createEventDispatcher`.
- **Icons:** one set, 16px, `stroke-width: 1.25`, `currentColor`, exported from
  `$lib/components/ui/icons`. Never paste an inline SVG into a screen.
- **A gallery route `/dev/components`** (dev-only) renders every primitive and
  domain component in all states. It is the review surface and the a11y test target.
- **Empty states are designed, not defaulted.** Every list component takes an
  `empty` snippet; the copy says what to do next, in the product's voice.
