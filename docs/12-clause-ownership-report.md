---
status: for review
version: 0.1
date: 2026-09-02
relates_to: 03-data-model.md §4; 09-standards-versions-modules.md §5.2
---

# Clause Ownership — every decision, for review

**This is the one part of P1 that is judgement rather than extraction.** Please
correct anything that reads wrong; the data lives in
`RCOS-website/content/standard-data/rcos-core-0.1/ownership.yaml` and a change
there flows through the generator into Compass.

---

## What had to be decided, and why

The templates reference clauses generously. A clause about membership states is
cited by the Membership Agreement, the Onboarding Protocol *and* the Membership
State Registry — because a reader of any of those wants to see it. That is right
for reading and wrong for counting: if three sections "answer" one clause, no
tool can say whether it is answered, and an auditor asking *"where did you define
this?"* gets three answers that may disagree.

So each clause gets exactly **one owning section**. Every other section keeps its
reference and simply does not own it.

**Ownership decides only where a clause is counted.** It does not decide what a
community writes: a section that owns no clause still has its own scaffolding and
still needs a definition before its artifact is complete. That makes these calls
much lower-stakes than they first look — getting one wrong misplaces a clause in
the Standard browser, it does not lose anyone's work.

Two rules governed every decision:

1. **The owner is the section a member would open in order to write the answer.**
   Where a clause is an umbrella — *"the Protocol MUST define, at minimum: A, B,
   C"* — the owner is the artifact's first, most general section.
2. **A MUST clause may never be owned by a section of a non-mandatory artifact.**
   This one was discovered rather than assumed, and it changed six decisions —
   see below.

## The numbers

| | |
|---|---|
| Clauses in Layers 0–6 | 213 |
| Containing a normative `MUST` | 185 |
| **Answerable by a community** (`defined_by_section`) | **173** |
| Satisfied by the platform | 8 |
| Not a definition at all | 4 |
| Clauses needing arbitration | 57 (19 cross-artifact, 38 same-artifact) |
| Template artifacts | 22, of which 21 mandatory |
| Sections | 118 |

## The rule that changed six decisions

**Experiment Template is the only optional artifact in RCOS-Core 0.1.**

Six experiment obligations (`8.3.2`–`8.3.5`, `8.7.3`, and `8.3.1`) are referenced
by both `change-protocol.experiments` and `experiment-template.required-fields`.
The Experiment Template is the more specific home, and it was the obvious owner —
until the consequence surfaced: **a MUST clause owned by an optional artifact
means a community that never runs an experiment can never reach compliance.**

All six now belong to the Change Protocol. The check is now enforced in the
generator and in `pnpm check:standard`, so it cannot regress.

## Three things worth your eye

1. **`8.2.5`** — *"No informal, undocumented or 'understood' rule changes MAY be
   considered valid"* — went to `change-protocol.adoption-and-publication` rather
   than to the Version History, because it defines what counts as a valid adopted
   change rather than how versions are recorded. Arguable either way.
2. **`5.3.2`** — *"Income sources and any external income interfaces MUST be
   explicitly defined"* — went to `treasury-ruleset.income-sources`, on the view
   that income is treasury business even when the interface is an internal one.
   The Internal Economy Protocol also has a claim here.
3. **`3.4.4`** — *"No obligation MAY be enforced without a corresponding,
   documented right"* — went to `member-obligations` rather than `member-rights`,
   because the constraint binds obligations. It reads naturally either way.

## An open question for P3, not for you now

Five artifacts have a **ratification-record** section that owns no clause. Under
`artifact_complete` (`docs/03-data-model.md` §3b), a community must adopt a
definition for each of them before the artifact counts as complete — even though
Compass already *has* that information: the decision that adopted the artifact is
the ratification record.

Either those sections should be filled automatically from the decision that
adopted the artifact, or artifact completeness should skip them. It affects
whether compliance is reachable without busywork, and it belongs with the
completeness computation in P3.

## Also worth knowing

