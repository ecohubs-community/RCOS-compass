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

A round has three closed states and they are not the same:

| status | why it closed | reopen? |
|---|---|---|
| `superseded` | the text stopped being the question | **yes** — that is this change |
| `closed`, deadline reached | a time somebody chose has passed | no |
| `closed`, everyone answered | there is nobody left to ask | no — and nothing to gain |

Reopening a superseded round keeps its `consent_eligible` rows. This is the one
detail that must not be got wrong: eligibility is a snapshot precisely so that
"9 of 27" cannot change meaning underneath a community, and re-snapshotting on
reopen would silently re-base a denominator members had already been given.
Someone who joined while v4 was the question is not eligible for v3's round.
They become eligible for whatever round opens next.

A round closed by its deadline stays closed. A steward who wants that question
asked again opens a fresh round on it, which is a new denominator honestly
declared, rather than a dead round brought back with an old one.

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

## Risks

- **A steward could park a community on a version members have moved past.** It
  is visible (the thread carries the post) and reversible (move it forward
  again), and it is the same shape as every other steward power in the matrix:
  recorded, not prevented. `docs/04` §1's line is that stewards record and
  members propose — this is recording.
- **The backfill must be exactly today's behaviour.** Highest
  `proposal_version` per discussion, null where there are no proposals. Any
  other choice silently changes which version answers for every existing thread.
