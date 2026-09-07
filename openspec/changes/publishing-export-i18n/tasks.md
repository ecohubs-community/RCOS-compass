## 0. The target, and the two things that must exist before anything else

- [x] 0.1 The e2e spec for the exit criteria, written first and marked `fixme`: a community switches its public index on, publishes an artifact, an anonymous visitor reads the index and finds the binary claim with its gap list and no percentage, the community exports itself, and the bundle opens with no Compass running. It is the last thing to go green
- [x] 0.2 **The enumerating test, before the filter exists.** `visibility.test.ts` lists the read services that return subject rows, seeds one `member` and one `world` row for each, and asserts an anonymous audience sees only the second. Written against services that do not filter yet, so the suite is red from the first commit and every task below moves it. It deliberately does **not** list `readiness()` or `path()` — a registry entry that cannot assert anything reads as coverage and is worse than a shorter registry; the aggregates are covered in 1.8
- [x] 0.3 **Paraglide wired in first, not last.** Every screen groups 4–8 add is written with message functions from the start; extracting them afterwards is rework nobody schedules and a phase that ends with hardcoded English in five new screens
- [x] 0.4 The three decisions this phase has to make before it builds, recorded with their reasoning the way P4's and P5's were: what a mirror commit's author is (a service identity with the person named in the body keeps personal email addresses out of a repository a community may publish); how long an export link lives; and whether the public route is `/p/<slug>`

## 1. Visibility, as a column and a filter

- [x] 1.1 `visibility` on `definition`, `decision`, `document` and `community_artifact` — `member | world | restricted`, default `member`, with a real CHECK rather than a drizzle enum, which P3, P4 and P5 each had to learn once
- [x] 1.2 `first_published_at` on the same subjects, set once and never cleared. It is what lets a withdrawn page answer 410 and a never-published one answer 404, which current visibility cannot distinguish
- [x] 1.3 `transparency_exception` — subject, **who may see it**, justification, authorising decision, `expires_at` **not null**, actor, created_at. The audience field is named in UI spec §1.6 and missing from the sketch in `docs/03` §3; without it, "a member sees restricted subjects only if they may" has no definition
- [x] 1.4 **`Audience`, not `Ctx`.** `type Audience = { kind: 'anonymous'; communityId } | { kind: 'member'; ctx }`, and `visibleTo(audience)` returning the condition. The signature matters: a fake `Ctx` built for a public loader would satisfy `requirePermission(ctx, 'community.read')` and hand an anonymous visitor every read path in the product, so the type has to make that unrepresentable
- [x] 1.5 Migration generated and applied; existing rows take `member`, which is exactly today's effective behaviour, so no community's content becomes readable by upgrading
- [x] 1.6 Every row-returning read service takes an `Audience` and applies the filter — lists, detail reads, the glossary join, `lookup()`. Around 30 call sites; 0.2's suite goes green service by service, and the count assertions in the existing suites are what catch a filter that removes too much
- [x] 1.7 Setting `restricted` writes the subject and its exception in one transaction, and is refused without an audience, a justification, an authorising decision and an expiry
- [x] 1.8 The aggregates separately: `readiness()`, `compliance()` and `path()` count what they count regardless of who is asking, and a restricted definition still answers its clause. Hiding something must not make it stop counting — that would make restriction a way to look more compliant
- [x] 1.9 Tests: an anonymous audience sees only `world`; a member sees `member` and `world`; a member outside an exception's audience sees a restricted subject as though it does not exist; `restricted` without an exception is impossible; readiness is identical before and after a visibility change

## 2. Exceptions that end

- [x] 2.1 The expiry job, re-arming itself the way `weekly-digest` does rather than introducing a scheduler — the queue already has that pattern and a second one is a second thing to get wrong
- [x] 2.2 It reverts expired subjects to `member`, writes a change-log entry for each, and is idempotent: a job that ran twice in a night must not log twice
- [x] 2.3 Renewal keeps both justifications readable, because "why is this still hidden" is the question an auditor asks
- [x] 2.4 The screen: what this community is restricting, from whom, why, who authorised it, and when each one ends
- [x] 2.5 Tests: an exception expires and the subject comes back; a renewed one does not; the change log says which; the job is safe to run twice

## 3. The search index learns visibility

- [ ] 3.1 A visibility column on `search_document`, filtered inside the query beside `community_id`. **This is a drop and recreate, not an alter** — SQLite refuses `ALTER TABLE … ADD COLUMN` on a virtual table with `virtual tables may not be altered`
- [ ] 3.2 Indexing writes it, and a visibility change re-indexes in the same transaction as the change, exactly as a text change does
- [ ] 3.3 The migration empties the index, so the deploy step becomes migrate → **rebuild** → serve, and the rebuild stops being optional. A release that skips it serves a product whose search is silently empty and whose tests all passed. P5's "a rebuilt index answers identically" test is what proves the rebuild is right
- [ ] 3.4 Tests: a member outside an exception's audience finds nothing searching for words that appear only in the restricted definition; changing visibility changes what is findable immediately; the rebuilt index and the incremental one still agree

