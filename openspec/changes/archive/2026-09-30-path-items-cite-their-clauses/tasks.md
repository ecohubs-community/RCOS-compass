## 1. Content

- [x] 1.1 Reword the 25 questions in `standard/rcos-core/0.1/annotations.yaml` exactly as `design.md` §4 lists them; effort and `dependsOn` untouched
- [x] 1.2 `scripts/check-standard.mjs`: fail when an authored section has no annotation or an empty question
- [x] 1.3 Tests (unit, `standard-loader.test.ts`): the check fails when voluntary exit's annotation is removed, names it, and trips nothing else; passes on the vendored RCOS-Core 0.1. (The planned before/after order comparison was dropped: `ordering.ts` never reads the question text, so it could not fail.)

## 2. The thread names its section

- [x] 2.1 Schema: `discussion.section_key` (text, nullable) and index `(community_id, section_key)`; `pnpm db:generate` → `drizzle/0028_jittery_lilith.sql`
- [x] 2.2 `sectionOf(view, thread)` in `completeness.ts`: `thread.sectionKey ?? owner(thread.clauseKey) ?? null`
- [x] 2.3 `openDiscussion` accepts `{ kind: 'section', sectionKey, clauseKey? }`: the section must be authored in the active standard (400 otherwise); a given clause must exist (400) and is stored by key; the section is stored only when the clause is empty or owned by that section, else only the clause
- [x] 2.4 Freeze target (`decisions.ts`): `definitionId` first, then `sectionOf`; a section owning no countable clause adopts with an empty clause list, writing no `decision_clause` or coverage rows; layer from the clause, else the artifact
- [x] 2.5 Decision permalink with no clauses: already hides "What it answers" when the list is empty, and the register lists no clauses — no change needed
- [x] 2.6 Ordering's "open discussion" input (`ordering.ts`) counts threads by `sectionOf` too, so the Path's order and its "Open discussion" link agree about which item a thread belongs to (identical for every thread opened before this change)
- [x] 2.7 Tests (integration, `path-items.test.ts`): open on a section — happy path, member allowed, reference accepted, a section owning no clause, a clause owned elsewhere drops the section, a non-authored or unknown section refused, an unknown clause refused, an observer refused (403), another community gets 404 and does not see the thread on its Path; freeze of `purpose-charter.non-goals-and-exclusions` adopts that section (not primary purpose), writes no clause rows, leaves readiness unchanged and removes the item; voluntary exit's freeze covers 3.6.1, 3.6.2, 3.6.4; an old clause-only thread still resolves through its owner

## 3. The Path cites and starts

- [x] 3.1 `path.ts`: `PathItem.cites` (owned first, then referenced, each in ref order) and `PathItem.start` replace `clauseKey`; the open thread is matched by `sectionOf`, newest activity first
- [x] 3.2 `links.startDiscussion(slug, { sectionKey, clauseKey }, title)`; the discussions page reads `?section=` into a hidden field, prefills the clause as its reference rather than its key, and passes `{ kind: 'section' }` when present; the search page's "Start the discussion" passes the section too
- [x] 3.3 `<ClauseRef>` and `<CitedClauses>` in `src/lib/components/ui/`, both in the component gallery; "related" is a word as well as a style
- [x] 3.4 Path page and dashboard show `cites` linked to `links.clause(slug, ref)`; the standard browser anchors every clause a section owns (MAY and INFORMATIVE included), so a link to §2.1.5 lands; the Path row wraps its controls under the question below ~430px instead of squeezing it into one column
- [x] 3.5 Tests (integration, `path-items.test.ts`): all 94 items have a `start`, 28 with no clause; voluntary exit cites 3.6.1, 3.6.2, 3.6.4 owned; forced exit cites 3.6.4 related; non-goals cites 2.1.5 related; a voluntary-exit thread is not forced exit's; an old clause-only thread on 3.6.2 matches voluntary exit
- [x] 3.6 Tests (e2e, all viewports): starting non-goals from the Path prefills the form, creates the thread showing §2.1.5, and the item then offers "Open discussion"; voluntary exit's §3.6.2 opens the standard browser at `#clause-3.6.2`

## 4. The requirement, in the thread and on the definition

- [x] 4.1 `requirement.ts`: `requirementFor(view, sectionKey, locale)` (clauses with normativity and localised body, why it matters, what to define, derived `notHere`), `citedClauses`, `questionFor`, `compareRefs`, and `standardName` (moved from `workspace.ts`)
- [x] 4.2 `<Requirement>`: heading with `<HelpTip id="requirement">`, each clause quoted with standard, `<ClauseRef>` and normativity, three `<details>`; `selectedRef` marks one clause with a border, a wash, `aria-current` and the word "opened"
- [x] 4.3 Definition page's requirement column and header use `requirementFor`, `<Requirement>` and `<CitedClauses>`
- [x] 4.4 Discussion page: `threadRequirement()` (definition's section, else `sectionOf`); the header shows the section title and every cited ref via `<RequirementRefs>` — links to the standard browser whose plain click opens a Bits UI `Dialog` sheet (right, 420px, from 768px; bottom, full width below) scrolled to the clicked clause; focus returns to the reference; the raw clause key is gone from the header and the freeze panel
- [x] 4.5 Tests (unit, `requirement.test.ts`): voluntary exit's clauses, bodies and `notHere` (forced exit, suspension, asset separation; no ratification record); non-goals names primary purpose once; the due-process reference names forced exit from another template; German text; unknown section; ref ordering; standard name
- [x] 4.6 Tests (e2e): the sheet opens with the three clauses and §3.6.2 marked, lists what not to define, passes axe with the sheet open, closes on Escape with focus back on the link; at 375px it is a full-width bottom sheet with a 44px close control; without JavaScript the link opens the standard browser at the clause; a thread about nothing shows no references

## 5. Shipping

- [x] 5.1 `pnpm version minor --no-git-tag-version` (0.8.0 → 0.9.0)
- [x] 5.2 `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm test:e2e` pass
- [x] 5.3 Note the eleven over-broad owners (`design.md` §5) for the RCOS-website generator — listed in the PR description
