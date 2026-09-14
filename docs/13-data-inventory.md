---
status: living document — the privacy policy is written from it
---

# 13. What personal data this product holds

Written from the schema, not from memory, and checked by
`tests/unit/data-inventory.test.ts`: a table that stores a name, an address or an
IP and is not listed here fails the suite. The privacy policy in
`content/legal/privacy.md` is written from this document, so a change here is the
thing that makes the policy wrong until it is updated too.

Three questions per table: what it holds, why it holds it, and what erasure does
to it. Where the answer to the third is "nothing", that is stated rather than
omitted — the tables erasure does *not* touch are the interesting ones.

## 1. The person

| Table | Holds | Why | On erasure |
|---|---|---|---|
| `user` | name, email address, avatar, locale | To sign in and to be named to other members | Name, address and avatar are cleared; the address becomes a non-routable placeholder derived from the id. `erased_at` is set. **The row stays**, because the memberships that prove who attended a decision point at it. Nothing about the released address is kept — not the address, not a hash of it |
| `session` | IP address, user agent | To end a session that is no longer the person's, and to show them where they are signed in | Deleted outright |
| `account` | credential hash, provider link | To authenticate | Deleted outright |
| `two_factor` | TOTP secret, backup codes | Second factor for platform admins | Deleted outright |
| `verification` | address, token | To confirm an address or reset a password | Deleted outright, matched on the address |

## 2. The person inside a community

| Table | Holds | Why | On erasure |
|---|---|---|---|
| `membership` | `display_name` — the name they chose in this community; `seq`, their number | To name them to other members, and to keep naming them after they are gone | `display_name` is cleared. The row and its number stay: the number is what `Former member (M-0142)` is made of, and the row is what makes a tally true |
| `invitation` | an email address, possibly of somebody with no account | To invite them | Any invitation still open to that address is revoked. Accepted and revoked ones keep the address, which is a known limit: they are the record of who was invited to a community and by whom |
| `notification` | `recipient_membership_id` | To deliver a notification | Untouched: it names a membership, not a person |
| `ai_call`, `ai_usage` | `actor_id` | To hold one member to their share of a budget | Untouched: an id, and the id survives as a tombstone |

## 3. What a community wrote

Free text a member typed can contain anybody's name, and no schema can prevent
that. It is reachable by **redaction** — `src/lib/server/services/redaction.ts` —
which replaces the span in place and records that it did.

| Table | Holds | Why | On erasure |
|---|---|---|---|
| `definition_version.body`, `plain_language` | the community's own rules | It is the product | Not automatic. Redactable on request |
| `decision.proposal_text`, `rationale` | what was decided and why | It is the register | Not automatic. Redactable on request; the ref, date, mechanism and tally never are |
| `post.body`, `objection.reason` | discussion | Where a name is most likely to be typed | Not automatic. Redactable on request |
| `decision_attendee.external_name` | somebody present who was never a member | A facilitator or a neighbour was in the room | Not automatic — they have no account and no way to ask us. Redactable on a request that reaches a steward. **The most exposed personal data here** |
| `document`, `passage` | uploaded bylaws, and their text | A community's existing rules, mapped to clauses | Not automatic. A filename can carry a name; deleting the document removes both |
| `document_file_version.filename`, `uploaded_by`, `superseded_by` | earlier files of a document, who uploaded each and who replaced it | So a mistaken or harmful replacement can be restored | Not automatic. The file stays until a steward deletes that version or the document; erasure tombstones the user row, so the names render as a former member through `personLabel`. The same holds for `document.scan_actor` and `document.mapping_done_by` |
| `evidence.reason` | a model's one-sentence reason for a suggestion | Shown instead of a strength, so a member can judge the suggestion | Not automatic. Written from the document's own text, so it can repeat a name the document contains; it goes with its evidence |

## 4. Operating the instance

| Table | Holds | Why | Retention |
|---|---|---|---|
| `audit_event` | `actor_id`, `actor_email`, `ip`, `user_agent` | The security and administrative record: sign-in failures, role changes, exports, every admin act | **Kept for the life of the instance.** Erasure clears `actor_email` on that person's events; the id, the IP and the action stay. Shortening this is a security decision as much as a privacy one, and it has not been taken — see §5 |
| `rate_limit_bucket` | the client address, inside a key like `login:ip:203.0.113.4` | To stop credential guessing | Windows expire and are swept; nothing is kept beyond the window |
| `error_report` | scrubbed message, route, request id, community | To make failures visible to an operator | 30 days |
| `mail_failure` | message kind, community, what it was for | To make delivery failures visible | 30 days. **Never the recipient's address** |
| `funnel_event` | community, milestone, time | To answer "does onboarding work" | Kept. No member, no path, no session — one row per community per milestone, enforced by a unique index |
| `feedback_report` | a member's own words, the route, their membership | So a pilot's feedback becomes work | Open reports are kept; handled ones are removed 30 days after being handled |
| `produced_file` | filename, `requested_by` | An export somebody asked for | Removed at expiry, file and row together |

## 5. What has not been decided

- **How long an audit event may keep an IP address.** There is no retention rule
  today and this document is where the absence became visible. The trail is the
  instance's security record: a sign-in failure from six months ago is how a slow
  credential-stuffing attempt is recognised, and a short retention would remove
  that. The working answer for the pilot is that it is kept, stated here and in
  the privacy policy, and revisited before general availability.
- **Accepted and revoked invitations keep the address.** Revoking on erasure
  covers the open ones; the rest are the record of who was invited and by whom.

## 6. Third parties

Whatever is in `content/legal/sub-processors.md`, which is written from the
instance's own configuration rather than from a list somebody maintains
separately. If no AI provider is configured, no inference happens and no text
leaves the building; if one is, the policy names its region, because German
hosting with a US endpoint is a third-country transfer and not a footnote
(`docs/00-architecture.md` §12a).
