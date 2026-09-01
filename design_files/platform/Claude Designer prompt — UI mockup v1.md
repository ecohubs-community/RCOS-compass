---
status: prompt for Claude Designer
relates_to: UI Spec — v0.1 (draft).md
date: 2026-08-31
note: paste the block below into Claude Designer. Demo community "Valle Verde" is fictional
  — deliberately not Fruit Haven, so invented numbers never get attributed to a real partner.
---

Design a web app UI for **RCOS Compass** — a tool that helps intentional communities
(5–150 people, place-based or online) apply RCOS, an open governance standard with 7 layers,
21 mandatory artifacts and 213 numbered clauses. The app turns that wall of obligations into
a short ordered list of things the community still has to decide, and keeps what they decided
findable and attributable. It never decides for them.

Desktop web, 1440×900 artboards. Single dark theme only — no light mode, no theme toggle.

## Visual system

Neutral near-black greys, one emerald accent, calm and dense like Linear or Height — not a
consumer SaaS marketing look. No gradients, no glassmorphism, no drop shadows beyond a 1px
border and the occasional subtle elevation. Flat surfaces, hairline borders, generous
whitespace inside cards but compact rows in lists.

- bg `#0E1011` · surface `#16191A` · raised `#1D2122` · border `#262B2C` · border-strong `#3A4142`
- text `#E8EAE9` · secondary `#9BA3A1` · muted `#6B7574`
- accent emerald `#059669`, hover `#047857`, subtle fill `rgba(5,150,105,0.12)`, deep `#064E3B`
- amber `#D97706` (attention) · blue `#3E82C4` (in vote / info) · red `#DC5B4A` (destructive only)
- Inter or system UI. 13px body, 12px meta, 15/18/24px headings. Numbers tabular.
- Radius 6px, 8px on cards. 1px borders everywhere. Icons: thin line, 16px.

## Status vocabulary (use consistently on every screen)

Small pill chips, 11px uppercase-ish, dot + label:
`Not started` grey · `Drafting` slate · `In discussion` amber · `In vote` blue ·
`Adopted` emerald · `Needs review` amber outline.
Two modifiers that can sit on top: a dashed-outline **Provisional** badge, and a small
**AI-drafted** tag in muted text with a spark icon.

## App shell (all screens)

