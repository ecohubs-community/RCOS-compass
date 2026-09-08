## 0. The target, and the two registries this phase depends on

- [x] 0.1 Write the exit spec first: a person is erased and the register is byte-for-byte unchanged; a community reads the privacy policy and it says what the code does; an operator sees a broken thing on `/admin/status`; the loop runs at 375px by keyboard; a snapshot is restored elsewhere and a mapped document opens. Failing until group 9
- [x] 0.2 `tests/support/person-surfaces.ts` — the enumerating registry of every service that returns a person, empty and already asserting that the list covers the services the code exports. It is written before `personLabel` exists, for the same reason P6 wrote the read-path registry before the filter: a list assembled after the work is a list of what somebody remembered
- [x] 0.3 `tests/support/routes.ts` — the route enumeration the accessibility work needs, listing every route on disk with its scan state, and failing on a route that is neither scanned nor exempt with a reason
- [x] 0.4 Tests: both registries fail loudly when a service or a route is added and not listed — proved by adding one in the test itself, not by trusting the mechanism

## 1. Schema, and the number a person keeps

- [x] 1.1 Migration, additive: `user.erased_at`, `user.erased_by`; `membership.seq`; `error_report`; `funnel_event`; `legal_review`; `feedback_report`. Nothing that requires a table rebuild — P6's migration lesson is that drizzle-kit's rebuild strategy cascades DROPs inside the migrator's transaction, where `PRAGMA foreign_keys=OFF` is a no-op
- [x] 1.2 Backfill `membership.seq` per community ordered by `joined_at`, then the unique `(community_id, seq)` index. The oldest member of each community is `M-0001`
- [x] 1.3 Allocate `seq` on membership creation the way `decision.seq` is allocated — `max + 1` inside the transaction that creates the membership, so two people accepting invitations at once cannot collide
- [x] 1.4 Tests: a migration-upgrade test over a database seeded with the previous schema, asserting every membership gains a number, no row is lost, and the numbers are unique per community; two concurrent joins get different numbers

## 2. One way to render a person

- [x] 2.1 `personLabel()` — the single function that decides between a display name, a real name, `Former member (M-####)` where a community is in scope, and `Erased account` where none is. The platform audit trail spans communities, and a global number for a person who asked to be forgotten is the thing scoping the label to a community avoids
- [x] 2.2 Route every service that returns a person through it, and register each in `person-surfaces.ts`: members, attribution, decisions, discussions, documents, notifications, the audit trail, self-audit, export, mirror, public pages
- [x] 2.3 Tests: the registry runs each service against an erased person and asserts the label; **mutation-check it** by making one service bypass `personLabel` and watching that service's entry fail rather than the whole suite going red in a way nobody can read

## 3. Erasure

- [x] 3.1 `erasePerson()` — profile cleared, **every `membership.display_name` cleared with it**, sessions and credentials deleted, verification tokens gone, `erased_at` and `erased_by` set, in one transaction. Nothing retained about the address, including a hash of it
- [x] 3.2 Refuse erasure while the person is the sole owner of a community, with a refusal that says to transfer ownership first; refuse it for the last platform admin, because an instance with no administrator cannot be restored
- [x] 3.3 The account screen a person asks from, and the platform-admin path for a request that arrives by email — both writing the same audit event, which names the actor and the membership label and never the erased person
- [x] 3.4 Reach the copies a rendering function cannot: clear `audit_event.actor_email` on that person's events and correct the column's comment, which currently justifies itself by a deletion that no longer happens; revoke every open invitation to the erased address
- [x] 3.5 Tests: the register is byte-for-byte identical afterwards (compare the serialised rows before and after, not a spot check); an attended decision keeps its tally; sessions issued before are refused; the address registers again as an unrelated account; the sole owner is refused and succeeds after transferring; nothing in the audit trail, the logs or a notification carries the erased name or address; a pending invitation to that address can no longer be accepted, and another member's is untouched

## 4. Correction and redaction