**RCOS-Core 0.1 contains no `SHOULD` clauses at all** in Layers 0–6 — 185 MUST,
18 MAY, and the rest informative. The Standard browser's `MUST / SHOULD / MAY`
filter (UI spec §4.2) would therefore show an always-empty option. Either the
filter drops SHOULD for this version, or it is generated from what the loaded
standard actually contains — the latter, since a module or v0.2 may introduce them.

---

### Cross-artifact — the ones that needed a real judgement

| Clause | What it says | Owner | Also references it |
|---|---|---|---|
| `3.1.2` | At minimum, the following membership states MUST exist: - Applicant - Trial / Probationary Member - Full Me… | `membership-state-registry.defined-membership-states` | `membership-agreement.membership-state-on-signing`, `onboarding-protocol.initial-membership-state` |
| `3.1.4` | No individual MAY hold multiple membership states simultaneously. | `membership-state-registry.defined-membership-states` | `membership-agreement.membership-state-on-signing`, `onboarding-protocol.initial-membership-state` |
| `3.2.2` | The onboarding process MUST include: - Review of all RCOS-Core artifacts - Explicit consent to Layer 0 and … | `onboarding-protocol.onboarding-steps` | `membership-agreement.consent-acknowledgment` |
| `3.6.3` | Forced exit MUST follow due process and be handled through Layer 4 mechanisms. | `exit-protocol.forced-exit` | `membership-agreement.due-process-reference` |
| `5.3.2` | Income sources and any external income interfaces MUST be explicitly defined. | `treasury-ruleset.income-sources` | `internal-economy-protocol.external-income-interfaces` |
| `5.4.3` | Economic mechanisms MUST NOT allow members to bypass governance authority boundaries defined in Layer 2, in… | `internal-economy-protocol.accumulation-constraints` | `treasury-ruleset.conflict-of-interest-rules` |
| `6.3.2` | Safeguards MUST include protections against retaliation for: - Raising a concern - Requesting mediation - P… | `accountability-protocol.anti-retaliation-protections` | `conflict-resolution-ladder.safeguards` |
| `7.1.4` | No ongoing responsibility MAY exist without an explicit role, and no person MAY be held accountable for res… | `role-registry.overview` | `operations-manual.temporary-and-ad-hoc-responsibilities` |
| `7.7.1` | Ongoing responsibilities MUST NOT exist without an explicit role. | `role-registry.overview` | `operations-manual.temporary-and-ad-hoc-responsibilities` |
| `8.2.1` | All adopted changes MUST be versioned and traceable. | `version-history.entry-format` | `change-protocol.adoption-and-publication` |
| `8.2.2` | The community MUST maintain a **Version History** that records, at minimum: - Version identifier - Adoption… | `version-history.entry-format` | `change-protocol.adoption-and-publication`, `change-protocol.rejection` |
| `8.2.4` | Superseded rules MUST remain accessible for auditability, learning, and dispute resolution, together with t… | `version-history.entry-format` | `change-protocol.rejection` |
| `8.2.5` | No informal, undocumented, or “understood” rule changes MAY be considered valid. | `change-protocol.adoption-and-publication` | `version-history.entry-format` |
| `8.3.1` | The community MAY adopt experiments as explicitly time-bounded and reversible deviations, extensions, or pi… | `change-protocol.experiments` | `experiment-template.required-fields` |
| `8.3.2` | Every experiment MUST define, at minimum: - Scope (what is changed and what is explicitly not changed) - Du… | `change-protocol.experiments` | `experiment-template.required-fields` |
| `8.3.3` | Experiments MUST NOT override Layer 0 invariants and MUST NOT bypass governance constraints defined in Laye… | `change-protocol.experiments` | `experiment-template.required-fields` |
| `8.3.4` | Experiments MUST be explicitly labeled as experimental in all affected artifacts and MUST include a non-ext… | `change-protocol.experiments` | `experiment-template.required-fields` |
| `8.3.5` | If an experiment introduces safety risk, coercion, or sustained harm, the community MUST suspend or termina… | `change-protocol.experiments` | `experiment-template.required-fields` |
| `8.7.3` | Experiments MUST be time-bounded, explicitly labeled, and reversible. | `change-protocol.experiments` | `experiment-template.required-fields` |

