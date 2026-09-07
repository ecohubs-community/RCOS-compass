## 0. The target

- [ ] 0.1 The e2e spec for the exit criteria, written first and marked `fixme`: a community publishes an artifact, an anonymous visitor reads the index and finds the binary claim with its gap list and no percentage, the community exports itself, and the bundle opens with no Compass running. It is the last thing to go green
- [ ] 0.2 **The enumerating test, before the filter exists.** `visibility.test.ts` lists every read service the way `cross-tenant.test.ts` lists the registry, seeds one `member` and one `world` row for each, and asserts an anonymous reader sees only the second. Written against services that do not filter yet, so the suite is red from the first commit of this phase and every task below moves it
- [ ] 0.3 The three decisions this phase has to make before it builds: what a mirror commit's author is (design.md leaves it open — a service identity with the person named in the body, or the person's own git identity, which puts an email in a repository a community may publish); whether an export link's expiry is hours or days; and whether the public route lives at `/p/<slug>`. Recorded with their reasoning the way P4's and P5's were

## 1. Visibility, as a column and a filter

- [ ] 1.1 `visibility` on `definition`, `decision`, `document` and `community_artifact` — `member | world | restricted`, default `member`, with a real CHECK rather than a drizzle enum, which P3, P4 and P5 each had to learn once
- [ ] 1.2 `transparency_exception` — subject, justification, authorising decision, `expires_at` **not null**, actor, created_at. An optional expiry becomes a null on every row within a month, and the object stops being an exception
- [ ] 1.3 `visibleTo(ctx)` in one place, returning the condition. Nothing else expresses what a reader may see
- [ ] 1.4 Migration generated and applied; existing rows take `member`, which is exactly today's effective behaviour, so no community's content becomes readable by upgrading
- [ ] 1.5 Every read service takes the filter — lists, detail reads, `path()`, the glossary join, `lookup()`. Task 0.2's suite goes green service by service, and the count assertions in the existing suites are what catch a filter that removes too much
- [ ] 1.6 Setting `restricted` writes the subject and its exception in one transaction, and is refused without a justification, an authorising decision and an expiry
- [ ] 1.7 Tests: an anonymous reader sees only `world`; a member sees `member` and `world`; `restricted` without an exception is impossible; a restricted definition still answers its clause and still counts toward readiness — hiding something must not make it stop counting

## 2. Exceptions that end

- [ ] 2.1 The expiry job: reverts expired subjects to `member`, writes a change-log entry for each, and is idempotent — a job that ran twice in a night must not log twice
- [ ] 2.2 Renewal: extending an exception keeps both justifications readable, because "why is this still hidden" is the question an auditor asks
- [ ] 2.3 The screen: what this community is restricting, why, who authorised it, and when each one ends
- [ ] 2.4 Tests: an exception expires and the subject comes back; a renewed one does not; the change log says which; the job is safe to run twice

## 3. The search index learns visibility

- [ ] 3.1 `search_document` gains a visibility column, filtered inside the query beside `community_id` — the same reasoning, and the same failure mode if it is applied to the results instead
- [ ] 3.2 Indexing writes it, and a visibility change re-indexes in the same transaction as the change, exactly as a text change does
- [ ] 3.3 Migration plus an index rebuild, and the deploy step becomes migrate → rebuild → serve. P5's "a rebuilt index answers identically" test is what proves the rebuild is right
- [ ] 3.4 Tests: a member who may not see a restricted definition finds nothing searching for words that appear only in it; changing visibility changes what is findable immediately

## 4. Publishing

- [ ] 4.1 Publishing an artifact writes a decision record. It is a governance act, and the register is where those live
- [ ] 4.2 Unpublishing sets the visibility back and the public route answers **410 Gone** — not 404, which is a lie somebody can check against their own bookmark, and not a redirect, which pretends nothing changed
- [ ] 4.3 The outward claim as its own shape: binary, gap list, standard version, last self-audit date — and no percentage field on it, so a public surface cannot render one by accident
- [ ] 4.4 Attribution: `roles_and_counts` unless an attendee individually consented. No community-level setting may name somebody who did not
- [ ] 4.5 Tests: publishing appears in the register; 410 for withdrawn and 404 for never-published; a decision with no consenting attendees publishes its tally and no names; a community that sets its policy to names still cannot name a non-consenter

## 5. The public surface

- [ ] 5.1 The `(public)` route group — anonymous, outside the community layout, the first surface in the product with no `Ctx`. Resolving a community here must not go through the member path by habit
- [ ] 5.2 The index in the shape of RCOS Appendix C.6: published artifacts with layer, version and date; the compliance statement; what is private and why, in the community's own words; the standard version; a contact the community wrote
- [ ] 5.3 One page per published artifact, with local additions labelled *"community addition — not required by RCOS-Core v0.1"* — an auditor must be able to tell at a glance, and so must a new member
- [ ] 5.4 A community that has published nothing says so, rather than 404ing or showing an empty shell that reads as broken
- [ ] 5.5 **The public-surface crawl test**: every public route of a community holding both member-visible and world content, fetched anonymously, contains no member-visible fixture text and no `%`. Mutation-checked — put the percentage on the view model and watch the right test fail
- [ ] 5.6 a11y and 375px for every public page. It is the surface most likely to be opened on a phone by somebody who has never seen the product

## 6. Self-audit