- [x] 4.1 Correction: superseding a definition version with a reason, which already has most of its machinery — the task is the reason and the change-log entry, not a new mechanism
- [x] 4.2 Redaction: replacing a named span in a stored body with the marker, steward-only, over **any body a member wrote** — definition bodies, decision rationales and proposal text, discussion posts, objection reasons, an external attendee's name. Scoping it to definitions and decisions was the first draft and too narrow: the place somebody types another person's name is a discussion, not an adopted rule
- [x] 4.3 The change-log entry for a redaction records that one happened and by whom, and never what was removed
- [x] 4.4 Reindex in the same transaction as the body — the search index holds its own copy, and a redaction that skips it leaves the name findable through a search box after it has gone from the page
- [x] 4.5 Re-commit the mirror after a redaction so the current state carries the marker, without rewriting git history
- [x] 4.6 Stop the mirror writing a person's name into commit bodies: the body names the membership label from now on. A P6 defect this phase surfaced — the author field was reasoned about and the message body was not — and one that erasure cannot fix retrospectively, because this design also refuses to rewrite a community's history
- [x] 4.7 An external attendee — present, never a member, no account and no way to ask us for anything — is rendered by the same function and reachable by redaction
- [x] 4.8 Tests: a member is refused; a redaction against a tally is refused; the change-log entry does not contain the redacted text — **mutation-check by putting the removed span into the entry's summary and watching the test fail**; the mirror's next commit carries the marker and the history is intact; a search for the redacted words returns nothing; a freeze commits a body naming `M-####` rather than a person

## 5. The documents, and the inventory they come from

- [x] 5.1 `docs/13-data-inventory.md` — every table holding personal data, what it holds, why, retention, and what erasure does to it. Written from the schema, not from memory, and including the ones that are personal data without belonging to an account: `rate_limit_bucket.key` carries client addresses, and an uploaded filename can carry a name
- [x] 5.2 The test that fails when a table with a name, email or IP column is missing from the inventory
- [x] 5.2b State a retention for `audit_event.ip` and `user_agent` in the inventory. There is none anywhere today, and the trail is the security record — so the answer is written down and argued for here even if no sweep enforces it in this phase
- [x] 5.2c Every screen this phase adds uses Paraglide message functions from the first line. The P6 ratchet fails when the untranslated count grows, and this phase adds seven screens
- [x] 5.3 `content/legal/privacy.md` — including the erasure-versus-register position verbatim, the AI region, and the plain statement that a bundle already exported cannot be reached by a later redaction
- [x] 5.4 `content/legal/pilot-terms.md` and `content/legal/sub-processors.md` — German hosting, export and deletion on request, no DPA yet; the sub-processor list naming what this instance actually talks to
- [x] 5.5 `/privacy`, `/terms`, `/sub-processors` — anonymous, linked from the public pages and from an application footer, **which does not exist yet**: only the public group has one, so the authenticated shell gains its own
- [x] 5.6 `legal_review` keyed by content hash, the admin action that marks a version reviewed, and the draft banner rendered from that state rather than typed into the file. The Markdown is pulled in with Vite's `?raw` rather than read from disk at runtime — nothing copies `content/` into a built bundle, and that failure appears in production and never in development
- [x] 5.7 Tests: a document nobody reviewed carries the banner; marking it reviewed removes it; **editing one character brings it back** — the property the content hash exists for; a steward cannot mark one reviewed; the privacy policy contains the erasure paragraph, asserted against the same words the erasure code implements

## 6. Licence and attribution where the content goes

- [x] 6.1 Render `meta.yaml`'s licence, attribution and source in the export's readme and manifest, on the public pages, and in the application footer beside PolyForm NC
- [x] 6.2 Tests: a bundle names both licences; a public artifact page carries the attribution; a standard whose metadata names different terms carries those instead of a hard-coded string

## 7. Observability

