---
status: draft for discussion
version: 0.4
date: 2026-08-31
changelog: |
  v0.4 — mobile is a supported surface for every screen; consent rounds confirmed in MVP;
  §1.4a defines "adopted" mechanically; linter cross-community statistic cut from the MVP;
  licence, hosting, plans and product name settled (docs/10-legal-and-operations.md).
  v0.3 — engineering specs split out into docs/ (stack, server-client contract, component
  system, data model, security, admin console, testing, roadmap); two review passes recorded
  in docs/07-spec-review-log.md; platform admin console added (§11); clause-ID scheme,
  definition/clause cardinality and the readiness arithmetic resolved; MVP scope amended
  (§6) with the items the review found missing.
  v0.2 — definition atom refined to template-section level; readiness/compliance split
  resolved (inward %, outward binary); visibility model added; Path ordering made a visible
  config object; storage decision + FOKS assessment added; content-build estimate revised
  down now that rcos.ecohubs.community templates exist
relates_to: RCOS Core Specification — v0.1.md; Writing Good Definitions — Enforceable,
  Interpretive, Expressive.md (kept in Notion and the EcoHubs vault; implemented as
  docs/11-definition-linter.md);
  docs/00-architecture.md … docs/10-legal-and-operations.md
---

# RCOS Compass — product spec v0.4

**One line:** a tool that turns the 213 numbered clauses of RCOS-Core into a
short, ordered list of things *this* community still has to decide — and then
keeps what they decided findable, alive, and attributable.

**Audience:** existing or forming communities, online or place-based, 5–150 people.
**Non-goal:** making decisions for them.

**This document is the product spec.** The engineering specs it now depends on
live in `docs/`:

| | |
|---|---|
| `00-architecture.md` | tech stack, project shape, multi-tenancy, AI provider abstraction, config |
| `01-server-client-contract.md` | how data moves between server and browser |
| `02-component-guidelines.md` | when to make a component, what it may contain, the Tailwind-only rule |
| `03-data-model.md` | schema, IDs, state machines, **the exact readiness/compliance arithmetic** |
| `04-security.md` | permission matrix, tenant isolation, untrusted documents and AI |
| `05-admin-console.md` | platform admin (see §11) |
| `06-testing-strategy.md` | test environments, the nothing-ships-untested rule, what gets tested |
| `07-spec-review-log.md` | the two review passes and every finding's resolution |
| `08-roadmap-mvp.md` | the path from here to a pilot |
| `09-standards-versions-modules.md` | core vs modules, version pinning, guided migration between standard versions |
| `10-legal-and-operations.md` | licence, hosting and data residency, controller/processor, plans |
| `11-definition-linter.md` | the linter's rule set — the implementable form of *Writing Good Definitions* |

---

## 0. The numbers we are designing against

From RCOS-Core v0.1, Layers 0–6:

| | |
|---|---|
| Numbered clauses (Layers 0–6) | 213 |
| Clauses containing a normative `MUST` | 185 |
| …of which a community actually answers | 173 |
| Template artifacts | 22 |
| Template sections — the definition atom | 118 (~93 clause-bearing) |
| Layers | 7 (0–6) |

Counted from the standard and the published templates on 2026-09-01, not
estimated. The earlier figure of 187 MUST clauses was slightly off, and more
importantly it counted 12 clauses **no community can answer** — *"Layer N
artifacts MUST be versioned and accessible to all members"* is satisfied by the
tool, and *"the following MUST remain optional and out of scope"* is a rule about
the standard. Counting those would put a ceiling on readiness that no community
could ever reach. Every one of these numbers is computed by the content pipeline
and printed at build time; none is hard-coded in the app.

That is the overwhelm problem, stated precisely. A community opening the spec
sees 213 obligations. The entire product is the answer to *"which three do we
do next, and what happened to the ones we already did?"*

---

## 1. Core design decisions

These five shape everything else. If any of them is wrong, the rest of the spec
is wrong too — worth arguing about before any UI is drawn.

### 1.1 The atom is a **Requirement → Definition** pair, not a document

Don't build a document editor. RCOS already ships a perfect checklist: every
numbered clause is a requirement. The community's answer to a clause is a
**Definition**. Everything else in the product falls out of this:

- **Compliance display** = status rolled up over clauses
- **Gap detection** = clauses with no definition — free, no AI needed
- **Prioritisation** = an ordering over open clauses
- **Help text** = the clause itself, shown in place
- **Export** = definitions rendered into artifact shape
- **Decision register** = one record per adoption of a definition

Communities do not "write a Purpose Charter." They answer 2.1.1 through 2.1.5,
and the Purpose Charter assembles itself.

**But the atom people *see* is one level coarser than the clause.** The 21
templates at rcos.ecohubs.community are already divided into sections (Purpose
Charter → Primary Purpose / Secondary Purposes / Non-Goals & Exclusions /
Conditions for Change), and each section covers a small group of clauses. That
section is the natural unit of discussion and adoption — a group decides
"our primary purpose", not "clause 2.1.3".

So, two levels:

- **Definition** = one template section. This is what gets discussed, drafted,
  linted, proposed, voted, frozen and versioned. Order of 60–80 of them, not 213.
- **Clause** = the compliance unit underneath. A definition satisfies N clauses;
  readiness and the binary compliance check compute at clause level.

This keeps the UI humane and the audit rigorous, and it means the template
structure you already published *is* the app's information architecture.

### 1.2 Artifacts are **views**, not files

The 21 mandatory artifacts (Purpose Charter, Decision Matrix, Role Registry, …)
are *rendered* from the definitions that feed them. An artifact page shows its
own completeness bar and links to the missing clauses. Nothing is authored at
artifact level. This is what makes export, publishing, and diffing cheap later.

### 1.3 Adoption is a **human act**, always

The hard line: **AI drafts, structures, questions, and maps. It never adopts.**
Concretely, three rules:

1. Any text an AI touched carries a visible `AI-drafted` mark until a human
   freeze removes it. Freezing is a person's action with a name and timestamp.
2. In facilitation/drafting mode the AI returns **two or three genuinely
   different options**, never one. A single AI proposal gets rubber-stamped;
   three divergent ones force the group to actually choose. This is the whole
   ballgame for "not replacing member decision-making."
3. The AI is allowed to say *"you have not decided this"* and *"this definition
   is not testable"*. It is not allowed to say *"here is your definition."*

### 1.4 Percentage inward, binary outward

Settled: the community absolutely should see a percentage — it is the whole
motivational engine of the product, and "you are 40% of the way there" is what
keeps a group going through 213 obligations. §10.1.1's binary rule governs the
*claim*, not the *dashboard*.

So both numbers exist, on the same screen, doing different jobs:

| | Where | What it says |
|---|---|---|
| **Readiness %** | inward: dashboard, layer pages, member views | momentum — how far along we are, per layer and overall |
| **Compliance: yes / no** | outward: public artifact index, any shareable page, any EcoHubs-side verification | the binary §10.1.1 state, with the exact list of what's missing |

**The one guard: the percentage must not be publishable as a compliance claim.**
The public artifact index and any export intended for outsiders show the binary
state and the gap list, never "73% compliant". If that number escapes into the
wild on community websites, the word "compliant" stops meaning anything and the
standard loses its only enforcement mechanism — its definition.

