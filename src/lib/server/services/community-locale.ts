import { and, eq, ne } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { requirePermission, requireWritableCommunity, type Ctx } from '../auth/guard.js';
import { getDb, type Db } from '../db/index.js';
import { newId } from '../db/id.js';
import { changeLog } from '../db/schema/decisions.js';
import { community } from '../db/schema/tenancy.js';
import { getStandard } from '../standard/index.js';
import type { Locale } from '../standard/types.js';

/**
 * The language a community works in, for the standard's content.
 *
 * Six services had asked this question with six identical private copies of the
 * same seven lines. That is fine until the answer stops being one column — a
 * per-member preference, a fallback when the standard has no such locale — at
 * which point five of the six are still right and one is not, and the one is a
 * screen in the wrong language that nobody can find.
 *
 * Distinct from `$lib/server/locale`, which decides the *interface* language:
 * Paraglide speaks three locales and the vendored standard ships five, so the
 * two types are not interchangeable and neither are the fallbacks.
 */
export function communityLocale(db: Db, communityId: string): Locale {
	const row = db
		.select({ locale: community.locale })
		.from(community)
		.where(eq(community.id, communityId))
		.get();
	return (row?.locale ?? 'en') as Locale;
}

/**
 * The languages a community may choose between.
 *
 * The standard's, not the interface's. The vendored data carries five and
 * Paraglide speaks three, and a community whose language is one of the other
 * two gets its own standard in its own words with an English interface, marked
 * as untranslated — which is a smaller lie than telling a Brazilian community
 * that Compass has nothing for them. `src/lib/server/locale.ts` is where that
 * fallback is decided.
 */
export function availableLocales(): Locale[] {
	return getStandard('rcos-core', '0.1').meta.locales;
}

/**
 * A steward changing the community's language.
 *
 * It changes what the interface and the standard are *shown* in and nothing
 * else: not readiness, not the register, and above all not one word the
 * community wrote. Recorded, because every member's screen changes language at
 * once and somebody will ask who did that.
 */
export function setCommunityLocale(ctx: Ctx, locale: string, options: { db?: Db } = {}): void {
	requirePermission(ctx, 'settings.manage');
	requireWritableCommunity(ctx);

	if (!availableLocales().includes(locale)) {
		error(400, 'That is not one of the languages this standard is published in.');
	}

	const db = options.db ?? getDb();
	const now = new Date(ctx.now());

	db.transaction((tx) => {
		const changed = tx
			.update(community)
			.set({ locale, updatedAt: now })
			.where(and(eq(community.id, ctx.community.id), ne(community.locale, locale)))
			.run();
		// Choosing the language it is already in is not an event.
		if (changed.changes === 0) return;

		tx.insert(changeLog)
			.values({
				id: newId(),
				communityId: ctx.community.id,
				at: now,
				actorId: ctx.user.id,
				kind: 'community.locale_changed',
				subjectType: 'community',
				subjectId: ctx.community.id,
				summary: `Changed this community’s language to ${locale}`,
				payload: null
			})
			.run();
	});
}
