import type { Ctx } from './guard.js';

/**
 * Who is reading. `docs/03-data-model.md` §9, UI spec §1.6.
 *
 * Every read path in P1–P5 took a `Ctx`, because until P6 there was only one
 * kind of reader: an authenticated member of one community. The public surface
 * is the second kind, and it has no user, no membership and no `Ctx` to offer.
 *
 * **This type exists to make one mistake unrepresentable.** The shortcut anybody
 * reaches for when a public loader needs to call a service is to build a `Ctx`
 * with a placeholder user — and a constructed `Ctx` satisfies
 * `requirePermission(ctx, 'community.read')`, which would hand an anonymous
 * visitor every read path in the product. So the anonymous case carries a
 * community id and nothing else: there is no user in it to borrow, and no shape
 * a permission check would accept.
 */
export type Audience = { kind: 'anonymous'; communityId: string } | { kind: 'signed_in'; ctx: Ctx };

/** The community being read, whoever is reading. */
export function communityOf(audience: Audience): string {
	return audience.kind === 'anonymous' ? audience.communityId : audience.ctx.community.id;
}

/**
 * Somebody signed in, reading their own community — what P1–P5 assumed.
 *
 * The discriminant is `signed_in` rather than `member` because `member` is a
 * *role* everywhere else in this codebase, and the role-comparison boundary
 * rule caught the collision before a reader would have. Two meanings for one
 * word in the same module is how somebody later reads `kind === 'member'` as
 * "not a steward".
 */
export const asSignedIn = (ctx: Ctx): Audience => ({ kind: 'signed_in', ctx });

/** The world, reading whatever a community has published. */
export const anonymousIn = (communityId: string): Audience => ({
	kind: 'anonymous',
	communityId
});

/**
 * What a read service accepts.
 *
 * A `Ctx` means a member reading their own community, which is every caller
 * written in P1–P5 and stays correct unchanged. An `Audience` is passed when
 * the caller has to say something the `Ctx` cannot express, which today means
 * exactly one thing: nobody is signed in.
 *
 * The asymmetry is deliberate. The safe reader is the default and the dangerous
 * one has to be written out — `anonymousIn(id)` at the call site is a sentence
 * somebody reviews, where a signature taking `Audience` everywhere would make
 * `asSignedIn(ctx)` the noise that gets pattern-matched past.
 */
export type Reader = Ctx | Audience;

export function toAudience(reader: Reader): Audience {
	return 'kind' in reader ? reader : asSignedIn(reader);
}

/** The member behind a reader, or null when nobody is signed in. */
export function memberOf(reader: Reader): Ctx | null {
	const audience = toAudience(reader);
	return audience.kind === 'signed_in' ? audience.ctx : null;
}