### Same-artifact — mechanical

| Clause | What it says | Owner | Also references it |
|---|---|---|---|
| `2.1.5` | No action, decision, or allocation of resources MAY materially contradict the stated primary purpose. | `purpose-charter.primary-purpose` | `purpose-charter.non-goals-and-exclusions` |
| `2.2.1` | The community MUST explicitly declare the scope of what it governs. | `scope-declaration.in-scope-assets` | `scope-declaration.in-scope-decision-domains`, `scope-declaration.in-scope-activities-and-responsibilities` |
| `2.2.2` | The scope declaration MUST include, at minimum: - Assets governed by the community - Domains of decision-ma… | `scope-declaration.in-scope-assets` | `scope-declaration.in-scope-decision-domains`, `scope-declaration.in-scope-activities-and-responsibilities` |
| `2.2.4` | Anything not explicitly declared as in scope MUST be treated as out of scope. | `scope-declaration.explicitly-out-of-scope` | `scope-declaration.in-scope-assets` |
| `2.4.1` | The community MUST declare any identity-level constraints that materially affect participation, behavior, o… | `identity-constraints-register.active-identity-constraints` | `identity-constraints-register.conditions-for-change` |
| `2.4.3` | Identity constraints MUST be testable and enforceable through defined processes. | `identity-constraints-register.enforcement-and-testability` | `identity-constraints-register.active-identity-constraints` |
| `2.4.4` | Identity constraints MUST NOT be enforced implicitly or informally. | `identity-constraints-register.enforcement-and-testability` | `identity-constraints-register.active-identity-constraints` |
| `3.4.4` | No obligation MAY be enforced without a corresponding, documented right. | `membership-agreement.member-obligations` | `membership-agreement.member-rights` |
| `3.6.4` | Exit MUST NOT result in loss of rights beyond those explicitly tied to membership. | `exit-protocol.voluntary-exit` | `exit-protocol.forced-exit` |
| `4.5.1` | The community MUST define a Governance Protocol describing the full lifecycle of a decision. | `governance-protocol.proposal-submission` | `governance-protocol.review-and-deliberation`, `governance-protocol.decision-execution` |
| `4.5.2` | The Governance Protocol MUST include: - Proposal submission requirements - Review and deliberation process … | `governance-protocol.proposal-submission` | `governance-protocol.review-and-deliberation`, `governance-protocol.appeal-and-review` |
| `4.5.4` | All governance actions MUST be documented according to Layer 5 documentation rules. | `governance-protocol.documentation-and-publication` | `governance-protocol.decision-execution` |
| `4.6.2` | Governance mechanisms MUST allow for challenge and review without retaliation. | `governance-protocol.safeguards-and-failure-modes` | `governance-protocol.appeal-and-review` |
| `5.2.5` | Contribution recognition MUST NOT create implicit decision authority, veto power, or governance influence b… | `internal-economy-protocol.contribution-recognition-mechanism` | `internal-economy-protocol.internal-units` |
| `6.1.5` | Misclassification or avoidance of classification MUST be treated as a process failure subject to review. | `conflict-resolution-ladder.conflict-classification` | `conflict-resolution-ladder.non-response-withdrawal-and-deadlock` |
| `6.2.5` | Unresolved conflicts MUST escalate through defined governance pathways without bypassing the Decision Matri… | `conflict-resolution-ladder.resolution-ladder-steps` | `conflict-resolution-ladder.non-response-withdrawal-and-deadlock` |
| `6.3.1` | The community MUST define explicit safeguards for conflicts involving power asymmetries, dependency relatio… | `conflict-resolution-ladder.safeguards` | `conflict-resolution-ladder.facilitator-selection-and-replacement` |
| `6.3.3` | Where a power differential exists between parties, elevated safeguards MUST be applied, which MAY include: … | `conflict-resolution-ladder.safeguards` | `conflict-resolution-ladder.facilitator-selection-and-replacement` |
| `6.4.1` | The community MUST define an explicit sanctions and repair framework. | `accountability-protocol.sanction-and-repair-options` | `accountability-protocol.triggers` |
| `6.4.2` | Sanctions and repair actions MUST be: - Proportional to the violation - Explicitly documented - Time-bounde… | `accountability-protocol.sanction-and-repair-options` | `accountability-protocol.investigation-and-review`, `accountability-protocol.due-process-guarantees` |
| `6.4.3` | The framework MUST define, at minimum: - Available sanction and repair types - Preconditions and evidence s… | `accountability-protocol.sanction-and-repair-options` | `accountability-protocol.investigation-and-review` |
| `6.4.4` | Separation, suspension, or removal actions MUST follow due process and MUST align with exit and separation … | `accountability-protocol.coordination-with-layer-1` | `accountability-protocol.due-process-guarantees`, `accountability-protocol.conditions-for-restoring-rights` |
| `6.4.6` | Repair-oriented actions MUST be prioritized over punitive actions except in safety-critical cases. | `accountability-protocol.sanction-and-repair-options` | `accountability-protocol.investigation-and-review` |
| `6.5.3` | The Conflict Resolution Ladder MUST define, at minimum: - Conflict classification inputs and escalation thr… | `conflict-resolution-ladder.conflict-classification` | `conflict-resolution-ladder.resolution-ladder-steps`, `conflict-resolution-ladder.privacy-and-information-access-boundaries` |
| `6.5.4` | The Accountability Protocol MUST define, at minimum: - Investigation, review, and decision mechanisms - Due… | `accountability-protocol.triggers` | `accountability-protocol.investigation-and-review`, `accountability-protocol.due-process-guarantees`, `accountability-protocol.sanction-and-repair-options` |
| `7.1.1` | All ongoing responsibilities MUST be assigned to explicit, named roles rather than implicit expectations or… | `role-registry.overview` | `role-registry.functional-roles` |
| `7.1.2` | The community MUST maintain a **Role Registry** that includes, at minimum: - Role name and purpose - Scope … | `role-registry.overview` | `role-registry.operational-roles`, `role-registry.functional-roles` |
| `7.2.1` | The community MUST define explicit meeting types sufficient to support: - Operations - Governance - Coordin… | `meeting-templates.meeting-type-operations` | `meeting-templates.meeting-type-governance`, `meeting-templates.meeting-type-coordination-alignment`, `meeting-templates.meeting-type-reflection-learning`, `meeting-templates.meeting-type-conflict-handling` |
| `7.2.2` | Each meeting type MUST define, at minimum: - Purpose and decision scope - Required vs optional participants… | `meeting-templates.meeting-type-operations` | `meeting-templates.meeting-type-governance`, `meeting-templates.meeting-type-coordination-alignment`, `meeting-templates.meeting-type-reflection-learning`, `meeting-templates.meeting-type-conflict-handling` |
| `7.2.3` | Meetings MUST NOT exceed their declared decision scope or bypass authority boundaries defined in Layer 2. | `meeting-templates.meeting-type-operations` | `meeting-templates.meeting-type-governance`, `meeting-templates.meeting-type-coordination-alignment`, `meeting-templates.meeting-type-reflection-learning`, `meeting-templates.meeting-type-conflict-handling` |
| `7.3.2` | Documentation rules MUST specify, at minimum: - What information MUST be recorded - Where records are store… | `operations-manual.documentation-locations-and-update-procedures` | `operations-manual.information-flow-and-anti-gatekeeping` |
| `7.3.4` | Critical operational processes MUST be documented such that continuity does not depend on tacit knowledge h… | `operations-manual.core-operational-processes` | `operations-manual.role-and-domain-interfaces` |
| `7.6.3` | The Operations Manual MUST define, at minimum: - Core operational processes relied upon by the community - … | `operations-manual.core-operational-processes` | `operations-manual.role-and-domain-interfaces` |
| `7.6.4` | Meeting Templates MUST define, at minimum: - Agenda structure - Notes and record format - Decision capture … | `meeting-templates.meeting-type-operations` | `meeting-templates.meeting-type-governance`, `meeting-templates.meeting-type-coordination-alignment`, `meeting-templates.meeting-type-reflection-learning`, `meeting-templates.meeting-type-conflict-handling` |
| `8.1.2` | Change mechanisms MUST explicitly distinguish between: - Permanent rule changes - Time-bounded experiments … | `change-protocol.how-proposals-are-classified` | `change-protocol.review-and-deliberation` |
| `8.5.1` | The system MUST prefer reversible changes over irreversible ones where possible. | `change-protocol.rollback` | `change-protocol.transition-and-migration` |
| `8.6.3` | The Change Protocol MUST define, at minimum: - How changes are proposed, reviewed, adopted, published, and … | `change-protocol.how-changes-are-proposed` | `change-protocol.adoption-and-publication` |
| `8.6.5` | The Learning Log MUST define: - What constitutes a learnable event - Documentation format and ownership - R… | `learning-log.what-constitutes-a-learnable-event` | `learning-log.entry-format` |