- [ ] 6.1 `self_audit` — immutable, with the actor, the time and the snapshot as JSON. Nothing edits or deletes one
- [ ] 6.2 The act: computed from records only, changing no state. Readiness and compliance identical before and after, asserted rather than assumed
- [ ] 6.3 The snapshot's contents, all of them (UI spec §4.8): compliance, missing artifacts, uncovered clauses, provisional definitions with the interim rule, definitions past review, decisions frozen over unresolved objections, live exceptions with expiries, readiness per layer — and local definitions past review, listed separately and marked as not affecting compliance
- [ ] 6.4 The result page, dated and shareable; previous audits stay listed so a community sees its own trajectory
- [ ] 6.5 The public index cites the latest date, and says plainly when there has never been one
- [ ] 6.6 Tests: it changes nothing; two runs on unchanged state agree; a member cannot run one; an audit still says what was true after the state moves; nothing on it claims certification

## 7. Export

- [ ] 7.1 The bundle: Markdown one file per artifact, the register in full, JSON for machines, and a manifest naming the standard, version, community, date and which visibility levels it contains
- [ ] 7.2 PDF via headless Chromium against the app's own print stylesheet (`docs/00` §8). This is where Playwright becomes a runtime dependency on the server, and where we find out whether the memory cost bites
- [ ] 7.3 The job: queued, notified on completion, with a signed expiring link scoped to one community, audit-logged when issued and when used
- [ ] 7.4 The filter applies — a bundle contains only what its requester may see, and the manifest says which levels those were
- [ ] 7.5 Local definitions included and labelled. Leaving them out makes the export a misrepresentation of how the community governs itself; including them unlabelled lets an outsider read a house rule as a requirement
- [ ] 7.6 Produced files expire and are cleaned up; a job that fails part-way leaves no partial bundle and issues no link
- [ ] 7.7 Tests: **the bundle is unpacked and read with the app not running**; its decision count and one adopted definition match the register; an altered or expired link is refused; a restricted definition the exporter may not see is absent

## 8. The git mirror

- [ ] 8.1 A local bare repository per community, created without anybody configuring anything — the durability promise has to reach the community that has never heard of GitHub and the one that does not trust it
- [ ] 8.2 The post-freeze job renders the adopted artifacts and the decision record and commits. **After the transaction commits, never inside it**: a failing mirror must not block, delay or roll back governance
- [ ] 8.3 Download as a git bundle, which clones and shows one commit per decision
- [ ] 8.4 Optional remote: a steward links any git remote and the same commits are pushed there. Linking changes where history is copied to and nothing about what is in it
- [ ] 8.5 The credential — encrypted at rest with a key from config, write-only from the interface, absent from every log line, error body, export, dead-letter record and the admin console. Revocation is deleting the row, which stops pushes and keeps every commit
- [ ] 8.6 Retry with backoff; a persistent failure surfaces in settings saying what failed and when, without echoing the credential
- [ ] 8.7 The mirror obeys `visibleTo` — it is an outward path like any other. Restricted content is excluded unless the community opted in explicitly
- [ ] 8.8 Tests: a community that configured nothing still gets commits; the bundle clones and reads with git alone; a failing push leaves the decision frozen and findable; the credential is not recoverable from the row, an error, or a dead-letter entry; restricted content is not in the commits

## 9. i18n

- [ ] 9.1 Paraglide wired in, with the community's locale selecting the messages and a missing key failing the build rather than rendering blank
- [ ] 9.2 Every interface string extracted. This is the tedious half and the half that decides whether the rest is real
- [ ] 9.3 German and Spanish translated, and **an untranslated string renders the English marked as untranslated** — a silent fallback is how a half-translated interface looks finished and stays half-translated for a year
- [ ] 9.4 The community's locale selects the standard's own words, which the vendored data already carries in all five; `localise()` already falls back and says so
- [ ] 9.5 A community's own definitions, decisions, rationales and posts are never translated, at export and on the public surface included
- [ ] 9.6 Tests: a German community reads German; an untranslated string is marked rather than substituted; changing the locale changes the interface and the standard and nothing else — not readiness, not compliance, not one definition

## 10. Closing it

- [ ] 10.1 The e2e spec from 0.1 passes end to end: publish → an anonymous visitor reads the claim and the gap list → export → the bundle opens without the app
- [ ] 10.2 The same at 375px, including the public index and the export request
- [ ] 10.3 Task 0.2's enumerating suite is green, and every read service added in groups 1–9 is in it
- [ ] 10.4 Every service added in this phase that is addressed by an id registered in `services/registry.ts`; for the rest — the public loaders, the export job, the mirror — the tenant *and visibility* boundaries asserted directly, the way P5 closed the same gap
- [ ] 10.5 a11y over the public index, the artifact pages, the exceptions screen, the self-audit result and the export screen at 375 / 768 / 1024 / 1440
- [ ] 10.6 Mutation-check the claims this phase rests on (`docs/06` §8a): that no read path returns member content to an anonymous reader, that the percentage cannot reach a public surface, that an unconsented name is never published, that the mirror credential never appears in a failure, and that an expired exception actually reverts. Break each, watch the *right* test fail, put it back
- [ ] 10.7 `docs/00`, `docs/03`, `docs/04` and `docs/06` updated wherever the build taught something the documents did not say, and the three decisions from 0.3 recorded