## 4. Publishing

- [ ] 4.1 The community-level switch: `public_index_enabled` already exists and defaults false. With it off every public URL is 404 regardless of what is `world`, so a community can withdraw its public presence without unpublishing eleven artifacts one at a time. Switching it on is a steward act and is recorded
- [ ] 4.2 Publishing an artifact writes a decision record; **so does unpublishing**. Withdrawing something a community made public is as much a governance act as making it public, and a community that can do it silently has a gap in the record exactly where somebody will later ask
- [ ] 4.3 Publishing sets `first_published_at` if unset, and unpublishing leaves it — that is what 410 reads
- [ ] 4.4 The outward claim as its own shape: binary, gap list, standard version, last self-audit date, and **no readiness field on it**, so a public surface cannot render a percentage by accident rather than being asked not to
- [ ] 4.5 Attribution: `roles_and_counts` unless an attendee individually consented. No community-level setting may name somebody who did not
- [ ] 4.6 Tests: publishing and unpublishing both appear in the register; 410 for withdrawn, 404 for never-published, 404 for everything while the switch is off; a decision with no consenting attendees publishes its tally and no names; a community that sets its policy to names still cannot name a non-consenter

## 5. One renderer, then the public surface

- [ ] 5.1 **The artifact renderer, once.** An artifact with its adopted definitions, its local additions and its provenance, as a structured document — with three thin adapters: HTML for the page, Markdown for the bundle and the repository, print stylesheet for the PDF. Built here because groups 5, 7 and 8 all need it, and building it three times is how the export ends up saying something subtly different from the public page and both differ from what is in git
- [ ] 5.2 A test renders one artifact through all three adapters and asserts the same facts appear in each
- [ ] 5.3 The `(public)` route group — anonymous, outside the community layout, the first surface in the product with no `Ctx`. It resolves a community and an `Audience`, and never builds a member context
- [ ] 5.4 The index in the shape of RCOS Appendix C.6: published artifacts with layer, version and date; the compliance statement; what is private and why, in the community's own words; the standard version; a contact the community wrote
- [ ] 5.5 One page per published artifact, with local additions labelled *"community addition — not required by RCOS-Core v0.1"* — an auditor must be able to tell at a glance, and so must a new member
- [ ] 5.6 A community that has published nothing, with the switch on, says so rather than 404ing or showing an empty shell that reads as broken
- [ ] 5.7 Rate limiting per address on the public group, generous enough not to throttle a search engine indexing a community; `robots.txt` allowing the public group and disallowing every authenticated route; a sitemap per published community. UI spec §4.8 calls this free distribution for RCOS, and an index nobody can find is not distribution
- [ ] 5.8 **The public-surface crawl test**: every public route of a community holding both member-visible and world content, fetched anonymously, contains no member-visible fixture text. The percentage assertion is on the *shape* — no readiness field reachable from the public view model — plus no `\d+\s*%` next to a compliance word. A bare "no `%`" would fail on a community whose own published rule reads *"a change requires 80% of members"*, and a test that fires on legitimate content is a test somebody deletes
- [ ] 5.9 Mutation-check it: put the percentage on the public view model and watch the right test fail
- [ ] 5.10 a11y and 375px for every public page. It is the surface most likely to be opened on a phone by somebody who has never seen the product

## 6. Self-audit

- [ ] 6.1 `self_audit` — immutable, with the actor, the time and the snapshot as JSON. Nothing edits or deletes one
- [ ] 6.2 The act: computed from records only, changing no state. Readiness and compliance identical before and after, asserted rather than assumed
- [ ] 6.3 The snapshot's contents, all of them (UI spec §4.8): compliance, missing artifacts, uncovered clauses, provisional definitions with the interim rule, definitions past review, decisions frozen over unresolved objections, live exceptions with expiries, readiness per layer — and local definitions past review, listed separately and marked as not affecting compliance
- [ ] 6.4 The result page is member-visible, not public: it names what a community is restricting and why, which is exactly the thing an anonymous surface must not carry. The public index cites its **date** and nothing else from it
- [ ] 6.5 Previous audits stay listed so a community sees its own trajectory; the public index says plainly when there has never been one
- [ ] 6.6 Tests: it changes nothing; two runs on unchanged state agree; a member cannot run one; an audit still says what was true after the state moves; the snapshot is not reachable from any public route; nothing on it claims certification

## 7. Export