### Dispositions — clauses no community answers

| Clause | What it says | Disposition | Why |
|---|---|---|---|
| `4.7.2` | Layer 2 artifacts MUST be: - Explicit and unambiguous - Versioned - Accessible to all m… | `satisfied_by_platform` | Every definition is versioned, member-visible by default, and adopted only through a recorded decision. "Explicit and unambiguo… |
| `5.5.2` | Layer 3 artifacts MUST be: - Explicit and unambiguous - Versioned - Accessible to all m… | `satisfied_by_platform` | As 4.7.2. Bounded exceptions to member visibility exist only as recorded, expiring Transparency Exceptions. |
| `6.5.2` | Layer 4 artifacts MUST be: - Explicit and unambiguous - Versioned - Accessible to all m… | `satisfied_by_platform` | As 4.7.2, with privacy boundaries expressed as Transparency Exceptions rather than as silent permissions. |
| `7.6.2` | Layer 5 artifacts MUST be: - Explicit and unambiguous - Versioned - Accessible to all m… | `satisfied_by_platform` | As 4.7.2. "Maintained as living documents with defined ownership and review cycles" is met by review dates and the definition's… |
| `8.6.2` | Layer 6 artifacts MUST be: - Explicit and unambiguous - Versioned - Accessible to all m… | `satisfied_by_platform` | As 4.7.2. |
| `2.5.3` | If Layer 0 artifacts are missing, ambiguous, or internally contradictory, the community… | `satisfied_by_platform` | Compliance is computed as false while any mandatory artifact is incomplete, and a published claim is withdrawn automatically wh… |
| `3.8.3` | Absence, ambiguity, or systematic violation of Layer 1 artifacts MUST result in loss of… | `satisfied_by_platform` | As 2.5.3. |
| `4.7.3` | Absence, ambiguity, or systematic violation of Layer 2 artifacts MUST result in loss of… | `satisfied_by_platform` | As 2.5.3. |
| `5.7.3` | The following MUST remain optional and out of scope: - Attitudes toward wealth - Equal … | `not_a_definition` | Bounds the standard, not the community: attitudes toward wealth, equal vs differentiated outcomes, and personal financial choic… |
| `6.7.3` | The following MUST remain optional and out of scope: - Emotional expression norms - The… | `not_a_definition` | Bounds the standard: emotional expression norms and therapeutic, spiritual or ideological framings of conflict stay out of scope. |
| `7.8.3` | The following MUST remain optional and out of scope: - Personal work styles - Aesthetic… | `not_a_definition` | Bounds the standard: personal work styles, aesthetic preferences and informal social coordination stay out of scope. |
| `8.8.3` | The following MUST remain optional and out of scope: - Pace of innovation - Cultural at… | `not_a_definition` | Bounds the standard: pace of innovation and cultural attitudes to risk stay out of scope. |