- [x] 7.1 `error_report` written from `handleError`, fingerprinted by error name plus the top frames, grouped with a count and first/last seen, scrubbed through the logger's own redaction module rather than a second copy of the rules
- [x] 7.2 Retention sweep for error records, on the existing cleanup job pattern
- [x] 7.3 Record a failed mail send — kind, community, what it was for, the error, and never the recipient's address. Nothing records them today, so the panel `docs/05` §3.5 asks for has no data behind it
- [x] 7.4 The seven funnel milestones from `docs/00` §12, written `on conflict do nothing` inside the transaction that makes each true, with `PRODUCT_ANALYTICS=off` skipping the write — the flag added to the typed config module, because nothing in this codebase reads `process.env` directly
- [x] 7.5 `/admin/status` gains recent errors, mail delivery failures, AI usage this month across tenants, and the funnel — counts and sizes only, no payloads. **Usage, not spend**: `ai_call` records tokens and no price, and money computed from a price list nothing maintains is worse than a count. A cost column appears only if a price list is ever configured
- [x] 7.6 Tests: an error is recorded and the response is unchanged; a failure to record does not fail the request; four hundred occurrences are one entry; a message carrying a definition body is stored scrubbed — **mutation-check by removing the scrubbing and watching that test fail**; a milestone is written once; with analytics off nothing is written and nothing else changes; a failed send is recorded without the address; the status page shows no monetary figure while no price list exists; a non-admin gets 404

## 8. Durability

- [x] 8.1 `pnpm snapshot` — `VACUUM INTO` plus the upload tree into one timestamped directory, takeable while serving
- [x] 8.2 `pnpm restore` — both halves, refusing to run against a database an instance holds open, and refusing a snapshot missing either half. It removes the target's `-wal` and `-shm` first: a stale write-ahead log beside a restored database resurrects the pages the restore was meant to replace
- [x] 8.3 The drill as an integration test: seed a community with a mapped document, snapshot, restore into a scratch directory, open the restored database and read the passage and its file back
- [x] 8.4 Tests: the drill itself, plus **the mutation that proves it** — omit the uploads from the snapshot and watch the drill fail rather than pass on the database alone

## 9. Accessibility

- [x] 9.1 The `mobile-small` Playwright project at 375×667, scoped to the core-loop and a11y specs — a fifth project running all 250 tests would add minutes to every run to re-prove what does not depend on the viewport
- [x] 9.2 Every route scanned or exempt-with-reason, using the group 0 registry; the screens P5 and P6 added scanned at every viewport
- [x] 9.3 Focus moves to the page heading after navigation; the keyboard walk asserting every interactive element is reachable, has a visible focus indicator and does not trap focus; a dialog returns focus to what opened it
- [x] 9.4 The token contrast test, asserting every foreground/background pair in `app.css` clears AA at its intended size
- [x] 9.5 Fix what 375px and the keyboard walk find. This is the task most likely to grow, and the one whose findings are worth the phase
- [x] 9.6 Tests: the loop passes at 375px; no page scrolls horizontally there; a deliberately unreachable control fails the keyboard walk; a token darkened below the threshold fails the contrast test

## 10. Pilot feedback

- [ ] 10.1 `feedback_report`, the reporting control on every screen, and the service that stores the route, the kind and the member's words and nothing else
- [ ] 10.2 The steward's list for their own community, and the platform-admin view across the instance
- [ ] 10.3 The Markdown export of open reports, grouped by route and kind, shaped so a proposal starts from it
- [ ] 10.4 Tests: a report from a screen with a half-written definition on it contains none of that text; an anonymous submission is refused; another community's report is 404; a handled report is not in the export; an erased reporter renders as a former member and the report keeps its words

## 11. Closing it

- [ ] 11.1 The group 0 exit spec passes end to end
- [ ] 11.2 A consolidated mutation pass over the phase's guards — the person registry, the redaction change-log entry, the error scrubbing, the snapshot's uploads, the review-state hash. Break each property, watch the *right* test fail, restore
- [ ] 11.3 Update `docs/07-spec-review-log.md` rows 19, 23 and 32 to what shipped, and `docs/08-roadmap-mvp.md`'s P7 section to what was built rather than what was planned
- [ ] 11.4 The pilot pre-flight, as a document rather than a screen: what must be true before a real community is seeded — legal documents marked reviewed, a restore drill run against the actual target, mail deliverable, backups verified. The seeding itself is not this phase's to do
