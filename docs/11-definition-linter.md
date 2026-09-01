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

## 2. Step one: the type

The author picks **Enforceable / Interpretive / Expressive**; the linter may
disagree and say so. Everything after this branches on the answer.

| Rule | Check | Severity |
|---|---|---|
| `type.missing` | No type selected | ⚠ *Say what job this line does: does it bind, guide, or describe?* |
| `type.mismatch` `ai-assist` | Text reads as a different type than the one chosen — e.g. marked Expressive but contains "MUST" | ◦ *This is labelled aspirational but reads as a rule. Which is it?* |

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
| `all.plain` | A plain-language mirror exists and is not a copy of the body | ⚠ *Add what this means in practice. Most forgetting is that nobody rereads governance prose.* |

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

1. **`all.duplicate`** implements *"don't demote an enforced rule into a value"* —
   re-listing transparency as a soft value when it is already a binding rule makes
   a MUST look optional.
2. **`type.mismatch` + `int.absolute` + `exp.obligation`** together implement
   *"beware the ambiguous middle"* — a line that sounds binding but has no test is
   the dangerous case, and each of those rules pushes it to one side.

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
