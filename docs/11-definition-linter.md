---
status: draft for discussion
version: 0.1
date: 2026-09-01
source: "Writing Good Definitions — Enforceable, Interpretive, Expressive" —
  Notion (app.notion.com/p/…37a1e56b16dc80fd9c06e35c8f318944), local copy in the
  EcoHubs vault. This document is the implementable rule set derived from it, not
  a copy of it; when the guide changes, this changes with a note.
---

# The Definition Linter — rule set

The guide is prose for humans deciding what to write. This is the same thinking
as **rules a machine can run and a test can pin down**. The guide stays the
source of truth for *why*; this file is the source of truth for *what the code does*.

Deliberately kept as a derivation rather than a second copy of the guide — the
prose lives in one place, and the rules live where they can be tested.

---

## 1. What the linter is and is not

- It runs on a **draft**, live, and on a **proposal** on request.
- It **never blocks** a freeze. It is advice; a community may adopt a definition
  the linter dislikes, and the linter result is stored with the version so the
  disagreement is visible later.
- The **rule-based rules below must run with `AI_PROVIDER=null`.** Only the two
  rules marked `ai-assist` degrade without a provider, and they degrade to
  silence, never to a guess.
- Output is a list of findings: `{ rule, severity, message, span?, suggestion? }`.
  Severities: `blocker-shaped` (⚠, the definition probably does not do its job),
  `note` (◦, worth a look), `ok` (✓, an affirmative check that passed — shown,
  because the mockup shows passing checks and they build confidence).

---

## 2. Step one: the line, and the job it does

**The unit is the line, not the definition.** This section used to say the author
picks one type for the whole body, and its own message already said *"what job
this **line** does"* — the wording was right and the implementation was not. A
definition mixing a rule and a value is ordinary, and one label for the whole of
it leaves every line the label does not fit unchecked.

A body is split into sentences (within paragraphs, and per list item). Each line
gets exactly one job, or none:

| Job | The test | What it means |
|---|---|---|
| **Enforceable** | a decision or an audit changes | somebody is bound, and something turns on it |
| **Interpretive** | an ambiguous call loses its default | a trade-off, framed "X over Y by default" |
| **Expressive** | who we attract changes | says who the community is, binds nobody |
| *(none)* | nothing changes | clutter — see §7 |

**Nobody declares a job.** The linter infers it, records that it inferred it, and
assigns one only on an unambiguous read. Anything else stays unlabelled, because
an inferred *Expressive* on a line that actually binds tells a reader the line is
safe to ignore — worse than no badge at all.

Inference, exactly:

- an explicit non-binding marker → **Expressive**
- a trade-off **and** a default → **Interpretive**
- a subject **and** a consequence, or a subject and a named process and
  obligation language → **Enforceable**
- identity language → **Expressive**
- otherwise → none

Deliberately *not* subject + obligation on its own: that is the ambiguous middle
(§7), and calling it enforceable would silence the rule that matters most.

**The definition's type is derived, never chosen.** It is the strongest job among
its lines — Enforceable, then Interpretive, then Expressive — because a body with
four values and one rule is, to anyone bound by it, an enforceable definition.
Taking the commonest instead would demote an enforced rule into a value by
arithmetic, which is the anti-pattern §7 warns about.

| Rule | Check | Severity |
|---|---|---|
| `type.mismatch` `ai-assist` | The rule set and the assisted pass read the same body as different jobs | ◦ *The rule set reads this as X; a closer look reads it as Y.* |

---

## 3. Enforceable rules

The test: **could an auditor check, yes or no, whether we are following it?**

| Rule | Check | Message |
|---|---|---|
| `enf.subject` | A subject is identifiable — who or what it binds | ✓ *Has a subject — "a person admitted by the Welcome Circle"* / ⚠ *Who does this bind? A rule with no subject binds everyone and no one.* |
| `enf.process` | A process or mechanism is named | ✓ *Has a process — consent decision of the assembly* / ⚠ *How does this happen, and who does it?* |
| `enf.consequence` | A consequence is stated for the rule being met **or breached** | ⚠ *No consequence if the criteria are not met — what happens to a candidate the assembly does not confirm?* |
| `enf.recorded` | Names where it is recorded, or is itself in a versioned artifact (the app satisfies this by construction — passes with a note explaining why) | ✓ *Recorded here, versioned, and visible to every member.* |
| `enf.auditable` `ai-assist` | Could a yes/no check be written against this text? | ⚠ *An auditor could not check this yes or no. What would they look at?* |

`enf.auditable` is the rule that implements RCOS §2.4.3 — identity constraints
MUST be *testable*. It is the most valuable rule in the set and the one most
likely to annoy people, which is usually the same thing.

---

## 4. Interpretive rules

The test: **when two good things conflict, does this say which way to lean — and
can a decision override it with a recorded reason?**

| Rule | Check | Message |
|---|---|---|
| `int.tradeoff` | Expresses a trade-off — an "X over Y" shape | ⚠ *An interpretive principle names a trade-off. What is this choosing between?* |
| `int.default` | Contains "by default", "generally", "unless" or equivalent | ⚠ *Say this is a default. Without that word it reads as absolute, and real situations will break it.* |
| `int.overridable` | States that an override must be recorded | ◦ *Can a decision override this? Say so, and say that the reason gets recorded.* |
| `int.absolute` | Contains "never", "always", "MUST", "MUST NOT" | ⚠ *This is written as an absolute. If it is a rule, mark it Enforceable; if it is a lean, soften it.* |

---

## 5. Expressive rules

The test: **if we deleted it, would it change who we attract — even though no
decision or audit would change?**

