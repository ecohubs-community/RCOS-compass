# Design — a question the community can move

## The problem, stated once

Two true things that cannot both be acted on:

1. A steward may freeze a version that is not the latest (`discussions` spec,
   "One version is selected, and the whole proposal panel follows it").
2. Only the latest version takes responses (`consent` spec, "A new version
   closes the previous version's round").

So an older version can be *recorded* but not *finished*. The tally a freeze of
v3 quotes is frozen in time at whatever moment v4 happened to be written — by
one member, without anybody agreeing that the question had moved.

## What was rejected

### B. A round open on every version at once

Delete the refusal in `respondableProposal`, stop superseding. Two lines of
code, and it breaks the thing the register exists for.

- A member could consent to v2 and object to v4. Neither response is wrong, and
  no honest sentence describes their position.
- "9 of 27 responded" stops naming a question. Responded to *what*? The freeze
  pre-fills from a round; with several live, it pre-fills from whichever version
  the steward happened to have selected, and nothing on the form can say whether
  the community was ever asked that one as a live question.
- RCOS consent is one question at a time. Concurrent rounds are not a smaller
  version of that; they are a different mechanism, and one this product has not
  specified.

### C. A superseded version keeps answering until its own deadline

Halfway: writing v4 stops *starting* new answers on v3 but lets the existing
round run down. This has every problem of B — two rounds genuinely open — while
also being harder to explain, because whether v3 still answers depends on
whether anybody happened to set a deadline on it.

## What is proposed, and why it is small

The refusal is correct. What is wrong is that it is attached to
`max(proposalVersion)` — a derived value, which makes "what are we deciding?" a
consequence of who typed last rather than something the community controls.

Name it instead:

```
discussion.current_proposal_post_id  →  post.id
```

Then:

- `respondableProposal` compares against that column. One version answers, as
  today.
- `writeProposal` moves it forward. The ordinary path is byte-for-byte the
  behaviour that ships now.
- `setCurrentProposal` moves it back, for a steward, recorded.

Everything downstream is unchanged, because everything downstream already keys
off a *selected* version rather than off the newest one — the rail, the tally,
the linter panel and the freeze were all rewritten that way by
`discussion-detail-rail`. This change finishes that job on the one axis it did
not reach.

## Reopening, precisely

`consent_round.status` is `open | closed | cancelled | superseded`, and the
closed ones are not the same thing:

| status | why it closed | reopen? |
|---|---|---|
| `superseded` | the text stopped being the question | **yes** — that is this change |
| `closed`, deadline reached | a time somebody chose has passed | no |
| `closed`, everyone answered | there is nobody left to ask | no — and nothing to gain |
| `cancelled` | not reachable today | no |

Two of those also apply to a *superseded* round, and each needs an answer:

- **A round superseded before its deadline, reopened after it.** `closeIfDue`
  runs on read as well as on write, so leaving the deadline on would close the
  round again the next time anybody looked at the page. The deadline is cleared
  as the round comes back, and the form says so before the click. A steward
  putting v3 back *is* asking the question again; a date nobody can still meet
  is not part of that question.
- **A round every eligible member had already answered.** Nothing to gather, and
  `closeIfDue` would close it again anyway. It stays closed — and the move still
  happens, because a steward moving the question back may be about to record
  that version, and the tally it holds is exactly what the freeze should quote.

**The state of a round never refuses the move**, and this is a correction. An
earlier draft refused both cases with *"ask the question again as a new
round"* — an instruction to do something the product cannot do. The form that
opened a round deliberately was removed when rounds began opening on the first
response, and `roundFor` reads **one** round per version, so a second round
would make every tally on the screen ambiguous. Refusing with an impossible
remedy is worse than not refusing: it leaves somebody stuck and tells them it is
their move.

Allowing more than one round per version is a real option and a larger one — it
changes what "9 of 27" names everywhere the number appears — so it is out of
scope here rather than quietly half-built.

Reopening keeps its `consent_eligible` rows. This is the one detail that must
not be got wrong: eligibility is a snapshot precisely so that "9 of 27" cannot
change meaning underneath a community, and re-snapshotting on reopen would
silently re-base a denominator members had already been given. Someone who
joined while v4 was the question is not eligible for v3's round. They become
eligible for whatever round opens next.

## Who is told

`createRound` notifies every eligible member that a proposal is open for their
response. Reopening creates no round, so as written it would notify nobody — and
the people whose live round just came back are precisely the people with
something to do.

Reopening therefore sends the same `consent.opened` notification, to the
eligible members who have **not** answered. Not to those who have: their
response is still counted and still theirs, and nothing is being asked of them
again. Nobody is notified about the round that *closed*; a closed round needs no
action, and the thread carries the post that says what happened.

## Three readers of "the latest version", and only one of them meant it

Naming the current version splits a phrase that has been doing two jobs:

| Reader | Meant | Today |
|---|---|---|
| `respondableProposal` | the question | newest |
| the rail's default `?v=` | the question | newest |
| `proposalToFreeze` fallback | the question | newest |
| `laterVersion` / "v4 is the text on the table" | newest, to warn the reader | newest |
| `listDiscussionSummaries.version` | newest, for "v4" on a row | newest |

The first three are wrong the moment the two differ, and the last two are right.
The freeze fallback is the dangerous one: a form submitted without a version id
would record v4's words under the tally the community gave v3 — the exact
failure `proposalToFreeze` was rewritten to prevent in `discussion-detail-rail`,
arriving through a different door.

## Moving the question is a post

`docs/03` §3 treats a revision note as an event in the thread rather than as
metadata, for the reason that the thread is what a member reads. Moving the
question is at least as consequential as a revision — it changes what the
community is being asked — so it takes the same shape: a post, attributed,
saying where the question went and why, if a reason was given.

This also makes the act self-documenting in the one place a freeze is argued
about later: the thread.

## What a member sees

The rail's version buttons gain a third state. Today a button is *never frozen*,
*frozen and in force*, or *frozen and superseded*. Now a never-frozen version is
either **the question** or **a draft**:

```
  v1   v2   v3   v4
  ·    ·    ◎    ·          ◎ the question — this is what responses attach to
                            · a draft, or a version the community moved past
  v4 exists and is readable. Nobody is being asked about it.
```

Without this, the rail would have to claim v4 is the question because it is
newest, while the response form sat on v3 — which is the kind of disagreement
between two parts of one screen that teaches people to distrust both.

## No new provider methods, and no provider import either

`VotingProvider` is `openRound`, `respond`, `tally`. Supersession is not on it:
`writeProposal` updates `consent_round` directly, in its own transaction,
because closing a round is part of writing a version rather than part of voting.
Moving the question back is the same act in reverse and goes the same way.

Adding `supersede`/`restore` to the interface would be a seam with one caller
and one implementation, invented for a second provider nobody has specified —
and it would have to be implemented by that provider before it could refuse to
support the feature, which is the wrong way round.

The implementation found a second, sharper reason. `tests/integration/consent.test.ts`
asserts that **nothing outside `voting/` imports `voting/consent-round`** — the
whole value of the interface being that a second provider changes one module.
The reopen helpers therefore live in `services/discussions.ts` beside the
supersession that is already there, reaching the tables through the schema
rather than through the provider. Same decision, arrived at twice.

## Answering is not an ending

`closeIfDue` closed a round the moment the last eligible member responded. The
reason written beside it was that *"a community of nine should not wait three
days for a deadline once the ninth person has responded"* — and nothing was ever
waiting. A round informs a freeze; a person presses Freeze. The tally is
complete the instant the ninth answers, whether the round is open or shut.

What closing bought was nothing, and what it cost was the round's own point.
`respond` refuses a closed round, so the ninth member took the other eight's
right to change their mind away with them — silently, by being last. A member
who hit it was looking at the answer they had given, with three live buttons
that did nothing.

So a round now closes at its deadline, when the version it belongs to is
superseded, or at the freeze. Never because the answering finished.

This also removes the last reason `reopenSupersededRound` had to refuse: a round
everybody had answered used to stay shut, because reopening it produced a state
`closeIfDue` undid on the next page view. Nothing undoes it now.

## Risks

- **A steward could park a community on a version members have moved past.** It
  is visible (the thread carries the post) and reversible (move it forward
  again), and it is the same shape as every other steward power in the matrix:
  recorded, not prevented. `docs/04` §1's line is that stewards record and
  members propose — this is recording.
- **The backfill must be exactly today's behaviour.** Highest
  `proposal_version` per discussion, null where there are no proposals. Any
  other choice silently changes which version answers for every existing thread.
- **The column has no foreign key**, matching `discussion.frozen_decision_id`
  beside it. `post.discussion_id` already references `discussion` on cascade, so
  a constraint pointing back is a cycle; the table has been avoiding it in the
  same place for the same reason. The cost is that a stale id is possible in
  principle — and posts are never deleted in this product, so in practice it is
  the cheaper of the two.
- **A round with no deadline now never closes on its own.** That is the
  intended trade: it ends when the text is replaced or when somebody records it,
  both of which are acts a person takes. A thread abandoned mid-round leaves an
  open round behind, exactly as a thread abandoned mid-discussion leaves an open
  discussion — the Path's "quiet for over 12 days" is what surfaces both.
- **`current_proposal_post_id` and the round's `proposal_post_id` can disagree
  if either write escapes its transaction.** Both moves — forward in
  `writeProposal`, back in `setCurrentProposal` — set the column and touch the
  round in one commit, and the tests assert the failure case leaves neither.
