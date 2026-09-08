# Privacy policy

**This is a draft.** It has not been reviewed by a lawyer. It is written from the
code — `docs/13-data-inventory.md` lists every table it describes — so it is
accurate about what the software does, and that is not the same thing as being
legally sufficient.

## Who runs this

This instance of RCOS Compass is operated by EcoHubs. It is hosted in Germany,
and backups stay in the EU.

## What we hold, and why

You give us an email address and a name so that you can sign in and so that other
members of your community know who you are. Your community writes rules,
decisions and discussions in the product; that text is your community's, not
ours, and we do not read it, mine it, or use it to train anything.

We keep the technical minimum to run the service and to keep it secure: which
sessions are open and from where, when somebody failed to sign in, when an
administrator did something. `docs/13-data-inventory.md` is the full list —
every table, what is in it, why, and how long it stays.

## What happens when you ask to be forgotten

This is the part worth reading twice, because two obligations meet here and the
resolution is deliberate.

**Your profile is erased.** Your name, your email address and anything you set
about yourself are deleted, along with every credential and session. Nothing is
kept that identifies the address you used — not the address, and not a hash of
it. If you sign up again later with the same address, you are a new person and
we have no way of knowing otherwise.

**What your community decided is not erased.** A decision register that can be
silently unmade is worthless — it is the thing a community relies on to know how
it governs itself, and it belongs to the community rather than to any one member
of it. So decisions do not name people. They reference a *membership*, and after
your erasure that membership reads as **Former member (M-0142)** everywhere your
name used to be. The record still says eleven people were present and how they
decided. It no longer says which of them was you.

**Text somebody typed is handled separately.** If your name appears inside
something a member wrote — a discussion, a rationale, an adopted rule — we do not
rewrite that history silently. A steward can *redact* it: the words are replaced
in place with a marker saying a redaction was made at the request of the person
named, and the change is recorded without recording what was removed. Ask a
steward of your community, or write to us and we will ask them.

**What we cannot reach.** If your community exported a bundle or pushed its
history to its own git repository before the redaction, those copies are in their
hands and not in ours. We say so plainly rather than implying we can recall them.
A community's own git history is not ours to rewrite; commits made before
September 2026 also carry the name of whoever recorded a decision, and later ones
carry the membership number instead.

**One refusal.** If you are the only owner of a community, we will ask you to
transfer ownership before we erase you — a community with no owner cannot be
governed or closed, and that would leave everybody else stuck.

## The security record

Sign-in failures, administrator actions and similar events are kept with the
address they came from, for the life of this instance. Erasing your account
removes your email address from those events; the record that something happened
stays, because it is how a slow attempt to break into somebody's account is
recognised months later. We have not set a shorter retention, and we say so here
rather than leaving it unstated.

## Artificial intelligence

An AI provider is used only if your community switches it on, and only for the
drafting help offered on the screen where you switch it on. Where a provider is
configured, its region is named in `content/legal/sub-processors.md`. If no
provider is configured on this instance, no text of yours ever leaves it.

We never send a definition, a decision or a discussion to a provider without a
member asking for it on that screen, and we store a hash of what was sent rather
than the text.

## Your data is yours

Any steward can export the whole community — rules, decisions, documents — as
Markdown, JSON and PDF, readable without this software and without a network.
Every community also gets a git repository of its own history that it can clone
and take away.

## Asking us something

Write to EcoHubs. If you want to be erased and cannot reach your account screen,
say so and an operator will do it for you.
