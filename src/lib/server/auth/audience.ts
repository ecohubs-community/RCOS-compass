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
export type Audience = { kind: 'anonymous'; communityId: string } | { kind: 'member'; ctx: Ctx };

/** The community being read, whoever is reading. */
export function communityOf(audience: Audience): string {
	return audience.kind === 'anonymous' ? audience.communityId : audience.ctx.community.id;
}

/** A member reading their own community, which is what P1–P5 assumed. */
export const asMember = (ctx: Ctx): Audience => ({ kind: 'member', ctx });

/** The world, reading whatever a community has published. */
export const anonymousIn = (communityId: string): Audience => ({
	kind: 'anonymous',
	communityId
});
