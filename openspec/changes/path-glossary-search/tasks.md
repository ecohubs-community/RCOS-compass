## 0. The target

- [ ] 0.1 The e2e spec for the exit criteria, written first and marked `fixme`: a day-one community answers the interview, gets an order it can see the reasons for, and the water-pump question returns the clauses and decisions that govern it. It runs with `AI_PROVIDER=null`, because none of this is an AI feature
- [ ] 0.2 The two questions from `design.md` that have to be answered before anything is built: what the interview actually asks (each question earning its place by moving something), and whether a manual override survives a weights change. Recorded with their reasoning, the way P4's three were

## 1. Schema

- [ ] 1.1 `path_weights` — one active row per community plus its history, each with its actor and time; defaults written as a real row rather than left as nulls
- [ ] 1.2 `path_override` — per community, per section, with the position a member placed it at
- [ ] 1.3 `risk_profile` — the answers, editable, with a record of when they last changed
- [ ] 1.4 States as DB-level CHECKs, not drizzle enums — the same lesson P3 and P4 both had to learn once
- [ ] 1.5 Migration generated and applied
- [ ] 1.6 Tests: the constraints refuse what they exist to refuse; a second active weights row for one community is impossible; another community's override is invisible

## 2. Search — the seam, before anything uses it

- [ ] 2.1 `SearchIndex` (`docs/00` §5): `index`, `remove`, `query`, and nothing about an engine in the signature
- [ ] 2.2 The FTS5 implementation in `src/lib/server/search/`, with `community_id` a column inside the virtual table and every query filtering on it
- [ ] 2.3 **The boundary**: an ESLint rule confining full-text query syntax to that directory, proved in both directions the way the AI module's is — including from a subdirectory, which is where the AI rule had its hole
- [ ] 2.4 Indexing written inside the transaction that causes it: freeze, adopt, open a discussion, delete a document. Not a job — a decision that is unfindable for thirty seconds is one a member concludes did not save
- [ ] 2.5 A rebuild command, idempotent, for the deploy step and for when drift happens anyway
- [ ] 2.6 Tests: two communities with the same words see only their own; a rebuilt index answers identically to an incrementally-built one; a superseded definition is findable by its current text and not its replaced text; the boundary rule fails a file that breaks it

## 3. Reverse lookup

- [ ] 3.1 Tokenise, stop-word, and rank. No model, no summary, no sentence of our own — the result is citations and the member reads them
- [ ] 3.2 Decide and record whether decision *bodies* are indexed or only titles and rationales (`design.md`), with the water-pump question as the test
- [ ] 3.3 An empty result says which words were searched for, so it does not read as a broken feature
- [ ] 3.4 `searchDecisions` from P3 delegates to the seam rather than scanning the table
- [ ] 3.5 Global search from anywhere in the community
- [ ] 3.6 Tests: **the water-pump question returns the clauses and decisions that govern spending, and no prose of ours**; the same question with `AI_PROVIDER=null` behaves identically, because this was never an AI feature

## 4. The ordering

- [ ] 4.1 The four contributions computed separately — dependency, severity, risk, attention — and kept separate on the item
- [ ] 4.2 The weighted sum, and the ordering it produces
- [ ] 4.3 "Why this is here" generated from whichever contributions actually moved the item, so the sentence cannot drift from the position
- [ ] 4.4 Defaults that reproduce P3's ordering exactly: unblocked first, then by layer. A community that changes nothing must see no change
- [ ] 4.5 "What they already have" (UI spec §4.4): confirmed evidence drops a clause down; an adopted definition *referencing* an unwritten one raises it; an open discussion raises it, because the group has already shown it cares
- [ ] 4.6 Tests: each input moves the order on its own and can be zeroed out; the reason names the input that actually moved the item; with defaults and no profile the order matches P3's exactly

## 5. Weights and overrides, as governance

- [ ] 5.1 Changing weights writes a new active row and supersedes the old, with the actor and time — a steward's act, refused for a member
- [ ] 5.2 The settings screen: the four weights, their current values, whether they are the defaults, and who last changed them
- [ ] 5.3 Drag override, surviving re-computation, showing both where the community put an item and where the ordering would have
- [ ] 5.4 Clearing an override returns the item to its computed position
- [ ] 5.5 Tests: a member cannot retune; the previous weights stay readable; an override survives recomputation and shows both positions; one community's override changes nothing for another

## 6. The risk profile

- [ ] 6.1 The interview, from the questions decided in 0.2 — each stating which requirements it moves and why, at the moment it is answered
- [ ] 6.2 Skippable, with the path screen saying plainly that the ordering is structural rather than tailored, and offering the interview
- [ ] 6.3 Editable later; changing it changes the order and nothing else
- [ ] 6.4 Tests: an answer moves what it said it would move; readiness and compliance are untouched by any answer; **no risk-profile answer reaches an AI task's input, a public surface, or another community**

## 7. Glossary

- [ ] 7.1 The page: every RCOS term, with the community's adopted definition beside it where one exists
- [ ] 7.2 The slide-over panel, because terms get hit while reading anything
- [ ] 7.3 Derived at read time from adopted definitions — nothing stored, so nothing can be stale
- [ ] 7.4 A term with no reliable mapping shows the standard's definition alone and says the community has not defined it, rather than guessing
- [ ] 7.5 Tests: freezing a definition changes the glossary with nobody maintaining it; a superseded version shows the current text; the standard's own term appears in the community's locale where it has one

## 8. Closing it

- [ ] 8.1 The e2e spec passes end to end: interview → a defensible order → the water-pump question answered with citations
- [ ] 8.2 The same at 375px, including the drag override
- [ ] 8.3 Every service added in groups 2–7 registered in `services/registry.ts`, with the async ones awaited by the harness as P4 taught it to be
- [ ] 8.4 The a11y pass covers the path, settings, interview, search and glossary screens at 375 / 768 / 1024 / 1440
- [ ] 8.5 Mutation-check the claims this phase rests on (`docs/06` §8a): that a risk answer never reaches an AI input, that search never crosses a community, and that the reason matches the rank. Break each, watch the right test fail, put it back
- [ ] 8.6 `docs/00`, `docs/03` and `docs/06` updated wherever the build taught something the documents did not say, and the two decisions from 0.2 recorded