The arithmetic behind both numbers is now fixed (`docs/03-data-model.md` §7), because
the product's two headline claims cannot be narrative: **readiness** counts
satisfied `MUST` clauses over all `MUST` clauses, per layer and overall —
`SHOULD` and `MAY` are shown as separate counts and never enter the percentage,
so a community cannot raise its number by answering optional things.
**Compliance** is true only when every mandatory artifact is complete, no
`MUST`-satisfying definition is still provisional, and no clause is uncovered. A
definition past its review date keeps its clause satisfied but is named publicly.

Wording that keeps this clean: inward, the label is **Readiness**, never
"% compliant". Outward, **"Not yet RCOS-Core compliant — 4 mandatory artifacts
missing"** with the list. A community that reaches the binary state gets a
compliance statement page in the shape of Appendix C.5, and the claim is
withdrawn automatically if an adopted definition lapses (§10.3.4).

### 1.4a What "adopted" means, mechanically

The whole product rests on this word, and until now it was only described
narratively. The definition, in one sentence:

> **A definition is adopted when a named person has frozen one specific version
> through a recorded decision — mechanism, threshold, who was present, tally,
> date, rationale, review date. Nothing else adopts.**

Mechanically: `definition.adopted_version_id` points at a version that carries an
`adopted_at` and a `decision_id`. Exactly one version is adopted at a time;
adopting a new one supersedes the previous, which stays readable forever.

**Not adoption**, however far along it feels: writing a draft; everyone in a
thread pressing *Support*; a consent round closing with no objections; confirming
evidence from an uploaded document; importing text; an AI suggestion, however
good; the review date passing; a template being applied. Each of those may
*precede* adoption. None of them performs it.

Two consequences worth stating out loud:

- **A closed consent round with full consent is still not an adopted definition
  until someone freezes it.** That gap is deliberate. Somebody has to be
  accountable for the record, and "the system adopted it" is exactly the kind of
  authority-without-a-name RCOS exists to prevent.
- **Provisional adoption is still adoption** (§1.5) — recorded, attributed,
  countable toward readiness — but flagged, and it blocks the compliance claim
  until ratified.

### 1.4b Not everything a community decides is an RCOS clause

Real communities define things RCOS never asked about: quiet hours, guests, pets,
kitchen duty, how the WhatsApp group is used, what happens to the tools in
winter. Earlier work also surfaced genuine **gaps** in RCOS — things a community
needed to write down where the standard has nothing to say. If the app can only
hold answers to clauses, all of that lands in a Google Doc, and the register that
was supposed to be the single place you look becomes one of two places.

So a definition has a **scope**:

| Scope | What it answers | Counts toward readiness? |
|---|---|---|
| **Standard** | one section of RCOS-Core, or of an adopted module | yes (core only — §12.3) |
| **Local** | nothing in the standard. The community's own rule. | **no — in neither direction** |

**Local definitions get the whole machinery** — versions, discussions, proposals,
consent rounds, freeze, decision records, review dates, the linter, the glossary,
visibility, export, the register. They are just as binding for the people living
there as anything RCOS required, so treating them as second-class notes would be
both wrong and the reason people keep a second document.

What they never do is move a number. A local definition cannot raise readiness
(there is no clause to satisfy) and cannot lower it (it is not a gap). Compliance
ignores them entirely — the §10.1.1 claim is about RCOS-Core and nothing else.

**Three kinds, and they need separating.** Conflating them is the mistake to
avoid:

1. **Local rules** — RCOS never covered this and never will. Quiet hours. The
   common case.
2. **Local extensions** — the community wants to say *more* inside a section RCOS
   does define. RCOS asks for membership states; this community adds a
   *sabbatical* state with its own conditions. Attaches to the RCOS artifact, but
   is still scope `local` and still counts for nothing.
3. **Gaps in RCOS** — the community believes the standard *should* have asked for
   this. That is not a local rule; it is **feedback to the standard**, and it is
   how RCOS v0.2 gets written.

Kind 3 costs almost nothing and is worth a lot: when someone creates a local
definition, one checkbox — *"RCOS should require this"* — records a
`standard_feedback` entry with the community's own text as a worked example.
Nothing is sent anywhere without a deliberate act, and sharing it upstream is
opt-in. But the data is captured from day one, because you cannot retroactively
collect "what did communities wish the standard had asked for". RCOS §11.2 wants
this loop; this is the cheapest possible version of it.

**One safeguard.** A local definition must not contradict an adopted RCOS
definition or a Layer 0 invariant — §2.3.5 says invariants prevail. The app
cannot reliably detect a contradiction, so it does not pretend to: it requires
the local definition to declare its layer, shows the adopted definitions for that
layer alongside the draft, and the linter's AI-assist rules may flag an apparent
conflict *as a question*. Surfacing, never enforcement.

### 1.5 The bootstrap paradox needs a first-class mode

To adopt a definition *properly* you need a Decision Matrix (Layer 2). To adopt
a Decision Matrix you need a decision path. Every community hits this on day
one, and if the app has no answer they will fake it.

