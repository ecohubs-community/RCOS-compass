import { eq } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { community } from '../db/schema/tenancy.js';
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
