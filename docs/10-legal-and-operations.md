---
status: draft for discussion
version: 0.1
date: 2026-08-31
---

# Licensing, Legal & Operations

Settled by Stefan on 2026-08-31, with the consequences spelled out. None of this
is legal advice; it is the engineering-visible half of decisions that need a
lawyer's eye before general availability.

---

## 1. Licensing

### 1.1 The application — PolyForm Noncommercial 1.0.0

<https://polyformproject.org/licenses/noncommercial/1.0.0>

What it means in practice:

- **A community may self-host it** for their own use. That is the case the
  product cares most about, and it is allowed.
- **A consultancy may not host it for paying clients**, and nobody may resell it,
  without a separate commercial licence from you. That is the point of the choice.
- **It is not an open-source licence** in the OSI sense — no "free for any
  purpose". Say so plainly in the README rather than letting people assume;
  claiming "open source" for a noncommercial licence is a reliable way to lose
  goodwill in exactly the communities this product serves.
- **Outside contributions** get thinner under a noncommercial licence. If you
  ever want them, add a lightweight CLA at the same time you open the repo — much
  harder to retrofit once people have pushed commits.
- **Dual licensing stays open.** PolyForm on the public repo plus a commercial
  licence for organisations that need one is a normal path, and nothing here
  forecloses it.
- **Dependency direction is fine**: MIT/Apache dependencies can be used by
  PolyForm-licensed code. Do not vendor any GPL/AGPL dependency without checking —
  that direction does not work.

Practical: `LICENSE` at the repo root in P0, a one-paragraph plain-language
summary in the README, and the licence named in the app footer and in every export.

### 1.2 The standard content — already licensed, separately

Confirmed by reading `RCOS-website`. Nothing to decide:

| Asset | Licence |
|---|---|
| RCOS specification | **CC BY 4.0** (`LICENSE-SPEC.md`) |
| RCOS governance templates | **CC BY 4.0** (`LICENSE-TEMPLATES.md`) |
| Blueprint site implementation | **AGPL-3.0** (`LICENSE-CODE.md`) |
| "RCOS" name and logo | trademark of EcoHubs (`TRADEMARK.md`) |

Carry the CC BY 4.0 line into every generated YAML file, every Compass export and
every public page, with attribution to the RCOS project. Anyone may implement
RCOS commercially — the noncommercial restriction is on *this application only*,
and the README says so explicitly so nobody conflates them.

### 1.2a Two consequences that are easy to get wrong

**1. Do not copy code from the standard repo into Compass.** The standard repo's
implementation is **AGPL-3.0**; Compass is PolyForm Noncommercial. Those are
incompatible in that direction — reusing an AGPL component, an i18n helper, or a
build script would put Compass under AGPL. The correct boundary is already the
right one architecturally: the YAML *generator* lives in the standard repo under
AGPL, and Compass consumes its **output data**, which is CC BY 4.0 and not a
derivative of the code that produced it. Tempting shortcuts to watch for: the
markdown parsing helpers, the locale utilities, and the download-manifest logic.

**2. "RCOS Compass" uses the RCOS name as a product name.** `TRADEMARK.md` says
the name "may not be used as a product or project name without permission". Since
EcoHubs holds the mark and is the same project, permission is a formality — but
it should be a *recorded* formality: one line in the standard repo, or in
EcoHubs' own decision record, granting RCOS Compass the use of the name. A
governance-standard project that does not follow its own explicitness rule about
its own trademark is an easy and avoidable embarrassment.

### 1.3 Community data belongs to the community

Not a licence question but it lives with them: a community's definitions,
decisions and documents are theirs. One-click full export (JSON + Markdown + PDF)
plus the git mirror, stated as a product promise in the terms, not just a feature.

---

## 2. Hosting and data residency

- **Hosting in Germany.** State it on the public site and in the terms — for
  European communities it is often the deciding question.
- Backups stay in the EU. Any third-party service that touches community data is
  a **sub-processor** and belongs on a published list with its location.
- **The AI provider is the exception that needs care.** Hosting in Germany while
  sending governance drafts to a US model endpoint is a third-country transfer,
  and "our hosting is German" then reads as more than it delivers. Three
  workable answers, in order of preference:
  1. an EU-region endpoint (Vertex AI in `europe-west*`, or an EU-based provider);
  2. a self-hosted or EU-hosted open-weights model for the MVP's two AI tasks,
     which are small;
  3. keep the US endpoint but name it, keep AI off by default (already the rule),
     and show the provider and its region on the screen where a steward enables it.

  Whichever is chosen, the sub-processor list must say where inference happens.
  This is the single most likely thing for a privacy-minded community to ask about.

---

## 3. Legal entity, controller and processor

**EcoHubs Community is not a legal entity yet.** Consequences worth being clear-eyed
about:

- **Nobody can sign a data processing agreement.** European communities running
  member data through the tool will eventually ask for one, and a DPA needs a
  legal person on both sides.
- **Without an entity, the operator is personally the processor** — personally
  exposed for a breach, a subject-access request, or a deletion demand.
- The community is the **controller** of its own member data; the instance
  operator is the **processor**. That split is correct and should be written into
  the terms now, entity or not, because it also tells communities what is theirs.

**Recommendation:**

- For the **pilot** (two friendly communities, both connected to you): explicit
  pilot terms saying there is no DPA yet, that hosting is in Germany, who
  operates the instance, what the sub-processors are, and that data can be
  exported or deleted on request within 30 days. Informed consent from two
  communities that know you is a reasonable position for a pilot.
- **Before general availability, or before taking any money**, form the entity —
  in Germany a `UG (haftungsbeschränkt)`, `gGmbH`, or an `e.V.` if the
  membership-association shape fits EcoHubs better. Then the DPA, the terms and
  the privacy policy get signed by something that is not a person.
- Do not onboard a community that is not personally known to you until that
  exists.

---

## 4. Plans and limits during the testing phase

**Unlimited for now.** Concretely:

- Every community is created on a `pilot` plan with **no member, storage or AI
  limits**; the limit fields in the admin console exist and are simply null.
- Nothing in the product mentions plans, quotas or upgrades. No paywall copy, no
  "you are approaching your limit" nags.
- `/admin/status` still shows real usage per community, so when a limit does
  become necessary the numbers to set it from already exist.
- The one guard that stays on regardless: the **AI token budget** per community,
  because that one costs money per request and an accident is expensive. Default
  it high enough that no pilot community will notice.

---

## 5. Naming

The product is **RCOS Compass**. Repo `rcos-compass`, package `rcos-compass`,
`<title>RCOS Compass</title>`, and the name used in every member-facing string.
"RCOS Compliance Tool" survives only as a description, not as a name.

---

## 6. Documents to write, and when

| Document | By |
|---|---|
| `LICENSE.md` (PolyForm NC 1.0.0) + README licensing paragraph | **done** |
| CC BY 4.0 line carried into generated YAML, exports and public pages | P1 |
| Recorded permission to use the RCOS name for this product (§1.2a) | P0 — one line, do it now |
| CLA, if outside contributions are ever wanted | before the repo is made public |
| Sub-processor list (hosting, mail, AI, error tracking) | P4, when the AI provider is chosen |
| Privacy policy — including the erasure-vs-register position (`03-data-model.md` §10) and the AI provider's terms | P7 |
| Pilot terms — no DPA yet, German hosting, export and deletion on request | P7, before the first real community |
| Terms of service, DPA template | before general availability, with the legal entity |
