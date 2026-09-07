import type { Audience } from '../../src/lib/server/auth/audience.js';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import type { Db } from '../../src/lib/server/db/index.js';

/**
 * The read services that return rows a community owns.
 *
 * Kept beside the factories rather than in the suite, so the list is a thing
 * somebody adds to when they add a service — the same reason
 * `services/registry.ts` is not a comment in the cross-tenant test.
 *
 * Each entry seeds one `member`-visible row and one `world`-visible row and
 * knows how to read them for a given audience. Until a service takes an
 * `Audience`, `read` throws — which is what makes the suite red for a true
 * reason rather than a placeholder one, and what makes converting a service the
 * thing that turns it green.
 */
export type ReadPath = {
	name: string;
	/**
	 * Set while the service still takes a `Ctx`. The suite runs these under
	 * `it.fails`, so they assert something true — *this service cannot answer an
	 * anonymous audience* — and the marker clears itself: the moment the service
	 * is converted the test passes, `it.fails` goes red, and whoever converted it
	 * has to delete this line. A suite left red for a whole phase is a suite
	 * people stop reading.
	 */
	pending?: string;
	/** Two rows, one of each visibility. Returns their ids. */
	seed: (db: Db, ctx: Ctx) => { member: string; world: string };
	read: (audience: Audience, db: Db, seeded: { member: string; world: string }) => { id: string }[];
};

/** Every service below still takes a `Ctx`, which is a member by construction. */
const PENDING = 'takes a Ctx, and a Ctx is a member by construction';

const notYetAudienceAware = (name: string) => (): never => {
	throw new Error(
		`${name} cannot answer an anonymous audience: it takes a Ctx, and a Ctx is a member. ` +
			'Convert it to take an Audience and apply visibleTo() inside its query.'
	);
};

export const READ_PATHS: ReadPath[] = [
	{
		name: 'definitions.list',
		pending: PENDING,
		seed: notYetAudienceAware('definitions.list'),
		read: notYetAudienceAware('definitions.list')
	},
	{
		name: 'definitions.get',
		pending: PENDING,
		seed: notYetAudienceAware('definitions.get'),
		read: notYetAudienceAware('definitions.get')
	},
	{
		name: 'definitions.local',
		pending: PENDING,
		seed: notYetAudienceAware('definitions.local'),
		read: notYetAudienceAware('definitions.local')
	},
	{
		name: 'definitions.bySection',
		pending: PENDING,
		seed: notYetAudienceAware('definitions.bySection'),
		read: notYetAudienceAware('definitions.bySection')
	},
	{
		name: 'decisions.list',
		pending: PENDING,
		seed: notYetAudienceAware('decisions.list'),
		read: notYetAudienceAware('decisions.list')
	},
	{
		name: 'decisions.get',
		pending: PENDING,
		seed: notYetAudienceAware('decisions.get'),
		read: notYetAudienceAware('decisions.get')
	},
	{
		name: 'decisions.search',
		pending: PENDING,
		seed: notYetAudienceAware('decisions.search'),
		read: notYetAudienceAware('decisions.search')
	},
	{
		name: 'documents.list',
		pending: PENDING,
		seed: notYetAudienceAware('documents.list'),
		read: notYetAudienceAware('documents.list')
	},
	{
		name: 'documents.get',
		pending: PENDING,
		seed: notYetAudienceAware('documents.get'),
		read: notYetAudienceAware('documents.get')
	},
	{
		name: 'documents.passages',
		pending: PENDING,
		seed: notYetAudienceAware('documents.passages'),
		read: notYetAudienceAware('documents.passages')
	},
	{
		name: 'artifacts.local',
		pending: PENDING,
		seed: notYetAudienceAware('artifacts.local'),
		read: notYetAudienceAware('artifacts.local')
	},
	{
		name: 'glossary',
		pending: PENDING,
		seed: notYetAudienceAware('glossary'),
		read: notYetAudienceAware('glossary')
	},
	{
		name: 'lookup',
		pending: PENDING,
		seed: notYetAudienceAware('lookup'),
		read: notYetAudienceAware('lookup')
	},
	{
		name: 'search.query',
		pending: PENDING,
		seed: notYetAudienceAware('search.query'),
		read: notYetAudienceAware('search.query')
	}
];
