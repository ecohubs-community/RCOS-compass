## 0. The target

- [x] 0.1 The e2e spec for the exit criteria, written first and marked `fixme`: a day-one community answers the interview, gets an order it can see the reasons for, and the water-pump question returns the clauses and decisions that govern it. It runs with `AI_PROVIDER=null`, because none of this is an AI feature
- [x] 0.2 The three questions from `design.md`, answered before anything is built and recorded with their reasoning the way P4's were: what the interview actually asks (each question earning its place by moving something), whether decision *bodies* are indexed or only titles and rationales, and whether a manual override survives a weights change
- [x] 0.3 **Upstream: the glossary's term-to-section mapping.** The vendored `glossary.yaml` has 37 terms and no link to the sections that define them, so the community column would be empty for every one and the page a reprint of the standard. Added in the RCOS website repository and re-vendored, the way P1 did section dispositions — the vendored copy is not a place to edit the standard, and `meta.yaml`'s hash check enforces that. First, because group 7 cannot finish without it
- [x] 0.4 The content check learns the new field: a term naming a section the standard does not have fails `scripts/check-standard.mjs`, so a bad mapping is a failed build rather than an empty column

## 1. Schema

- [x] 1.1 `path_weights` — one active row per community plus its history, each with its actor and time; defaults written as a real row rather than left as nulls
- [x] 1.2 `path_override` — per community, per section, with the position a member placed it at
- [x] 1.3 `risk_profile` — the answers, editable, with a record of when they last changed
- [x] 1.4 States as DB-level CHECKs, not drizzle enums — the same lesson P3 and P4 both had to learn once
- [x] 1.5 Migration generated and applied
- [x] 1.6 Tests: the constraints refuse what they exist to refuse; a second active weights row for one community is impossible; another community's override is invisible

## 2. Search — the seam, before anything uses it

- [x] 2.1 `SearchIndex` (`docs/00` §5): `index`, `remove`, `query`, and nothing about an engine in the signature
- [x] 2.2 The FTS5 implementation in `src/lib/server/search/`, with `community_id` a column inside the virtual table and every query filtering on it
- [x] 2.2a Indexed: definitions, decisions, discussion titles and document passages — what a community wrote. **Clause text is not indexed**: it is identical for all of them, and per-tenant copies of non-tenant data inside the isolation structure is the leak that structure exists to prevent. Clauses are matched against the loaded standard and merged into the results
- [x] 2.3 **The boundary**: an ESLint rule confining full-text query syntax to that directory, proved in both directions the way the AI module's is — including from a subdirectory, which is where the AI rule had its hole
- [x] 2.4 Indexing written inside the transaction that causes it: freeze, adopt, open a discussion, delete a document. Not a job — a decision that is unfindable for thirty seconds is one a member concludes did not save
- [x] 2.5 A rebuild command, idempotent, for the deploy step and for when drift happens anyway
- [x] 2.6 Tests: two communities with the same words see only their own; a rebuilt index answers identically to an incrementally-built one; a superseded definition is findable by its current text and not its replaced text; the boundary rule fails a file that breaks it

## 3. Reverse lookup

- [x] 3.1 Tokenise, stop-word, and rank. No model, no summary, no sentence of our own — the result is citations and the member reads them
- [x] 3.2 Index what 0.2 decided about decision bodies, and prove the choice with the water-pump question rather than with an opinion about relevance
- [x] 3.3 An empty result says which words were searched for, so it does not read as a broken feature
- [x] 3.4 `searchDecisions` from P3 delegates to the seam rather than scanning the table
- [x] 3.5 Global search from anywhere in the community
- [x] 3.6 Tests: **the water-pump question returns the clauses and decisions that govern spending, and no prose of ours**; the same question with `AI_PROVIDER=null` behaves identically, because this was never an AI feature

## 4. The ordering

