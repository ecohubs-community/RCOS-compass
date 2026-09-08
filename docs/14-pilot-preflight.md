---
status: operational checklist — the last thing before a real community
---

# 14. Before a real community is seeded

P7 built what a pilot needs. Seeding EcoHubs online and Fruit Haven is an
operational act, and this is what has to be true first. It is a document rather
than a screen on purpose: every item needs a person to have *done* something
outside the application, and a checkbox in the admin console would record the
click rather than the act.

## 1. The documents say what you mean

- [ ] Read `content/legal/privacy.md`, `pilot-terms.md` and `sub-processors.md`
      end to end. They are drafts written from the code — accurate about what the
      software does, which is not the same as legally sufficient.
- [ ] Have somebody with the standing to do it review them. Then mark each
      reviewed at `/admin/legal`, which records the wording's hash: editing a word
      afterwards brings the draft notice back on its own, and that is the point.
- [ ] Check the sub-processor list against what this instance is actually
      configured with — the hosting provider, the SMTP endpoint, and the AI
      provider's **region** if one is set.

## 2. You can get it back

- [ ] Run `pnpm snapshot` against the real instance.
- [ ] Run `pnpm restore` from that snapshot into a scratch directory, start the
      application against it, and open a document somebody uploaded. The suite
      proves the mechanism; this proves your backup target.
- [ ] Confirm the snapshot lands somewhere off this machine, and that you know
      how long it is kept.

## 3. Mail arrives

- [ ] `SMTP_URL` is set, and an invitation actually reaches an inbox — not the
      spam folder. Invitations and verification links are the only way in; a
      steward watching an invitation that was never delivered is the worst first
      hour this product can offer.
- [ ] `/admin/status` shows no mail failures afterwards.

## 4. The instance is watched

- [ ] `/admin/status` is reachable by you, with a second factor enrolled, and you
      know what it looks like when nothing is wrong.
- [ ] More than one platform admin exists. Erasure refuses the last one, and so
      does common sense: an instance with one administrator has a single point of
      failure made of a person.
- [ ] `BETTER_AUTH_SECRET` is backed up somewhere separate from the database. The
      export signing key and the mirror credential key are derived from it; losing
      it makes every stored mirror token unreadable and every outstanding download
      link invalid.

## 5. The community knows what it is joining

- [ ] They have read the pilot terms, including the sentence that says this will
      break and that there is no service level.
- [ ] They know where the report button is, and that what they write there
      becomes work rather than a message in a chat window.
- [ ] They know they can export everything, at any time, without asking.

---

None of this is enforced by the application, and it should not be: an instance
that refused to serve until a checklist was ticked would be a checklist somebody
routed around. What the product does is make each item *checkable* — the review
state, the drill, the status page, the export.