| Rule | Check | Message |
|---|---|---|
| `exp.nonbinding` | Carries an explicit aspirational / non-binding label | ⚠ *Label this non-binding. An unlabelled value sitting next to real rules is exactly the opening for coercion.* |
| `exp.obligation` | Contains obligation language ("must", "are expected to", "shall") | ⚠ *This is written as an obligation. Either make it Enforceable with a process, or drop the obligation words.* |

---

## 6. Rules that apply to every type

| Rule | Check | Message |
|---|---|---|
| `all.vague` | Vagueness word list, per language | ⚠ *Vague word: "regularly" — say how often, or this becomes an argument later.* |
| `all.kill` | **"What breaks if we delete this line?"** — a heuristic pass: no subject, no trade-off, no identity signal, and no obligation | ◦ *If this line were deleted, what would change? If nothing, it is clutter — and clutter dilutes the lines that do matter.* |
| `all.duplicate` | Text substantially overlaps an adopted definition elsewhere in this community | ◦ *This is already binding in [Exit & separation]. Point to it rather than restating it — a re-stated MUST starts to look optional.* |
| `all.layer0` | Touches purpose, scope, invariants or identity constraints | ◦ *This touches Layer 0. It needs the constitutional decision path (§2.1.3 / §2.3.6 / §8.1.4), not an ordinary freeze.* |
| `all.plain` | A plain-language mirror exists and is not a copy of the body — **only on a surface that has the field** | ⚠ *Add what this means in practice. Most forgetting is that nobody rereads governance prose.* |

**`all.plain` has three input states, not two.** A definition draft or version
carries a plain-language field, so an empty one is worth a warning. A *proposal*
in a discussion thread is one text and has no such field anywhere in the
interface — so the caller passes no `plainLanguage` at all and the rule stays
silent. It previously fired on every proposal ever written, with nowhere for the
reader to act on it, which is how a panel teaches people to stop reading it.

### 6.1 The vagueness list

English seed list: *regularly · as needed · reasonable · when appropriate · in a
timely manner · as soon as possible · sufficient · adequate · significant ·
material · the community will decide · normally · usually · where possible ·
best effort · from time to time · appropriate · relevant · substantial*.

Per-language lists live beside it (`de`, `es`, `fr`, `pt-br`) and are authored,
not machine-translated — vagueness is idiomatic. A language with no list yet runs
every other rule and skips this one, visibly: *"vagueness checks are not
available in this language yet."* Silently skipping would be worse than not
running.

### 6.2 What the vagueness finding must NOT say

No cross-community statistics ("three of eleven communities read this as
monthly") until the opt-in pattern library exists. See UI spec §6.2 — the flag
ships, the claim does not.

---

## 7. Two cautions from the guide, as rules

1. **`line.clutter`** is the fourth outcome of §2's table, and the quietest rule
   in the set. It fires when nothing about the community changes if the line is
   deleted: it binds nobody, frames no trade-off, says nothing about who the
   community is, and adds nothing to a definition already adopted — in which case
   it names what it duplicates, implementing *"don't demote an enforced rule into
   a value"*.

   **"Binds nobody" means no subject at all, not "no subject and no process".**
   A line naming somebody it could bind is exactly the line that might bind them
   by accident, and *delete it* is the one piece of advice that must never be
   given about a line that might bind. A line that finishes the sentence before
   it — "If they do not, the departure is not recorded" — is spared for the same
   reason: the unit is the sentence, so a rule and its consequence arrive as two
   lines and the second one carries no subject of its own.

   The duplicate half of this rule needs the community's adopted definitions
   passed in (`adoptedElsewhere`). Both callers — the definition draft and a
   proposal on write — supply them; a caller that does not gets the generic half
   only, which is advice worth much less. It is advice (◦), never blocker-shaped, because it is the one rule
   that tells a community to delete its own words: being wrong about "this line
   has no consequence" is a correction; being wrong about "this line does
   nothing" is telling somebody what they wrote does not matter.

2. **`line.ambiguous-middle`** implements *"beware the ambiguous middle"* — a
   line that sounds binding but has no test is the dangerous case, because it
   will be enforced informally, by whoever feels strongly.

   This was three rules acting in concert (`type.mismatch` + `int.absolute` +
   `exp.obligation`), which could only work once an author had chosen a type for
   the rules to disagree with. The case the guide actually warns about is an
   **unlabelled** line sitting beside real ones, and no amount of disagreeing
   with a label reaches it. It is one rule now: language that binds, nothing
   checkable, and no non-binding marker.

   Its remedy is three buttons — make it enforceable, label it non-binding,
   delete it — offered together with none preferred. Binding a line, marking it
   as a value and cutting it are three different governance acts, and only the
   community can make one. `line.clutter` never fires on a line this rule has
   already reported: that line's problem is that it *may* bind, and telling
   somebody to delete a possible rule is the wrong advice entirely.

---

## 8. Tests

Table-driven fixtures, one per rule, each with a passing and a failing example
drawn from the guide's own good/anti-pattern examples:

- *"Transparency MUST be the default for treasury balances"* → Enforceable, passes
  subject/process, flags nothing.
- *"We value diversity"* marked Enforceable → `enf.subject`, `enf.auditable`,
  `type.mismatch`.
- *"Transparency over control, by default; an override is recorded with its
  reason"* → Interpretive, clean.
- *"We never delegate authority"* marked Interpretive → `int.absolute`.
- *"Members are expected to show up with humility"* marked Expressive →
  `exp.obligation`.
- *"Candidates attend the assembly regularly"* → `all.vague`.

Every rule ships with its fixtures in the same commit
(`06-testing-strategy.md` §1). The rule-based set runs in CI with no AI provider.