- [x] 4.1 The four contributions computed separately — dependency, severity, risk, attention — and kept separate on the item
- [x] 4.1a Severity measured as how many countable clauses a section answers (they range from one to eight). The spec's MUST-vs-SHOULD phrasing ranks nothing here: RCOS-Core 0.1 has 185 MUST, 18 MAY and no SHOULD, and the path only walks sections owning countable MUSTs
- [x] 4.2 The weighted sum, and the ordering it produces
- [x] 4.3 "Why this is here" generated from whichever contributions actually moved the item, so the sentence cannot drift from the position
- [x] 4.4 Defaults that reproduce P3's ordering exactly: by how many questions are in the way, then by layer. A community that changes nothing must see no change — which needs the dependency contribution's *layer step* to outweigh everything a day-one community scores, so the defaults are deliberately unbalanced (250 against 10) and the settings screen says why. See `design.md` §4a, corrected once the arithmetic was done
- [x] 4.5 "What they already have" (UI spec §4.4): confirmed evidence drops a clause down; an adopted definition *referencing* an unwritten one raises it; an open discussion raises it, because the group has already shown it cares
- [x] 4.6 Tests: each input moves the order on its own and can be zeroed out; the reason names the input that actually moved the item; with defaults and no profile the order matches P3's exactly

## 5. Weights and overrides, as governance

- [x] 5.1 Changing weights writes a new active row and supersedes the old, with the actor and time — a steward's act, refused for a member
- [x] 5.2 The settings screen: the four weights, their current values, whether they are the defaults, and who last changed them
- [x] 5.3 Drag override, surviving re-computation, showing both where the community put an item and where the ordering would have
- [x] 5.4 Clearing an override returns the item to its computed position
- [x] 5.5 Tests: a member cannot retune; the previous weights stay readable; an override survives recomputation and shows both positions; one community's override changes nothing for another

## 6. The risk profile

- [x] 6.1 The interview, from the questions decided in 0.2 — each stating which requirements it moves and why, at the moment it is answered
- [x] 6.2 Skippable, with the path screen saying plainly that the ordering is structural rather than tailored, and offering the interview
- [x] 6.3 Editable later; changing it changes the order and nothing else
- [x] 6.4 Tests: an answer moves what it said it would move; readiness and compliance are untouched by any answer; **no risk-profile answer reaches an AI task's input, a public surface, or another community**

## 7. Glossary

- [ ] 7.1 The page: every RCOS term, with the community's adopted definition beside it where one exists, using the mapping vendored in 0.3
- [ ] 7.2 The slide-over panel, because terms get hit while reading anything
- [ ] 7.3 Derived at read time from adopted definitions — nothing stored, so nothing can be stale
- [ ] 7.4 A term with no reliable mapping shows the standard's definition alone and says the community has not defined it, rather than guessing
- [ ] 7.5 Tests: freezing a definition changes the glossary with nobody maintaining it; a superseded version shows the current text; the standard's own term appears in the community's locale where it has one

## 8. Closing it

- [ ] 8.1 The e2e spec passes end to end: interview → a defensible order → the water-pump question answered with citations
- [ ] 8.2 The same at 375px, including the drag override
- [ ] 8.3 Every service added in groups 2–7 **that is addressed by an id** registered in `services/registry.ts`. Most of this phase is not: search takes a query, weights take a community, and the interview takes answers — so the honest closing check is the tenant boundary asserted directly for each of those instead, and the registry gains whatever genuinely takes a subject id
- [ ] 8.4 The a11y pass covers the path, settings, interview, search and glossary screens at 375 / 768 / 1024 / 1440
- [ ] 8.5 Mutation-check the claims this phase rests on (`docs/06` §8a): that a risk answer never reaches an AI input, that search never crosses a community, that the reason matches the rank, and that defaults reproduce P3's order. Break each, watch the *right* test fail, put it back — P4 had two tests passing for the wrong reason and this is what found them
- [ ] 8.6 `docs/00`, `docs/03` and `docs/06` updated wherever the build taught something the documents did not say, and the two decisions from 0.2 recorded
