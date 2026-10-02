import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { definition, definitionVersion } from '../../src/lib/server/db/schema/definitions.js';
import { seedCommunityDefaults } from '../../src/lib/server/services/community-setup.js';
import { activeStandardView } from '../../src/lib/server/services/completeness.js';
import { freeze } from '../../src/lib/server/services/decisions.js';
import {
	createDefinition,
	createLocalDefinition,
	newDefinitionChoices
} from '../../src/lib/server/services/definitions.js';
import {
	definitionsIndex,
	listDefinitions
} from '../../src/lib/server/services/definitions-index.js';
import { addProposal, openDiscussion } from '../../src/lib/server/services/discussions.js';
import {
	localDefinitionContext,
	statusesBySection
} from '../../src/lib/server/services/provenance.js';
import { readiness } from '../../src/lib/server/services/readiness.js';
import { listStandardFeedback } from '../../src/lib/server/services/standard-feedback.js';
import { getVotingProvider } from '../../src/lib/server/voting/index.js';
import { getStandard } from '../../src/lib/server/standard/index.js';
import { createTestDb } from '../support/db.js';
import { catchRefusal } from '../support/errors.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * The definitions index and local definitions. `openspec/changes/provenance-ui`
 * group 7, the `definitions` spec.
 */
const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);

let db: Db;
let cleanup: () => void;
let ana: Ctx;
let marco: Ctx;
let lena: Ctx;

function community(slug: string) {
	const home = makeCommunity(db, { slug });
	seedCommunityDefaults(db, { communityId: home.id, now: NOW });
	return home;
}

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	const home = community('valle-verde');
	const seat = (email: string, name: string, role: 'steward' | 'member', isOwner = false) => {
		const person = makeUser(db, { email, name });
		const membership = makeMembership(db, home.id, person.id, { role, isOwner });
		return { user: person, community: home, membership, now: () => NOW } satisfies Ctx;
	};
	ana = seat('ana@example.org', 'Ana Ruiz', 'steward', true);
	marco = seat('marco@example.org', 'Marco Bianchi', 'member');
	lena = seat('lena@example.org', 'Lena Vogt', 'member');
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

const view = () => getStandard('rcos-core', '0.1');
const local = (
	who: Ctx = marco,
	extra: Partial<Parameters<typeof createLocalDefinition>[1]> = {}
) =>
	createLocalDefinition(
		who,
		{ title: 'Thursday dinner', layer: 5, purpose: 'We eat together once a week.', ...extra },
		{ db }
	);
const fresh = (who: Ctx): Ctx => ({ ...who });

describe('a member creates a local definition', () => {
	it('exists with nothing adopted, on Community Agreements, asked for by them', () => {
		const made = local();

		expect(made).toMatchObject({ scope: 'local', adoptedVersionId: null, layer: 5 });
		expect(made.createdBy).toBe(marco.user.id);
		const choices = newDefinitionChoices(marco, { db });
		expect(choices.artifacts[0]!.title).toBe('Community Agreements');
		expect(made.attachCommunityArtifactId).toBe(choices.artifacts[0]!.key.slice('local:'.length));
		expect(localDefinitionContext(lena, made.id, { db })).toMatchObject({
			purpose: 'We eat together once a week.',
			askedBy: 'Marco Bianchi',
			writtenDown: null
		});
	});

	it('records "RCOS should require this" as the community’s feedback, attributed', () => {
		local(marco, { title: 'Guests over a week need consent', standardShouldRequireThis: true });
		const [entry] = listStandardFeedback(ana, { db });
		expect(entry).toMatchObject({
			kind: 'gap',
			body: 'Guests over a week need consent',
			author: 'Marco Bianchi'
		});
	});

	it('refuses a missing or unknown layer and creates nothing', () => {
		expect(catchRefusal(() => local(marco, { layer: null }))?.status).toBe(400);
		expect(catchRefusal(() => local(marco, { layer: 99 }))?.status).toBe(400);
		expect(db.select().from(definition).all()).toHaveLength(0);
	});

	it('refuses in a suspended community', () => {
		const suspended: Ctx = {
			...marco,
			community: { ...marco.community, status: 'suspended', suspendedReason: 'Paused.' }
		};
		expect(catchRefusal(() => local(suspended))?.status).toBe(409);
	});

	it('names the clauses it touches, satisfies neither, and moves no number', () => {
		const [first, second] = view().countableClauses();
		const before = readiness(fresh(ana), { db })!;

		const made = local(marco, { touches: [first!.ref, `§${second!.ref}`] });

		expect(
			localDefinitionContext(ana, made.id, { db })!
				.touches.map((t) => t.ref)
				.sort()
		).toEqual([first!.ref, second!.ref].sort());
		const after = readiness(fresh(ana), { db })!;
		expect(after.satisfied).toBe(before.satisfied);
		expect(after.percent).toBe(before.percent);
	});

	it('refuses a clause the standard does not have', () => {
		const refusal = catchRefusal(() => local(marco, { touches: ['99.99.99'] }));
		expect(refusal?.status).toBe(400);
		expect(refusal?.message).toContain('99.99.99');
	});
});