- [ ] 7.1 The bundle: Markdown through the renderer from 5.1, the register in full, JSON for machines, and a manifest naming the standard, version, community, date and which visibility levels it contains
- [ ] 7.2 PDF via headless Chromium against the app's own print stylesheet (`docs/00` §8). This is where Playwright becomes a runtime dependency on the server; kept as its own task so that if the memory cost bites, the bundle still ships without it
- [ ] 7.3 A produced-file record — path, community, expiry — rather than an `export_job` table. The queue already stores a job's kind, payload and status; what has nowhere to live is the file a later request resolves and a cleanup job removes
- [ ] 7.4 The signed link, derived from `BETTER_AUTH_SECRET` with a domain separator rather than a new required environment variable — a new required variable means every existing deployment fails to boot for a feature it may never use
- [ ] 7.5 Scoped to one community, expiring, audit-logged when issued and when used
- [ ] 7.6 The filter applies — a bundle contains only what its requester may see, and the manifest says which levels those were
- [ ] 7.7 Local definitions included and labelled. Leaving them out makes the export a misrepresentation of how the community governs itself; including them unlabelled lets an outsider read a house rule as a requirement
- [ ] 7.8 Produced files expire and are cleaned up; a job that fails part-way leaves no partial bundle and issues no link
- [ ] 7.9 Tests: **a plain test over the produced file, with nothing serving** — "readable without the app" cannot be demonstrated by a suite whose web server is running. It unpacks the bundle and asserts its decision count and one adopted definition match the register. Separately, an altered or expired link is refused, and a restricted definition the exporter may not see is absent

## 8. The git mirror

- [ ] 8.1 A local bare repository per community, created without anybody configuring anything — the durability promise has to reach the community that has never heard of GitHub and the one that does not trust it
- [ ] 8.2 The post-freeze job renders through 5.1 and commits. **After the transaction commits, never inside it**: a failing mirror must not block, delay or roll back governance
- [ ] 8.3 Download as a git bundle, which clones and shows one commit per decision
- [ ] 8.4 Optional remote: a steward links any git remote and the same commits are pushed there. Linking changes where history is copied to and nothing about what is in it
- [ ] 8.5 A `mirror_remote` row holding the URL, the encrypted credential, the key generation that encrypted it and the last push's outcome — not a `mirror_settings` table, because `git_mirror_enabled` already exists on `community` and duplicating it would give a community two switches that can disagree
- [ ] 8.6 The credential encrypted with a key derived from `BETTER_AUTH_SECRET`, write-only from the interface, absent from every log line, error body, export, dead-letter record and the admin console. Revocation is deleting the row, which stops pushes and keeps every commit. A rotated secret re-encrypts or reports that re-entry is needed — it must not silently become a value that fails as an authentication error
- [ ] 8.7 Retry with backoff; a persistent failure surfaces in settings saying what failed and when, without echoing the credential
- [ ] 8.8 The mirror obeys `visibleTo` — it is an outward path like any other. Restricted content is excluded unless the community opted in explicitly
- [ ] 8.9 Tests: a community that configured nothing still gets commits; the bundle clones and reads with git alone; a failing push leaves the decision frozen and findable; **decryption without the secret fails** — asserting the stored bytes merely differ from the plaintext would pass for base64; restricted content is not in the commits

## 9. i18n

- [ ] 9.1 Every interface string extracted, including the screens groups 4–8 added, which were written with message functions from 0.3. This is the tedious half and the half that decides whether the rest is real
- [ ] 9.2 German and Spanish translated, and **an untranslated string renders the English marked as untranslated** — a silent fallback is how a half-translated interface looks finished and stays half-translated for a year
- [ ] 9.3 The community's locale selects the standard's own words, which the vendored data already carries in all five; `localise()` already falls back and says so
- [ ] 9.4 A community's own definitions, decisions, rationales and posts are never translated, at export and on the public surface included
- [ ] 9.5 Tests: a German community reads German; an untranslated string is marked rather than substituted; changing the locale changes the interface and the standard and nothing else — not readiness, not compliance, not one definition

## 10. Closing it

- [ ] 10.1 The e2e spec from 0.1 passes end to end: switch on → publish → an anonymous visitor reads the claim and the gap list → export → the bundle opens without the app
- [ ] 10.2 The same at 375px, including the public index and the export request
- [ ] 10.3 Task 0.2's enumerating suite is green, and every row-returning read service added in groups 1–9 is in it
- [ ] 10.4 Every service added in this phase that is addressed by an id registered in `services/registry.ts`; for the rest — the public loaders, the export job, the mirror — the tenant *and visibility* boundaries asserted directly, the way P5 closed the same gap
- [ ] 10.5 a11y over the public index, the artifact pages, the exceptions screen, the self-audit result and the export screen at 375 / 768 / 1024 / 1440
- [ ] 10.6 Mutation-check the claims this phase rests on (`docs/06` §8a): that no read path returns member content to an anonymous audience, that the percentage cannot reach a public surface, that an unconsented name is never published, that the mirror credential never survives a failure report, that an expired exception actually reverts, and that a community with the switch off has no public surface. Break each, watch the *right* test fail, put it back
- [ ] 10.7 `docs/00`, `docs/03`, `docs/04` and `docs/06` updated wherever the build taught something the documents did not say — including `docs/03` §3's transparency exception, which is missing the audience field this phase adds — and the three decisions from 0.4 recorded
