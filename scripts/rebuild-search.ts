/**
 * Rebuild the search index from the rows, for one community or all of them.
 *
 *   pnpm search:rebuild            # every community
 *   pnpm search:rebuild <slug>     # one
 *
 * The deploy step is migrate, rebuild, serve (`design.md`, Migration Plan). An
 * instance taking the deploy that introduced the index has rows and no index,
 * and nothing else will notice: the writes are transactional from here on, so a
 * missing index looks exactly like a community that has written nothing.
 *
 * Idempotent, because it clears each community before rebuilding it. A rebuild
 * that doubled every document when somebody ran it twice would be a tool people
 * are afraid of, and a recovery tool nobody dares run is not a recovery tool.
 *
 * Unlike `migrate.mjs` this *does* import the application: the index holds a
 * definition's title as a member would read it, which means the standard, the
 * locale and the schema. So it reads its database through the same validated
 * config the server does, rather than a second opinion about which file to open.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '../src/lib/server/db/index.js';
import { community } from '../src/lib/server/db/schema/tenancy.js';
import { rebuildAllSearchIndexes, rebuildSearchIndex } from '../src/lib/server/services/search.js';

const slug = process.argv[2];
const db = getDb();

if (slug) {
	const row = db.select().from(community).where(eq(community.slug, slug)).get();
	if (!row) {
		console.error(`No community with slug "${slug}".`);
		process.exit(1);
	}
	const { indexed } = rebuildSearchIndex(db, row.id);
	console.log('Rebuilt %s: %d documents indexed', slug, indexed);
} else {
	const { communities, indexed } = rebuildAllSearchIndexes(db);
	console.log(
		'Rebuilt %d communit%s: %d documents indexed',
		communities,
		communities === 1 ? 'y' : 'ies',
		indexed
	);
}