Left sidebar 240px, `#16191A`: community switcher at top (avatar + "Valle Verde" + chevron),
then nav — Dashboard · The Path · Standard · Definitions · Documents · Decisions · Artifacts ·
Glossary · Settings. Bottom of sidebar: a compact **Readiness 41%** bar and the user avatar.
Top bar 52px: breadcrumb left, a global search field centre-left ("Search decisions, clauses,
definitions…"), and a "New discussion" button right.

Fictional demo community: **Valle Verde**, 27 members, Ecuador, founded 2021, adopting RCOS
since March. Use it consistently across all artboards.

## Artboards

**1 — Dashboard.** Four blocks, not a stats wall.
(a) Readiness: seven slim horizontal bars, one per layer (Layer 0 Identity & Scope 100%,
1 Membership 62%, 2 Governance 45%, 3 Economy 20%, 4 Conflict 0%, 5 Operations 33%,
6 Evolution 0%) and one line under it: "14 of 21 artifacts complete."
(b) **Your next 5** — the hero block. Five rows, each a plain-language question, not clause
text: "Can someone leave at any time — and what happens to their things?", "Who can spend
community money, and up to how much?", "What happens when someone stops showing up?" Each row
has a layer tag, an effort tag (`one conversation` / `one meeting` / `a series`) and a
"Start discussion" ghost button on hover.
(c) **Needs attention** — 3 items: 2 definitions past review date, 4 provisional definitions
awaiting ratification, 1 discussion stalled 12 days.
(d) **Recently decided** — last 5 decisions, one line each: `DEC-2026-014 · Probation period ·
adopted 12 Jun by consent, 9 of 11 present`.

**2 — Standard browser.** The RCOS spec, readable, with the community's status woven in.
Left rail: layer tree (0–6) with per-layer progress. Main: long scrollable list of definitions
grouped by artifact, each row = section name, the clause IDs it satisfies (`2.1.1–2.1.5`), a
status chip, and a last-changed date. Filter bar on top: status multiselect, MUST/SHOULD/MAY,
and a "show only gaps" toggle. This is the page you show a sceptical member.

**3 — Definition detail — the hero screen.** Three fixed columns, always the same triad:
*what the standard asks / what we said / how we got here.*
Header: `Probationary period` + `In discussion` chip + `Layer 1 · Membership` + clause IDs.
- Left column (300px, `#16191A`): "The requirement" — the verbatim RCOS clause in a slightly
  serif-ish or monospace-adjacent treatment so it reads as quoted law; below it "Why it
  matters" and "What NOT to define here", both collapsible.
- Centre (flexible, widest): the adopted version body with a version stamp `v2 · adopted
  2026-06-01`, then a visually distinct **In plain words** block (subtle emerald-tinted
  surface) with a one-paragraph practical translation. Under it: a **Definition linter**
  panel — three radio-style type chips (Enforceable / Interpretive / Expressive, Enforceable
  selected), then checks with icons: ✓ has a subject, ✓ has a process, ⚠ no consequence if
  criteria unmet, ⚠ vague word: "regularly". Buttons: `Start discussion`, `Propose change`.
- Right column (280px): "How we got here" — discussion count, current proposal draft,
  the decision record `DEC-2026-009` with mechanism, tally and review date; then Related
  definitions (3 links) and Evidence (`bylaws-2019.pdf p.4`).

**4 — The Path.** One ordered vertical list, numbered, drag handles visible on hover. Each item:
plain-language question, layer tag, effort tag, and a small "why this is here" reason line in
muted text ("your Decision Matrix references a Role Registry you haven't written yet").
Above the list, a collapsed-but-visible **Ordering rule** card showing four weighted sliders
(structural dependency, gap severity, risk profile, your own momentum) with an "edit · last
changed 3 Aug by Ana" line — the tool's opinion, out loud and editable.

**5 — Documents & mapping.** Split view. Left: an uploaded PDF page rendered with two passages
highlighted in emerald. Right: a stack of suggested mappings, each a card — the extracted
passage quoted, an arrow, the clause it maps to, a confidence hint, and three actions:
`Confirm`, `Change clause`, `Dismiss`. Above the stack, a summary banner:
"bylaws-2019.pdf — 23 passages found, 14 mapped to clauses. You already have language for
38 of 187 requirements." Confirmed cards collapse into a quiet emerald-bordered state with a
`Turn into definition →` link.

**6 — Discussion thread with Freeze modal.** A thread on clause 3.6 (exit & separation):
4 message bubbles from members with avatars and timestamps, then a visually distinct
**Proposal v3** block — emerald left border, "Proposal" label, the proposed text, and an action
row (`Support` `Object` `Suggest edit` `Freeze`). Also show a muted system row:
"Taken offline — meeting 14 Aug · summary added by Marco".
On top, the **Freeze** modal (centred, 520px): fields for decision type (Constitutional /
Strategic / Operational segmented control), mechanism, threshold, who was present, tally,
rationale, review date — plus a small amber notice: "Your Decision Matrix isn't adopted yet.
This will be recorded as **Provisional** and listed for ratification later."

**7 — Decision register.** Dense table: ID, title, type, layer, decided, review due, decided-by,
status. Rows show `DEC-2026-014 · Probation period · Strategic · Layer 1 · 12 Jun 2026 ·
Jun 2027 · consent, 9/11 · Active`. One row expanded inline showing rationale, the proposal
text as voted, related decisions and affected clauses. Above the table, the reverse-lookup
search styled as a real question box: "Can we spend €800 on the water pump?" with two result
chips below it pointing at a clause and a decision.

**8 — Public artifact index (outward-facing).** Simpler, wider, quieter — same dark palette but
more air, no sidebar. Community header, then the compliance state as a bordered statement:
**"Not yet RCOS-Core compliant — 4 mandatory artifacts missing"** with the four listed. Then a
table of published artifacts: name, layer, version, adopted date, link. Footer line: "RCOS-Core
v0.1 · last self-audit 1 Aug 2026". Important: **no percentage anywhere on this screen** — the
readiness number is for members only, the outward claim is binary.

## Rules

Realistic content everywhere — no lorem ipsum, no "Card title". Every number consistent across
artboards (41% readiness, 14 of 21 artifacts, 27 members). Nothing should look like a
compliance dashboard for auditors; it should look like a calm working tool a group of
27 people opens on a Tuesday evening.
