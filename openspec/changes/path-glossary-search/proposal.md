## Why

The product's whole claim is turning 213 clauses into a short ordered list of
things a community still has to decide. P3 built the list; what it does not have
is a defensible *order*. Today it sorts by dependency edges and then by layer —
a reasonable default, and one nobody can argue with, because nothing tells a
community why anything is where it is or lets them disagree.

That matters more than it sounds. A landholding community with a founder who
owns the property has a different first month from an online collective, and an
ordering that ignores the difference will be wrong for both in ways they cannot
see. The UI spec is explicit about the alternative (§4.4): **the ordering rule is
a visible, editable, versioned settings object, not hidden logic.** The tool has
an opinion and says so out loud, which is more honest than pretending an
algorithm is neutral — and it makes the opinion arguable, which is the point.

The other half is retrieval. A community that has recorded fifty decisions and
adopted forty definitions has built something nobody can find their way around.
`searchDecisions` from P3 is substring matching over one table. What §4.6 asks
for is the **reverse lookup**: a member types *"can we spend €800 on the water
pump?"* and gets the clauses and decisions that govern it, with citations.
Governance that answers questions gets consulted; governance that has to be
browsed does not — and a register nobody consults is the same as no register.

Without this phase a community gets a correct list in an order it cannot
question, and a growing archive it cannot search. Both are the failure mode where
the work was done and the value did not arrive.

## What Changes

**The Path — an opinion, stated out loud**

- The four inputs from UI spec §4.4, each contributing a visible score:
  structural dependency, gap severity, risk profile, and what the community
  already has.
- **Gap severity is how much of the standard a gap holds up, not MUST-vs-SHOULD.**
  The spec's phrasing assumes both exist; RCOS-Core 0.1 has 185 MUST clauses, 18
  MAY, and **no SHOULD at all**, and the path only ever walks sections that own
  countable MUSTs — so the input as written would rank nothing. What does
  discriminate is how many clauses a section answers: they range from one to
  eight, and a section holding up eight requirements is a bigger gap than one
  holding up one. Same intent, against the content that exists.
- **Weights are a stored, editable, versioned settings object.** Changing them is
  an ordinary recorded act with an actor and a time, and the previous weights
  stay readable — the same treatment every other governance decision gets.
- **"Why this is here" is derived from the same inputs as the rank**, not written
  separately. A reason that can drift from the ordering is a reason nobody should
  trust, so both come out of one computation.
- Manual drag override, per community, surviving re-computation — with the
  overridden item still showing what the ordering *would* have said.
- The existing `path()` becomes the unweighted special case rather than being
  replaced, so a community that never opens the settings gets today's behaviour.

**The risk profile — a short interview, not a form**

- Four or five questions with real consequences: land, shared money, children on
  site, a founder-owner, whether the community meets in person.
- Each answer names the clauses it moves and why, at the moment it is answered.
  An interview that reorders a list invisibly is a worse version of hidden logic.
- Answerable later, changeable later, and skippable — a community that skips it
  gets the structural ordering and is told that is what it is getting.

**Search — one seam, one implementation**

- `SearchIndex` (`00-architecture.md` §5), with FTS5 behind it and nothing else
  in the application knowing how search works.
- Indexed: adopted definitions, decisions, discussion titles, and **document
  passages** — everything a community wrote. Every row carries `community_id`,
  and the boundary is enforced in the query rather than filtered afterwards.
- **Clause text is not indexed.** It is the same 213 rows for every community, so
  putting it in a per-tenant index would store the standard once per community
  and add a tenant-leak surface to data that is not tenant data. Clauses are
  matched against the already-loaded standard in memory and merged into the
  results.
- **Reverse lookup** — the plain-language question, answered with clauses and
  decision references and nothing else. It cites; it does not summarise, and it
  does not answer a governance question in its own words (UI spec §1.3).
- Global search across the whole community, from anywhere.

**Glossary — maintained by not being maintained**

- Every RCOS Appendix A term beside *this community's* definition where one has
  been adopted, from the glossary already vendored with the standard.
- **This needs an upstream content change first.** The vendored `glossary.yaml`
  carries 37 terms with nothing but their translations — no link from a term to
  the section that defines it. Without that link the community column is empty
  for every term and the page is a reprint of the standard. The mapping belongs
  in the standard's own annotation data, added upstream and re-vendored, exactly
  as P1 did for section dispositions (`docs/12`); the vendored copy is not a
  place to edit the standard, and a hash check enforces that.
- A page and a slide-over panel, because terms get hit while reading anything.
- **Auto-populated from adopted definitions.** A glossary somebody has to keep in
  step by hand is a glossary that stops being true.

## Capabilities

### New Capabilities

- `path-ordering`: the weighted ordering, its four inputs, the settings object
  that holds the weights, manual overrides, and the requirement that an item's
  stated reason comes from the same computation as its rank.
- `risk-profile`: the setup interview, what each answer moves, and what a
  community that skips it is told.
- `search`: the `SearchIndex` seam, what is indexed, tenant isolation inside the
  query, global search, and the reverse lookup's citations-only contract.
- `glossary`: RCOS terms beside the community's own adopted definitions, derived
  rather than maintained.

### Modified Capabilities

- `decisions`: `searchDecisions` is P3's substring scan over one table and
  becomes a caller of the search seam. The requirement that a decision is
  findable a year later stops being about one table's contents and becomes about
  the index — including that a decision reachable by search is only ever one the
  member's community recorded.

## Impact

**Schema** — `path_weights` (per community, versioned), `path_override`,
`risk_profile`, and the FTS5 virtual tables with their triggers. One migration.
The FTS tables are the first thing in the product that is not plain Drizzle, and
they live behind the seam for exactly that reason.

**Upstream content** — a term-to-section mapping in the RCOS standard data, added
in the website repository and re-vendored. This is a dependency on work outside
this repository and is the first task, because the glossary group cannot be
finished without it and finding that out in group 7 would be finding it out
late.

**No new dependencies.** FTS5 ships with SQLite; the ordering is arithmetic.

**Existing code** — `services/path.ts` gains the weighting and keeps its current
behaviour as the default; `decisions.searchDecisions` delegates; the dashboard's
*Your next 5* and the standard browser read the new order. The P3 loop is
untouched.

**Raw SQL** — `00-architecture.md` §5 forbids it outside `src/lib/server/db`, with
FTS5 named as the exception that lives behind an interface with one file per
engine. This is the phase that spends that exception, and the boundary should be
enforced the way the AI module's is: a rule, not a habit.

**Not in scope** — freeform Q&A over governance text. UI spec §10 is explicit
that it is the highest-risk AI surface in the product and that the grounded half
— the reverse lookup, which cites and does not answer — is what ships. Also out:
cross-community pattern analysis, and any ordering input that is not visible to
the community it reorders.