**Provisional mode:** on setup the community records an *interim adoption rule*
(e.g. "until the Decision Matrix is adopted, definitions are adopted by consent
of all current members in a recorded meeting"). Everything adopted under it is
flagged **Provisional**. Once the Decision Matrix is adopted, the app raises a
**ratification sweep**: a single list of all provisional definitions to
re-confirm through the now-proper path. Handled well, this is a trust feature.
Handled badly, it is the app's biggest integrity hole.

### 1.6 Visibility: three levels, community-controlled

Settled: **"public" means public *within the community* by default** — visible
to every member, private from no member. Publishing to the world is a decision
the community makes deliberately.

| Level | Default | Notes |
|---|---|---|
| **Member-visible** | ✅ default for everything | RCOS's baseline: artifacts accessible to all members (§2.5.2, §3.8.2, §5.5.2 …) |
| **World-public** | opt-in, per artifact or all-at-once | drives the public artifact index (§4.8); a governance decision, so it gets a decision record |
| **Restricted** | explicit exception only | requires a **Transparency Exception** record |

**Transparency Exception is a first-class object**, not a checkbox. §5.3.5
requires exceptions to be explicitly defined, justified, time-bounded, and to
still permit compliance auditing; the glossary already names the term. So the
app captures: what is restricted, who can see it, the justification, the expiry
date, and the decision that authorised it — and it *expires*, reverting to
member-visible unless renewed. This turns the one legitimate reason to hide
something into an auditable act rather than a silent permission setting.

Practical consequence: the default read path is member-authenticated, so
server-side rendering, search and AI features all work normally. Only the
world-public layer is anonymous. That matters for §2.3 below.

---

## 2. Platform: web-first, one codebase

**Recommendation: build a web app. One SvelteKit codebase. Ship a Docker image
so a community can self-host. Do not build a desktop app for MVP.**

Reasoning, and the honest version of the trade-off you named:

- The product is inherently **multi-user, multi-tenant, shared state** —
  discussions, proposals, votes, a shared register. That is a server. A desktop
  app would need the same server behind it, so it buys you nothing structural.
- The only real argument for a desktop app is **local AI / data never leaves
  the machine**. But you can get that without a desktop build: a self-hosted
  instance on the community's own box, with the AI endpoint configurable
  (OpenAI-compatible URL + key), pointed at a local Ollama. Same privacy story,
  one codebase, no second release pipeline.
- If a desktop wrapper is ever genuinely wanted, **Tauri wraps the same
  SvelteKit frontend** later. Building it *from the same source* is cheap
  *later*, and expensive *now* (offline sync, conflict resolution, auto-update,
  code signing, two support surfaces).
- Caveat on the browser→`localhost` AI path: browsers treat `http://localhost`
  as a secure context, but behaviour across browsers is not identical and it
  needs CORS on the Ollama side. For a privacy-first community, "run the whole
  thing on your own server" is the cleaner promise than "run the app in the
  cloud but the AI locally".

**Stack** (matches FairShare, so you build one muscle not two): OpenSpec for the
spec workflow, SvelteKit 2 / Svelte 5 runes, Tailwind 4, Bits UI, better-auth,
Drizzle + SQLite (Postgres post-MVP), Google AI Studio behind a provider
interface, Vitest + Playwright, Tauri post-MVP. Transactional email was added in
review — invitations and review-date nags are unshippable without it. Versions,
rationale and the rules that keep Postgres and Tauri cheap: `docs/00-architecture.md`.

**Multi-tenancy:** community = tenant; users belong to one or more communities
with a role per community (`owner`, `steward`, `member`, `observer`). Keep the
schema multi-tenant from day one even if the UI shows a single active community
(the FairShare lesson). Two rules the review added: the tenant is resolved from
the URL (`/c/[slug]/…`), never from a session claim, and the app role is strictly
separate from the RCOS membership state — `applicant`/`trial`/`full`/`exited` is
content the community governs and must never authorise anything
(`docs/04-security.md` §1–2).

---

## 3. Object model (light)

```
Standard          RCOS v0.1 as structured data (see §8) — versioned, shared, read-only
  Layer           0..6
  Clause          id "3.3.2", normativity MUST|SHOULD|MAY, text, plain-language
                  explanation, "what breaks without this", borders (what NOT to
                  define), feeds_artifact[], depends_on[]
  Artifact        21 mandatory + optional module artifacts
  GlossaryTerm    RCOS Appendix A entries

Community         tenant
  Member          user + role + membership state
  Definition      → clause_id, status, current_version
    Version       body, plain_language_mirror, type (enforceable|interpretive|
                  expressive), author, adopted_at, decision_id, ai_assisted flag
  Decision        DEC-2026-014 | type (constitutional|strategic|operational) |
                  domain (layer) | date | review_date | rationale | proposal body |
                  mechanism + threshold + tally | related_decisions[] |
                  affected_clauses[] | provisional? | supersedes
  Discussion      → clause_id or definition_id; posts; proposals; offline-summary
  Document        uploaded file + extracted passages
  Evidence        links a Document passage → a clause (the import bridge)
  ChangeLogEntry  append-only, per community
  LearningEntry   Layer 6 Learning Log
```

Two things worth being strict about early: **decision IDs are permanent and
human-quotable** (`DEC-2026-014`), and **the change log is append-only**.
Everything else can be refactored.

Three things the review had to settle before this could become a schema, all now
in `docs/03-data-model.md`:

- **Clause IDs.** The standard numbers clauses by document section (`3.3.2`); the
  mockups number them by layer (`1.2.5`). Canonical is the document section
  number, with the layer shown as a label and a stable slug key underneath so an
  RCOS v0.2 renumbering doesn't orphan a community's records.
- **Cardinality** (was open question §10.5): **one owning definition per clause**,
  plus non-owning cross-references. Exit rules are owned by Layer 1 and referenced
  by Layer 4.
- **Status is derived, not stored** — from (adopted version, open proposal, open
  discussion, review date). `Provisional` and `AI-drafted` are modifiers that sit
  alongside a status, never statuses themselves. The mockups' decision register
  needs its Status column split accordingly.

---

## 4. Screens

### 4.0 Three nouns, and what the navigation should call them

A fair question after looking at the mockups: *what is the difference between
Definitions and Decisions?* The guess — "definitions are work in progress,
decisions are the ones that passed" — is close but not right, and the gap matters
because the whole app is built on the distinction.

| | What it is | Lifecycle |
|---|---|---|
| **Definition** | What this community says about one template section. The **current rule**, in its own words. Not a draft — the adopted version is what governs. | Has versions; exactly one is adopted at a time |
| **Proposal** | A suggested *change* to a definition, living inside a discussion. | Draft → discussed → consent round → frozen or abandoned |
| **Decision** | The **record of the act** that adopted a version: who, by what mechanism, at what threshold, when, why. | Permanent, append-only, never edited |

So a Definition is not a proposal that passed; a Definition is the rule, and a
Decision is the receipt for how it became the rule. Renaming *Definitions* to
*Proposals* would break this: Proposal is already a distinct object in the freeze
flow, and merging the two would make the workflow incoherent.

**What is genuinely wrong is the grouping, not the words.** *Decisions* under
"Working on" reads as something you do, when it is an archive you consult.
Regrouped:

```
Working on        The Path · Discussions · Documents
What we've agreed Definitions · Artifacts · Decisions
Reference         Standard · Glossary
```

*Working on* is things in motion. *What we've agreed* is the community's own
material — the rules, the documents they assemble into, and the history of
agreeing to them. *Reference* is the standard itself and its vocabulary — the
things the community did not write.

Two supports, since a regrouping alone will not carry the distinction:

- **A one-line subtitle on every index page**, in the product's voice —
  *Definitions:* "What Valle Verde has actually said, in its own words."
  *Decisions:* "Every decision this community has recorded, and who was there."
  (The mockups already do this; it becomes a rule.)
- **`?` help affordances** on every non-obvious term
  (`docs/02-component-guidelines.md` §5a).

If usability testing still shows confusion, the cheap reversible move is to
change the **nav label only** — "Our definitions" — while the object keeps its
name in exports, the audit trail and the standard's own vocabulary. Do that only
with evidence.

**On screen size: the whole app works on a phone.** The artboards are 1440×900
because that is the reference resolution, not the supported one. Every screen
works down to 375px — reading, drafting, linting, discussing, responding to a
consent round, freezing a decision, mapping a passage, publishing. Not a reduced
read-only version.

A lot of real participation will happen on a phone in a kitchen. A governance
tool that makes you go to a desk to take part quietly re-creates the access
asymmetry RCOS exists to remove, and that argument outranks the convenience of
building desktop-first. Layout decisions per screen — the triad becomes tabs, the
mapping split becomes a two-step queue, tables become cards, drag becomes explicit
move controls — are in `docs/02-component-guidelines.md` §7.

### 4.1 Dashboard — "what's next"

Not a wall of statistics. Four blocks:

1. **Readiness** — 7 layer bars, one line: *"14 of 21 artifacts complete."*
2. **Your next 5** — the ordered open clauses (see §4.4). Each a one-line
   question in plain language, not clause text: *"Can someone leave at any
   time, and what happens to their stuff?"*
3. **Needs attention** — definitions past their review date, provisional
   definitions awaiting ratification, discussions stalled >N days, clauses
   affected by a new RCOS version.
4. **Recently decided** — last 5 decisions, one line each. This block is the
   anti-forgetting feature: decisions stay visible after they are made.

### 4.2 Standard browser — RCOS with your answers in it

The full spec, readable, with each clause carrying a status chip. Filters:
*unanswered / drafted / in discussion / in vote / adopted / needs review*, and
*MUST / SHOULD / MAY*. This is both the reference view and the audit view. It is
also the page you show a sceptical member: *"here is the standard, here is
exactly where we are."*

### 4.3 Definition detail — the workhorse screen

```
┌──────────────────────────────────────────────────────────────────────┐
│ 3.3.2  Probationary period            ● In discussion  ·  Layer 1     │
├──────────────────┬─────────────────────────────┬─────────────────────┤
│ THE REQUIREMENT  │ OUR DEFINITION              │ HOW WE GOT HERE     │
│                  │                             │                     │
│ "The proba-      │ [ v2 · adopted 2026-06-01 ] │ Discussion (7)      │
│ tionary period   │                             │ Proposal v3 (draft) │
│ MUST have: a     │ Body ………………                │ DEC-2026-009        │
│ defined dur-     │                             │ Decided by: consent │
│ ation, explicit  │ ── In plain words ──        │ 9 of 11 present     │
│ evaluation       │ ………………                     │ Review due: Jun 2027│
│ criteria, a      │                             │                     │
│ clear transition │ Type: ⬤ Enforceable         │ Related             │
│ decision process"│ Linter: ✓ subject ✓ process │ · 3.1.2 states      │
│                  │         ⚠ no consequence    │ · 3.3.4 exit path   │
│ Why it matters   │ if criteria unmet           │ · 6.4 sanctions     │
│ ………………           │                             │                     │
│ What NOT to      │ [ Start discussion ]        │ Evidence            │
│ define here      │ [ Propose change ]          │ · bylaws.pdf p.4    │
│ ………………           │                             │                     │
└──────────────────┴─────────────────────────────┴─────────────────────┘
```

Three columns, always the same: **what the standard asks / what we said / how we
got here.** The right column is the answer to
"we-wrote-it-down-now-we-forget" — provenance is never more than one glance away
from the rule itself.

**Plain-language mirror** is mandatory, not optional. Every adopted definition
carries a one-paragraph "what this means in practice." Ninety percent of
forgetting is that nobody rereads governance prose. This is also the text the
onboarding pack and the info-graphics later use.

**The linter** (see §6.2) runs on the draft, live, using your own
*Writing Good Definitions* rules.

### 4.4 The Path — priority & sequencing

A single ordered list, not a Gantt chart.

**The ordering rule is a visible, editable, versioned settings object** — not
hidden logic. The community sees the weights, can change them, and the change is
recorded like any other. The tool has an opinion and says so out loud; that is
more honest than pretending an algorithm is neutral, and it makes the opinion
arguable, which is the point.

Ordering is computed from four inputs and manually overridable by drag:

1. **Structural dependency** — Layer 0 before everything; Decision Matrix (4.4)
   early because it unlocks proper adoption; exit rules (3.6) before anything
   that could trap someone.
2. **Gap severity** — missing `MUST` outranks missing `SHOULD`.
3. **Risk profile** — a short setup interview ("do you hold land? shared money?
   children on site? a founder who owns the property?") reorders the path.
   A landholding community with a founder-owner needs 4.6 and 5.1 early; an
   online community needs 3.1 and 7.3 early.
4. **What they already have** — grounded in the community's own material:
   clauses covered by confirmed evidence from uploaded documents drop down the
   list; clauses that adopted definitions already *reference* rise (if your
   Decision Matrix cites a role registry you haven't written, that's now urgent);
   clauses with an active discussion rise, because the group has already shown
   it cares. The path should follow the community's attention, not fight it.

Each item shows a rough effort tag (*one conversation / one meeting / a series*)
so a group can plan a season, not a decade.

### 4.5 Documents & mapping — "you're further along than you think"

Upload existing governance docs (PDF, docx, md). The app extracts passages;
AI proposes clause mappings; a human confirms each one. A confirmed mapping is
**Evidence**, not an adopted definition — it says *"we have language about
this"*, and offers **"turn this into a definition"** which pre-fills the draft
with the community's own words.

This is the single biggest adoption unlock in the product. A forming community
starting at zero will bounce. An existing community that uploads its bylaws and
sees *"you already have language for 38 of 187 requirements"* stays.

### 4.6 Decision register

Filterable table: ID, title, type, layer, date, review date, decided-by,
status (active / superseded / provisional). Row → full record with rationale,
tally, the proposal text as voted, related decisions, affected clauses.
Full-text searchable. Exportable as CSV and as a printable register.

Two features that make it get *used* rather than archived:

- **Reverse lookup** — a plain-language search box: *"can we spend €800 on the
  water pump?"* → returns the clauses and decisions that govern it. Governance
  that answers questions gets consulted; governance that must be browsed does not.
- **Quotable permalinks** — every decision has a short URL a member can paste
  into a chat mid-argument.

### 4.7 Glossary — RCOS term + our term, side by side

Every RCOS Appendix A term, and next to it *this community's* definition where
one has been adopted ("Member" per your 3.1, "Commons" per your 5.1). Available
as a page **and** a slide-over panel, since terms get hit while reading anything.
Auto-populated from adopted definitions — a glossary nobody maintains by hand
is a glossary that stays right.

### 4.8 Artifacts & export

**Where local definitions appear.** This is the question local scope really
raises: an artifact is an RCOS shape, so what happens to the things RCOS did not
ask for?

- **Inside an RCOS artifact** — its required sections first, then a visually
  separated **"Local additions"** block below them, each item badged `Local`. The
  artifact's completeness bar counts **only the RCOS sections**: local additions
  can neither complete an artifact nor block one. A *sabbatical* membership state
  sits under the Membership Charter where anyone reading it would look for it,
  without pretending RCOS asked for it.
- **In a community artifact** — for things that fit no RCOS artifact at all.
  Every community starts with one, *Community Agreements*, and stewards may
  create more (*House & Land*, *Children & Education*). Each declares a layer so
  the glossary, navigation and the register stay coherent. They appear in their
  own group on the Artifacts page, below the 21 mandatory ones and clearly
  outside the compliance count.
- **In exports and on the public index** — **included**, always, and always
  labelled *"community addition — not required by RCOS-Core v0.1"*. Leaving them
  out would make an exported artifact a misrepresentation of how the community
  actually governs itself; including them unlabelled would let an outsider read a
  house rule as a standard requirement. An auditor must be able to tell the two
  apart at a glance, and so must a new member.

**Where they do not appear:** the readiness bars, the compliance statement, the
missing-artifact list, or the Path's ordered gaps. The Path answers *"which RCOS
obligations do we do next"*; a community that wants a local item in that list
drags it there, using the manual override the ordering system already has.

**"Run self-audit" — what the button actually does.** It appears in the artifacts
mockup and the public index footer says *"last self-audit 1 Aug 2026"*, so it has
to produce that date. It is not a recompute — readiness is always live. It is a
**recorded act**, which is what RCOS §10.1 asks for and what Appendix C.5 expects
a community to be able to cite.

Pressing it (steward only) runs the §10.1 Compliance Checklist and writes an
immutable `self_audit` record containing, at that moment:

- compliance: yes / no, and if no, every mandatory artifact that is missing or
  incomplete;
- every clause with no owning definition;
- every definition still **provisional**, with the interim rule it was adopted under;
- every definition past its **review date**;
- every decision frozen over an **unresolved objection**;
- every **transparency exception** and its expiry;
- readiness per layer as a snapshot, for the community's own inward use.

The result is a dated, shareable page; the date appears on the public index; the
previous audits stay listed, so a community can see its own trajectory. It never
changes any state — an audit that fixes things is not an audit.

Two things it deliberately is **not**: an approval (nobody is certified by
pressing a button — UI spec §9), and an AI judgement (every line is computed from
records, so two people running it get the same answer).

One page per mandatory artifact showing completeness and the clauses that feed
it. Export: Markdown bundle, PDF, and JSON. Plus a **public artifact index** —
a shareable page in the shape RCOS Appendix C.6 already specifies. Communities
publishing their governance publicly is both the point of RCOS and free
distribution for it.

### 4.9 Community settings

Members & roles — **two roles: steward and member** (`docs/04-security.md` §1);
stewards invite, remove and set roles, and one steward carries the *owner* flag
for transfer and deletion. Observer is post-MVP. AI usage per member is shown
here, since an invisible quota is indistinguishable from a bug. Also: interim adoption rule, review-cycle defaults, privacy defaults,
AI provider config (off / hosted / own endpoint), **standard & modules** — the
core version this community is at, adopted modules, and any migration in progress
(§12).

### 4.10 First run — two ways in, neither required

A forming community has no documents. An existing one has a shelf of them and may
still not want to upload anything on day one. So the entry screen offers both,
side by side, and **neither is a prerequisite for the other**:

- **"Start from what you already have"** → upload, map, confirm, turn passages
  into definitions (§4.5). The strongest onboarding moment in the product, for
  the communities that have material.
- **"Start from the first question"** → straight into the Path, answering
  clause 1 (§4.4). No empty document library staring at anyone.

The **setup interview** is the shared spine and runs in both paths: purpose,
scale, do you hold land, shared money, children on site, a founder who owns the
property. It is what makes the ordering defensible, and it takes five minutes.

A community that starts blank can upload documents at any later point and have
existing definitions matched against the new evidence; a community that starts by
importing can skip mapping and go to the Path at any time. The two paths converge
on the same dashboard by design — this was briefly framed as an either/or product
decision and it is not one.

---

### 4.11 Notifications — what the app is allowed to interrupt you about

A governance tool that never nags gets forgotten; one that nags constantly gets
muted, which is the same thing. So the list is short and the defaults are quiet.

| Event | In-app | Email |
|---|---|---|
| You were invited to a community | — | immediately |
| A consent round you are eligible for opened, or closes in 48h | ✓ | immediately |
| Someone replied in a thread you are in, or mentioned you | ✓ | in the weekly digest |
| A decision was frozen | ✓ | in the weekly digest |
| A definition you authored is past its review date | ✓ | in the weekly digest |
| A discussion you opened has been quiet for 14 days | ✓ | in the weekly digest |
| Your role changed, or you were removed | ✓ | immediately |
| The community's compliance claim was withdrawn | ✓ (stewards) | immediately (stewards) |

Rules: **email carries a link and a subject line, never content** (§1.6 —
member-visible does not mean inbox-visible). Every member controls their own
digest day and can turn email off entirely; in-app cannot be turned off, because
it is just the app. No push, no SMS, no "someone viewed your definition".

---

## 5. Workflows

### 5.1 Path A — discussion → freeze (MVP)

```
Clause → [Start discussion] → thread
   ├─ someone writes a Proposal (visually distinct, carries actions)
   ├─ iterate: Proposal v2, v3 …
   ├─ optional: [Take offline] → thread marked "decided offline"
   │            → on return: enter summary + the proposal that came out of it
   └─ [Freeze] → prompts for: decision type, mechanism, threshold, who was
                 present, tally, rationale, review date
                 → creates Decision record + Definition version + changelog entry
```

Next edit reopens as **draft on top of the frozen version**; the frozen one stays
authoritative until a new freeze. Freeze always records a person, a time, and a
mechanism — even in provisional mode.

**Design note:** make *Take offline* a first-class, obvious button, not a
fallback. Most real decisions in these communities will be made in a room. The
app's job is to be the place the room's outcome lands, and it should never feel
like the second-best path.

**Consent rounds are in the MVP** (decided 31 Aug 2026). The designs already show
an `In vote` status and *"consent round open, 12 of 19 responded, closes 3 Sep"*,
and Path A on its own could not produce that state. So Path A grows a third step:

```
Clause → discussion → Proposal vN
   ├─ [Open a consent round] → deadline + eligible members
   │     each member responds: consent · objection (with a reason) · abstain
   │     closes at the deadline or when everyone has responded
   └─ [Freeze] ← the tally pre-fills mechanism, threshold, present and tally
```

The round informs the freeze; it never performs it. Freezing stays a human act
with a name on it, and a community may still ignore the round and decide in a
room. VoteCast slots in later behind the same `VotingProvider` interface — the
built-in round is simply the default provider.

**Objections need semantics.** The proposal block offers *Support* and *Object*
with no stated consequence. An objection is an object with a reason and a
lifecycle — `open → withdrawn / addressed / overruled` — and the app does not
enforce anyone's threshold. It records the state and **refuses to hide it**:
freezing with unresolved objections is allowed if the community's rule allows it,
and the decision then permanently reads *"frozen with 1 unresolved objection"* in
the register and on its permalink. Dissent that evaporates at the moment of
recording is how a community ends up arguing about what was agreed.

### 5.2 Path B — VoteCast integration (post-MVP)

Same up to the proposal. Then **[Create proposal]** → choose a proposal type
defined in VoteCast → the vote runs on VoteCast, mirrored in-app → on pass, a
version is created automatically with the tally attached.

Build this behind a `VotingProvider` interface from day one (same seam as
FairShare) so path A is the built-in provider and VoteCast slots in without a
refactor.

---

## 6. MVP scope

Everything here serves one loop: **see the gap → discuss it → decide it → find
it again later.**

**In:**

1. RCOS v0.1 as structured data, browsable, with plain-language explanations
2. Multi-tenant communities, multi-user, roles, invites
3. Requirement → Definition model with statuses and per-layer readiness
4. Definition editor with plain-language mirror + **the definition linter**
5. Discussion threads with distinct Proposal objects; **Take offline**; Freeze
6. Versioning + Decision register + append-only change log + reverse lookup
7. Document upload + AI-assisted clause mapping → Evidence *(see below)*
8. The Path (ordered next-steps, risk-profile setup interview, drag to reorder)
9. Glossary panel
10. Export: Markdown + PDF bundle
11. Provisional mode + ratification sweep

Added by the review — not new product surface, but MVP-blocking and previously
unstated (`docs/07-spec-review-log.md`):

12. Roles and a real permission matrix; invitations by email; enforced tenant
    isolation (the highest-severity risk in the whole build)
13. Visibility enforcement across every read path — search, export, AI context
    and the git mirror included — plus transparency exceptions that actually
    expire, and the public artifact index with names shown only by consent
14. The platform admin console (§11)
15. Append-only audit log, structured logs, `/healthz`, backups with a tested
    restore
16. Objections with a lifecycle, and in-app consent rounds (§5.1)
17. Notifications (§4.11) and full mobile support (§4)
18. `?` help affordances on every non-obvious term, from one shared registry
    (`docs/02-component-guidelines.md` §5a)
19. Per-user AI and upload rate limits (`docs/04-security.md` §5.1, §5.3) — a
    single enthusiastic member must not be able to drain the community's budget
20. Self-audit records (§4.8)
21. **Local definitions** (§1.4b) — community-specific rules with the full
    lifecycle, a default *Community Agreements* artifact, the "Local additions"
    block in RCOS artifacts, and the one-checkbox `standard_feedback` capture

**Out of MVP:** VoteCast integration, facilitation guides, meeting mode,
stress tests, info-graphic generation, cross-community library, local AI,
notifications beyond in-app, conflict case management (see §9).

### 6.1 The one AI feature worth pulling into MVP

**Document mapping (#7).** Everything else AI does is a nice-to-have; this one
changes whether a community completes onboarding. It is also low-risk: the
output is a *suggestion a human confirms*, never an adopted definition.

If it slips, ship a manual version — select text in an uploaded doc, attach it
to a clause. The flow is the value; the AI is the accelerant.

### 6.2 The definition linter

Directly implements *Writing Good Definitions*. On any draft:

- **Classify:** enforceable / interpretive / expressive (author confirms)
- **If enforceable:** does it have a subject, a consequence or process, and a
  place it's recorded? Could an auditor check it yes/no? (§2.4.3 requires
  identity constraints be *testable*.)
- **If interpretive:** framed as "X over Y by default"? Overridable with a
  recorded reason?
- **If expressive:** labelled aspirational / non-binding?
- **The kill question:** *"what breaks if we delete this line?"* — if nothing,
  flag as clutter
- **Vagueness flags:** "regularly", "as needed", "reasonable", "when
  appropriate", "the community will decide" — each one is a future fight

The rule-based half must work with the AI provider switched off — the linter is a
product guarantee, not an AI feature.

**Correction to the mockups.** The linter panel currently reads:

> ⚠ Vague word: "regularly" — *three of eleven communities read this as monthly,
> eight as weekly*

That second clause claims the app knows how *other communities* interpreted the
same word. Producing it requires many communities using the tool, their
definitions pooled and analysed, and their consent to that pooling — which is the
opt-in cross-community pattern library in §7.9, deliberately post-MVP. At MVP
there will be two communities and no pooling, so the sentence would have to be
either absent or invented, and a developer implementing the mockup literally will
be tempted to invent it.

**Recommendation: keep the flag, drop the claim.**

> ⚠ Vague word: "regularly" — say how often, or this becomes an argument later.

The advice is the useful half; the statistic needs a network that does not exist
yet. When the pattern library ships, the number can return as a second line with
a real count and a link to its source.

**The general rule this is an instance of: a mockup must not show data the app
cannot produce at that stage.** Mockups become the spec, and a fabricated number
in a design is a fabricated number in production — in a product whose entire
value is that its claims are checkable.

*The rules are specified in `docs/11-definition-linter.md` — rule ids, severities,
messages and test fixtures, derived from `Writing Good Definitions — Enforceable,
Interpretive, Expressive` (Notion + EcoHubs vault). The guide stays in one place;
the rules live where they can be tested.*

This is cheap to build (mostly rules + a small model call), unique, and it is
the feature that stops the app producing 213 pieces of well-organised mush.

### 6.2a A note on languages

The blueprint repo already maintains the standard and all 22 templates in
**en, de, es, fr and pt-br**. Because the app's content comes from a generator
over those files, all five locales are free — the standard browser, the clause
explanations and the artifact names are multilingual from day one. Only the app's
own interface strings need translating, and that can start with fewer.

A community's *own* definitions are always in the community's own language. The
linter's rule-based checks are language-specific (the vagueness word list differs
per language) and ship for the locales the UI ships in.

### 6.3 Honest note on effort — now measured, not estimated

I originally budgeted the content build as the larger half — writing 213 clause
explanations from scratch. That was wrong twice over. The templates already carry
clause references, rationale, instructions and placeholders in exactly the
section structure §1.1 wants, **and** they live as markdown in the
`RCOS-website` SvelteKit repo, in five locales, with build
scripts and download manifests already in place. So this is a generator script
beside the existing ones, not an extraction project.

What the generator gets for free: 22 artifacts, 118 sections, 190 clause
references, rationale, instructions, placeholders, layer assignment, stable ids —
in en/de/es/fr/pt-br.

What still needs a human, now sized rather than guessed:

- **57 clauses are claimed by more than one section** and must be arbitrated into
  one owner plus cross-references (§1.1). Some are trivial; 3.1.2 being claimed by
  three different artifacts is not.
- **12 MUST clauses have no section**, because no community answers them — they
  are satisfied by the tool or are rules about the standard. Each needs a
  disposition, and without that, readiness can never reach 100%.
- **25 sections carry no clause line** and need one or an explicit exemption.
- **Effort tags, dependency edges and the plain-language dashboard question** for
  every section — AI-drafted, human-reviewed, about five minutes each.

Weeks, not months, and the review is phased: Layers 0–1 first, which is enough to
unblock the whole core loop.

**And worth doing while we are there:** publish the generated YAML/JSON next to
the existing md/docx/odt downloads on rcos.ecohubs.community. It costs nothing
once the generator exists, and it turns §8's argument — *"a way for other people
to build on RCOS"* — from an aspiration into a URL.

---

## 7. Post-MVP, roughly in order of value

1. **Stress tests as interactive scenarios** (§10.2). Compliance says you *have*
   an artifact; stress tests say whether it *works*. "Run *founder veto* against
   your adopted definitions" → walks your own Decision Matrix and reports where
   it fails. You already have the stress-test suite. This is the feature that
   makes RCOS feel like engineering rather than paperwork, and I'd rank it first.
2. **Facilitation guides per clause** — what the definition is, why it matters,
   the borders, common-ground questions, the failure modes it prevents,
   time-boxed agenda. Your idea; keep it.
3. **Meeting mode** — full-screen presentation of a facilitation guide: title
   slide, instructions, the questions, live capture into a proposal draft.
   Deliberately unglamorous first version; the value is the structure, not the
   animation.
4. **Onboarding pack generator** — auto-built from adopted definitions in
   plain-language form, with a consent checklist that records completion. This
   *is* §3.2.2 evidence, so it makes compliance easier while solving
   forgetting for every new member.
5. **Amendment impact graph** — change a definition, see every definition and
   artifact that cites it. §8.1.3 requires listing affected artifacts; the app
   can compute it.
6. **Standard-version migration** — when RCOS v0.2 lands, show a diff and flag
   exactly which adopted definitions need review. Follows from §11.2 and is a
   strong reason to stay in the tool rather than exporting to Google Docs. Now
   specified in full: §12.2 and `docs/09-standards-versions-modules.md` §4.

6b. **Module adoption** — browse and adopt RCOS modules (permaculture,
   minimal-permaculture, …), each with its own definitions, artifacts and version
   line, reported separately from core compliance. §12.3. Ranked here rather than
   lower because it is what turns RCOS from a standard into an ecosystem — but it
   waits on the module templates existing.
7. **Review-due engine + drift signals** — nag on review dates, flag definitions
   never referenced in a year, flag decisions repeatedly overridden in practice.
8. **VoteCast integration** (path B).
9. **Cross-community pattern library** — opt-in, anonymised: *"how 7 other
   communities defined their probation period."* Blank-page problem solved
   without the AI inventing anything, and it is the long-term network effect
   for RCOS. Probably the highest-ceiling feature on this list.
10. **Info-graphic / presentation generation** from adopted definitions — your
    idea; strong for onboarding and for showing outsiders what you've built.
11. **AI Q&A over the standard + your definitions**, answering only with
    citations to clauses and decision IDs. Never freeform.
12. **Local AI / bring-your-own-endpoint**, and a Tauri wrapper if there is
    real demand.
13. **Full discussion forum** — general threads not tied to a clause. Honest
    opinion: resist this. Communities already have Discord/Signal/Loomio, and a
    half-good forum is a support burden that competes with your actual value.
    Clause-scoped discussion is different — that is core.

### 7.1 Community governance websites — the biggest of these

A community has already asked for a public site presenting their RCOS
definitions. The **public artifact index (§4.8) is version one of exactly that**,
and the path from one to the other is short:

1. today — a shareable index page on our domain;
2. then — the community's own **subdomain**, then their own **custom domain**
   with a verified DNS record;
3. then — light **theming**: their logo, colours, fonts, a chosen layout, an
   about section, all from the design tokens that already exist;
4. eventually — this replaces `specs.ecohubs.community`, which does this job by
   hand today. EcoHubs becoming its own first customer is the best possible test.

Nothing here gets built for the MVP. Three things keep it from becoming
expensive later, and all three cost nothing now: the public routes are already a
separate group, host-based tenant resolution stays *additive* to path-based, and
no component references a hex colour (`docs/00-architecture.md` §7,
`docs/02-component-guidelines.md` §5). That is the whole "don't block it" budget.

### 7.2 Future ideas — captured, not yet ranked

Not commitments and not scheduled. Written down so they stop being remembered
and start being arguable.

- **AI presentation generator** — build a slide deck from an artifact or a chosen
  set of definitions, for a members' evening or an open day. Plain-language
  mirrors are already the script.
- **AI infographic generator** — one-page visual summaries of an artifact: the
  decision matrix as a diagram, the membership states as a flow, the conflict
  ladder as steps. The thing communities actually pin to a wall.
- **Ask AI, with sessions** (§7.3).
- **Onboarding pack** for new members, built from adopted definitions (already
  item 4 above).
- **Cross-community pattern library** (already item 9) — the precondition for the
  linter's "how other communities read this word".

Both generators share one constraint with everything else here: they may only
render **adopted** content, they must cite the definitions and decision refs they
drew from, and their output is a draft a human publishes — never something the
app publishes on the community's behalf.

### 7.3 "Ask AI" with sessions — my read: post-MVP, hooks in the MVP

The idea: a page where a member asks a question, gets a grounded answer, and — if
it turns out to be a real question for the group — converts the session into a
discussion, with the AI offering a title and body to edit before sending.

**It is a good idea, and it should not be in the MVP.** Three reasons:

1. Freeform Q&A is the **highest-risk AI surface** in a governance tool. Every
   other AI feature here produces a suggestion attached to a specific clause; a
   chat box invites "what should our exit rule be?" and answers it. That is the
   one thing §1.3 promises the app will never do.
2. The **grounded half already ships**: the reverse lookup in §4.6 answers *"can
   we spend €800 on the water pump?"* with citations to clauses and decision refs
   and nothing else. That is the same need, minus the freeform risk, and it is in
   the MVP.
3. The AI budget for the MVP is already spent on the two features that change
   whether a community completes onboarding.

**But design two hooks now, because they are free:**

- `discussion.origin` records where a discussion came from
  (`clause | ai_session | offline`), so a converted session is attributable later.
- The **visibility rule is decided up front**, not retrofitted: a session is
  **private to its author** until they convert or share it, at which point the
  transcript becomes member-visible **permanently** and is stamped `AI-assisted`.
  No half-public state, and nothing that was private silently becoming visible.

When it ships, the conversion flow is the valuable part: *"Would you like me to
draft a discussion from this?"* → an editable title and body → **the member**
presses Start discussion. The AI drafts and never posts.

---

---

## 8. RCOS as data — the quiet foundation

Encode each standard — core and, later, every module — as versioned structured
files (YAML/JSON) in their own repo, under `<standard-id>/<version>/`, with a
stable clause-key scheme alongside the published refs. This gives you:

- app content, spec site content, and audit tooling from one source
- machine-diffable versions (enables §7.6 migration)
- a way for other people to build on RCOS — which is what a standard is for
- the ability to hand a community a JSON export of their own definitions that
  outlives your app

If the app dies, the data model shouldn't. Worth designing for on day one.

### 8.1 Storage: SQLite operational, git for durability

**Recommendation: SQLite (via Drizzle) as the operational database, plus a git
mirror of adopted artifacts as the durability and portability layer.**

The git half is the good instinct: versioned definitions, an append-only
decision register and a change log are a git-shaped problem, and a repo the
community controls is the honest answer to "what if this app disappears."
Concretely: on every freeze, the app commits the rendered artifacts and decision
record to a repo (local, or the community's own remote). Verifiable history,
readable without the app, portable forever. Cheap to build, and it makes the
data-ownership promise in §10.2 real rather than aspirational.

### 8.2 On FOKS — not for this, and the reason is structural

Checked the repo and docs. FOKS is genuinely interesting work — federated,
self-hostable, E2EE git plus an encrypted KV store with team-scoped roles. It is
the right shape for secrets, and the wrong shape for this app, for four reasons
in descending order of seriousness:

1. **E2EE is in direct conflict with the product's core features.** If the
   server cannot read the data, it cannot index it, search it, roll up
   readiness across 213 clauses, render a page server-side, or run the reverse
   lookup — and the one AI feature in MVP (document → clause mapping) requires
   plaintext somewhere. Everything would have to move client-side, and every
   query becomes "download the whole tenant and filter in the browser."
2. **The threat model doesn't call for it.** RCOS pushes *toward* visibility:
   artifacts must be accessible to all members, versioned, auditable, and
   §C.6 assumes many communities publish. The requirement here is *"every
   member can see this, outsiders can't unless we publish"* — that is
   authorisation, not end-to-end encryption. The genuinely sensitive material
   is Layer 4 conflict data, which §9 already says not to put in this app.
3. **The KV store is a filesystem, not a database.** `put / get / ls / mkdir /
   mv / symlink` over encrypted paths, with no documented query, filter, index,
   transaction or atomicity guarantees. You would be reimplementing indexes and
   consistency by hand on top of it.
4. **Integration risk.** Alpha stage, Go client library, no JS/TS SDK — you'd
   drive it by shelling out to the CLI or its local `kv rest` shim from Node.
   That is a fragile production dependency for a one-developer project.

**Where it could earn a place later:** if a community demands sovereign
encrypted storage, FOKS's git side is a plausible *remote for the §8.1 mirror* —
the artifacts are pushed there encrypted, while the app keeps its own queryable
copy. That's an optional integration, post-MVP, with no architectural cost now.
I would not build a storage-provider abstraction in anticipation; the git mirror
is already the escape hatch.

---

## 9. What I would deliberately *not* build

- **Conflict case management.** Layer 4 belongs in the tool as *defining the
  process*. Running actual cases — intake, testimony, sanctions — puts
  safety-critical, legally exposed, deeply personal data in a young multi-tenant
  app. Define the ladder here; run cases elsewhere.
- **Treasury/accounting.** Layer 3 needs the *rules* defined, not the ledger.
  That's FairShare's territory; keep the seam clean.
- **Member directory / social features.** Not the product.
- **Anything that auto-adopts.** No "apply template to all of Layer 1" button,
  ever. It would make readiness go up and governance go down, which is the exact
  failure RCOS exists to prevent.
- **A compliance badge issued by the app.** Verification is a stewardship
  question, not a software feature — and a self-issued badge would devalue the
  standard fast.

---

## 10. Open questions

**Resolved in v0.2:** visibility model (§1.6), readiness vs compliance (§1.4),
opinionated-but-visible path ordering (§4.4), storage and FOKS (§8.1–8.2),
templates as content source (§6.3). FairShare stays a separate product — shared
stack, nothing else. First test communities: EcoHubs' own online community and
FruitHaven.

**Resolved in v0.3:** the clause-ID scheme, definition↔clause cardinality (was
question 5 below), the exact readiness and compliance arithmetic, how the
append-only register coexists with a right to erasure, what happens to member
names when an artifact is published, and where the operator's powers stop
(§11). Details and reasoning: `docs/07-spec-review-log.md`.

**Still open:**

1. **Who owns the data if the community leaves?** A one-click full export
   (JSON + Markdown + the git mirror) should be a stated product promise, not a
   feature. RCOS requires exit to be non-punitive for members — the same should
   be true for communities leaving the tool.
2. **What is the free tier?** Existing communities can pay; forming ones can't,
   and they're the ones who most need to start explicit. Something like:
   free for Layer 0–1 and up to N members, paid beyond.
3. **Two very different first users.** EcoHubs online is already RCOS-compliant
   on paper — for them the tool is import, register and *keeping it alive*.
   FruitHaven is place-based, predates RCOS, and hasn't fully shifted — for them
   it is discovery, mapping and sequencing. These pull the MVP in different
   directions. Which one does v1 optimise for?
4. **Where does the template content live** — markdown in a repo, or a CMS?
   Decides whether §6.3 is a script or a migration.
5. ~~**Does a definition belong to one section only?**~~ **Resolved:** one owning
   definition per clause, enforced by a unique constraint, plus non-owning
   cross-references. Consequence: every one of the 187 `MUST` clauses must be
   assigned to exactly one template section during the content build, and CI
   fails on an unassigned or doubly-assigned clause.

6. ~~**Which of the two first users does v1 optimise for?**~~ **Withdrawn.**
   Neither: both entry paths are first-class and neither is a prerequisite
   (§4.10). Question 3 above is answered the same way — the tool serves import
   and blank-slate communities from the same setup interview.

---

## 11. Platform administration

Everything above is a community's view of its own governance. This section is the
one place the *operator* appears — the person running the hosted instance who has
to be able to create a tenant, see whether the instance is healthy, and turn
something off when it is not.

**Who:** email addresses listed in `ADMIN_EMAILS` in the server environment,
matched against the user's *verified* email at request time. Not a database flag
— a database write must not be able to mint an operator — and not a session
claim, so removing an address takes effect on the next request. Two-factor is
required.

**What they can do:** list, create, rename, re-slug, limit, flag, suspend, and
soft-delete communities; see quota and AI usage; read the platform audit log and
instance status.

**What they cannot do, by design: read a community's content.** Definitions,
discussions, proposals, documents, decision bodies and member data are not
reachable from the admin console at all — the admin services never join to
content tables, and a test asserts that boundary. An operator who needs to work
inside a community joins it like anyone else. There is no impersonation in the
MVP; if support demand ever forces it, it ships time-boxed, reason-required,
owner-notified and visible in the community's own change log, or it does not ship.

The reason to be this strict: the product asks communities to put their most
sensitive structural agreements into someone else's software. "The operator
technically could" is unavoidable at the database level. "The operator's own
tooling cannot" is achievable, cheap, and the difference between a promise and a
policy.

Screens, fields, destructive-action rules and the acceptance tests:
`docs/05-admin-console.md`.

---

## 12. Standard versions and modules

RCOS is a **core** with its own version line plus **modules** with theirs, and a
community sits at one specific point in each. Three consequences the product has
to carry from day one, even though modules are post-MVP.

### 12.1 A clause reference is never a bare number

`1.2.3` under core 0.1 may point at different text under core 0.2 — and modules
number their own clauses from `1.1.1` as well, so `1.1.1` alone could be core
Layer 0, permaculture, or minimal-permaculture. Everything the app stores,
renders, exports or lets someone paste into a chat is the triple:

```
core@0.1 · 3.3.2        permaculture@0.1 · 1.1.1
```

Inside a community's own core version the short form `3.3.2` is fine on screen,
with the version stated on the surrounding block. In a decision record, an
export, or a permalink it is always the full form. One component renders all of
them; nothing else formats a reference.

### 12.2 A community is pinned to a version, and moves deliberately

Right now there is only core 0.1, so pinning is invisible. When 0.2 lands,
nothing changes for anyone until that community chooses to move — **no forced
upgrades, ever**, and a community can sit on 0.1 indefinitely.

Moving is a **guided migration**, and it is a governance act, not an update
button (RCOS §8.1.4 makes a change to the standard in force constitutional in
shape). The new version ships with a **migration map** saying what happened to
every clause: unchanged, renumbered, reworded, tightened, split, merged, removed,
added. From that the app can say, before anyone commits:

> *"37 of your 48 definitions carry forward untouched. 6 need re-reading because
> the obligation got stricter. 2 split in two. 1 is no longer required. There are
> 4 new questions."*

The old version stays authoritative for the whole migration; readiness shows both
figures side by side so the cost is visible; the migration ends with one decision
record adopting 0.2; and it can be abandoned at any point without losing work.

**Historical decisions keep the reference they quoted.** A 2026 decision that
says `core@0.1 · 5.3.3` still says that after the community moves to 0.2, with an
annotation pointing at the new location. Rewriting history to match a new
numbering would quietly break the one thing the register exists to guarantee.

### 12.3 Modules are separate, and must never inflate the compliance claim

Post-MVP, a community will be able to adopt modules — permaculture,
minimal-permaculture, and whatever follows — each with its own definitions,
artifacts and version line.

- Adopting a module is a **decision record** (RCOS §9.1.5 requires it to follow
  the Layer 6 change mechanism), not a settings toggle.
- **Module progress is reported separately and never added to the core number.**
  RCOS §10.1.5 is explicit that modules are excluded from core compliance
  evaluation, so a community at 100% on permaculture and 60% on core still reads
  *"not yet RCOS-Core compliant"* on its public index. This is the one way the
  feature could damage the standard, so it is enforced by a test rather than by
  discipline.
- Variants that cover the same ground — permaculture and minimal-permaculture —
  are mutually exclusive; the app refuses the second with an explanation.
- A module section may reference a core clause; it may never own one, so the
  one-owner rule still holds and nothing gets counted twice.
- The Path ranks core above modules by default, because core compliance is the
  gate. The weight is visible and editable like every other ordering weight.

Model, migration-map format and the build/prepare split:
`docs/09-standards-versions-modules.md`.