describe('the definitions index', () => {
	const standardOne = () => {
		const section = activeStandardView(db, ana)!.view.authoredSections()[0]!;
		return {
			section,
			made: createDefinition(ana, { scope: 'standard', sectionKey: section.key }, { db })
		};
	};

	it('lists both kinds, each with its artifact and status', () => {
		const { section, made: answering } = standardOne();
		const own = local();

		const rows = listDefinitions(lena, {}, { db });
		expect(rows.map((row) => row.id).sort()).toEqual([answering.id, own.id].sort());
		const standardRow = rows.find((row) => row.id === answering.id)!;
		expect(standardRow).toMatchObject({ scope: 'standard', status: 'drafting', version: null });
		expect(standardRow.refs.length).toBeGreaterThan(0);
		expect(standardRow.artifact?.key).toBe(section.artifact);
		expect(rows.find((row) => row.id === own.id)).toMatchObject({
			scope: 'local',
			title: 'Thursday dinner',
			artifact: { title: 'Community Agreements' }
		});
	});

	it('shows a standard definition with the status the Standard browser shows', () => {
		const { section, made } = standardOne();
		openDiscussion(
			ana,
			{ title: 'Talk', about: { kind: 'section', sectionKey: section.key } },
			{ db }
		);

		const row = listDefinitions(lena, {}, { db }).find((r) => r.id === made.id)!;
		expect(row.status).toBe(statusesBySection(lena, { db }).get(section.key)!.status);
		expect(row.status).toBe('in_discussion');
	});

	it('filters by status, artifact and provisional', () => {
		const { made: answering } = standardOne();
		const own = local();
		db.update(definition).set({ provisional: true }).where(eq(definition.id, own.id)).run();

		expect(listDefinitions(lena, { provisional: true }, { db }).map((r) => r.id)).toEqual([own.id]);
		const index = definitionsIndex(
			lena,
			{
				artifact: listDefinitions(lena, {}, { db }).find((r) => r.id === answering.id)!.artifact!
					.key
			},
			{ db }
		);
		expect(index.rows.map((r) => r.id)).toEqual([answering.id]);
		expect(index.total).toBe(2);
		expect(index.artifacts).toHaveLength(2);
		expect(listDefinitions(lena, { status: 'adopted' }, { db })).toHaveLength(0);
	});

	it('marks what waits on the reader: a round they have not answered', () => {
		const own = local();
		const thread = openDiscussion(
			marco,
			{ title: 'Thursday dinner', about: { kind: 'definition', definitionId: own.id } },
			{ db }
		);
		const proposal = addProposal(marco, { discussionId: thread.id, body: 'Dinner at 7.' }, { db });
		getVotingProvider().respond(marco, { proposalPostId: proposal.id, value: 'consent' }, { db });

		const forLena = listDefinitions(lena, { attention: true }, { db });
		expect(forLena.map((row) => row.id)).toEqual([own.id]);
		expect(listDefinitions(marco, { attention: true }, { db })).toHaveLength(0);
		expect(listDefinitions(lena, {}, { db })[0]!.status).toBe('in_vote');
	});

	it('hides a restricted definition from a member and shows it to a steward', () => {
		const own = local();
		db.update(definition).set({ visibility: 'restricted' }).where(eq(definition.id, own.id)).run();

		expect(listDefinitions(lena, {}, { db })).toHaveLength(0);
		expect(listDefinitions(ana, {}, { db }).map((row) => row.id)).toEqual([own.id]);
	});

	it('shows nothing from another community', () => {
		local();
		const elsewhere = community('elsewhere');
		const olga = makeUser(db, { email: 'olga@example.org' });
		const seat = makeMembership(db, elsewhere.id, olga.id, { role: 'steward', isOwner: true });
		const theirs: Ctx = { user: olga, community: elsewhere, membership: seat, now: () => NOW };

		expect(listDefinitions(theirs, {}, { db })).toHaveLength(0);
	});
});

describe('a local definition is discussed and frozen', () => {
	it('freezing its discussion versions that same definition', () => {
		const own = local();
		const thread = openDiscussion(
			marco,
			{ title: 'Thursday dinner', about: { kind: 'definition', definitionId: own.id } },
			{ db }
		);
		const proposal = addProposal(marco, { discussionId: thread.id, body: 'Dinner at 7.' }, { db });

		freeze(
			ana,
			{
				discussionId: thread.id,
				proposalPostId: proposal.id,
				idempotencyKey: 'local-freeze',
				title: 'Thursday dinner',
				type: 'operational',
				mechanism: 'consent'
			},
			{ db }
		);

		const after = db.select().from(definition).where(eq(definition.id, own.id)).get()!;
		const version = db
			.select()
			.from(definitionVersion)
			.where(eq(definitionVersion.id, after.adoptedVersionId!))
			.get()!;
		expect(version).toMatchObject({ n: 1, body: 'Dinner at 7.' });
		expect(db.select().from(definition).all()).toHaveLength(1);
		expect(listDefinitions(lena, {}, { db })[0]).toMatchObject({ version: 1, status: 'adopted' });
		expect(localDefinitionContext(lena, own.id, { db })!.writtenDown).toBe(NOW);
	});

	it('refuses to open a discussion on another community’s definition', () => {
		const elsewhere = community('elsewhere');
		const olga = makeUser(db, { email: 'olga@example.org' });
		const seat = makeMembership(db, elsewhere.id, olga.id, { role: 'steward', isOwner: true });
		const theirs: Ctx = { user: olga, community: elsewhere, membership: seat, now: () => NOW };
		const own = local();

		expect(
			catchRefusal(() =>
				openDiscussion(
					theirs,
					{ title: 'x', about: { kind: 'definition', definitionId: own.id } },
					{ db }
				)
			)?.status
		).toBe(404);
	});
});
