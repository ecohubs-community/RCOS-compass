# The three decisions P6 had to make before it built

Recorded here the way P4's three and P5's three were: decided once, with the
reasoning, so the answer is not reconstructed from a commit message later.

---

## 1. A mirror commit's author is a service identity, and the person is in the body

`Compass <noreply@…>` is the git author and committer. The person who froze the
decision is named in the commit message body, by their display name and
membership reference, never by their email address.

**Why.** A git author is an email address, and the repository may be public — that
is the point of linking a remote. Putting a member's personal address in the
author field publishes it to anybody who clones, permanently, in a place no
erasure flow reaches. `docs/03` §10 already says decisions reference
`membership_id` and never a denormalised name, and the same reasoning applies
harder here: a commit is copied to machines we do not control the moment it is
pushed.

**What is lost.** `git shortlog` and GitHub's contributor graph attribute
everything to one identity. That is a real cost and the wrong thing to optimise
for: the audit question is *"who decided this"*, and the decision record answers
it in the body and in the register with far more than a name — the mechanism, the
tally, who was present, the date.

**Rejected: the person's own git identity, configurable per member.** It makes
the disclosure a member's choice, which sounds better and is worse: consent to
publish an email address in a repository, given once at setup, is not consent
anybody remembers giving three years later when the repo goes public.

---

## 2. An export link lives one hour, and is single-community, not single-use

`EXPORT_LINK_TTL = 1 hour`. The link carries the community, the file and an
expiry, signed. It is not single-use.

**Why an hour.** The link exists so a steward can hand a bundle to an auditor or
a lawyer without giving them an account. That is a same-sitting act — you
generate it, you paste it into an email or a chat, they open it. A day would be
convenient and would also mean a link sitting in a mail thread that still works
tomorrow, which is the shape of leak that happens by forwarding rather than by
attack.

**Why not single-use.** A single-use link is broken by every mail scanner and
link-preview bot between here and the recipient, and the failure — "the link
didn't work" — is indistinguishable from a bug. The audit log records every use,
so a link used twice is visible rather than prevented.

**What this costs.** A steward who takes ninety minutes to write the email
regenerates. That is a small, obvious, recoverable annoyance, which is the right
kind.

---

## 3. The public surface lives at `/p/<slug>`

Not `/c/<slug>/public`, and not a subdomain.

**Why a separate top-level prefix.** `/c/` is the authenticated tenant space, and
every route under it resolves a `Ctx`. Nesting the anonymous surface inside it
means one prefix with two authentication models, which is exactly the shape where
a route ends up in the wrong one — and the wrong direction is a member page
served anonymously. A different prefix makes the boundary visible in the URL, in
the route tree and in the `robots.txt`.

**Why not a subdomain.** `public.compass.example/<slug>` or
`<slug>.compass.example` would be cleaner still and would cost a wildcard
certificate, a second origin in the CSP and cookie-scoping care — for a pilot
whose deployment story is one VPS and one adapter-node process (`docs/00` §7).
Path-based is what tenancy already does and it is enough.

**What it leaves open.** A community wanting `governance.example.org` is a P7-or-
later question. Deciding `/p/` now does not foreclose it: a custom domain would
map onto the same routes.
