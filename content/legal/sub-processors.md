# Who else touches your data

**This is a draft.** It has not been reviewed by a lawyer.

A sub-processor is anybody other than us whose systems your data passes through.
The list is short on purpose: every entry is a place your community's governance
could go, and the product is built so that most of them are optional.

## Always

| Who | What for | Where |
|---|---|---|
| The hosting provider named in our terms | Running the server and holding the database and uploaded files | Germany |
| Backup storage | Nightly snapshots of the database and the uploads | EU |

## Only if configured on this instance

| Who | What for | What reaches them |
|---|---|---|
| An email provider (SMTP) | Invitations, verification links, notifications | An address and the text of that message. Never a definition, a decision or a discussion |
| An AI provider | Drafting help, and only when a community switches it on and a member asks for it on that screen | The text a member submits for that one task. Nothing is sent in the background, and we store a hash of the input rather than the input |

**The AI region is not a footnote.** This instance is hosted in Germany, so an
inference endpoint outside the EU is a third-country transfer. If a provider is
configured here, its region is named on the screen where a steward enables AI,
and in the privacy policy. If no provider is configured, no text of yours leaves
this instance for any reason.

## Deliberately absent

- **No analytics service.** No third-party analytics, no session recording, no
  tracking cookies. What we count is whether a community reached each onboarding
  step, in our own database, with no member attached to it.
- **No error-tracking service.** Errors are recorded on this instance, scrubbed
  of anything a member wrote, and read by an operator on a page here.
- **No content delivery network** in front of the application.
- **No payment processor.** Nothing is charged during the pilot.

## If this list changes

It changes with a deployment, because it is a file in the repository next to the
code it describes. A community will not find a new sub-processor here without a
release having introduced it.
