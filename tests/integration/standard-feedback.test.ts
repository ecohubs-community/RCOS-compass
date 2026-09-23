import { eq } from 'drizzle-orm';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asSignedIn } from '../../src/lib/server/auth/audience.js';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import {
	communityArtifact,
	definition,
	standardFeedback
} from '../../src/lib/server/db/schema/definitions.js';
import { communityStandard, type Community } from '../../src/lib/server/db/schema/tenancy.js';
import { createDefinition } from '../../src/lib/server/services/definitions.js';
import { erasePerson } from '../../src/lib/server/services/erasure.js';
import { buildBundle } from '../../src/lib/server/services/export.js';
import { listStandardFeedback } from '../../src/lib/server/services/standard-feedback.js';
import { restrict } from '../../src/lib/server/services/visibility.js';
import { getStandard } from '../../src/lib/server/standard/index.js';
import { createTestDb } from '../support/db.js';
import { catchRefusal } from '../support/errors.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * Feedback on the standard, read back. `openspec/changes/standard-feedback-view`.
 *
 * The rows are written by ticking "RCOS should require this" on a new local
 * definition, and they are written here the same way — through
 * `createDefinition` — so what is read is a shape the product can produce.
 */
const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);
const CLAUSE = getStandard('rcos-core', '0.1').countableClauses()[0]!;

let db: Db;
let cleanup: () => void;
let ana: Ctx;
let lena: Ctx;
let shelf: string;
let bo: Ctx;

function seedCommunity(slug: string): { home: Community; shelf: string } {
	const home = makeCommunity(db, { slug });
	db.insert(communityStandard)
		.values({
			id: newId(),
			communityId: home.id,
			standardId: 'rcos-core',
			version: '0.1',
			status: 'active',
			adoptedAt: new Date(NOW),
			retiredAt: null
		})
		.run();
	const artifact = newId();
	db.insert(communityArtifact)
		.values({
			id: artifact,
			communityId: home.id,
			title: 'Community Agreements',
			description: null,
			layer: null,
			order: 0,
			kind: 'default',
			createdAt: new Date(NOW)
		})
		.run();
	return { home, shelf: artifact };
}

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);

	const valle = seedCommunity('valle-verde');
	shelf = valle.shelf;
	const steward = makeUser(db, { email: 'ana@example.org', name: 'Ana Restrepo' });
	ana = {
		user: steward,
		community: valle.home,
		membership: makeMembership(db, valle.home.id, steward.id, { role: 'steward', isOwner: true }),
		now: () => NOW
	} as Ctx;
	const member = makeUser(db, { email: 'lena@example.org', name: 'Lena Vogt' });
	lena = {
		...ana,
		user: member,
		membership: makeMembership(db, valle.home.id, member.id, { role: 'member' })
	};

	const fruit = seedCommunity('fruit-haven');
	const neighbour = makeUser(db, { email: 'bo@example.org', name: 'Bo Lindqvist' });
	bo = {
		user: neighbour,
		community: fruit.home,
		membership: makeMembership(db, fruit.home.id, neighbour.id, { role: 'steward', isOwner: true }),
		now: () => NOW
	} as Ctx;
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

/** A local definition with the box ticked, at a given moment. */
function record(ctx: Ctx, title: string, at = NOW, artifactId = shelf): string {
	return createDefinition(
		{ ...ctx, now: () => at },
		{
			scope: 'local',
			title,
			attach: { kind: 'community_artifact', artifactId },
			standardShouldRequireThis: true
		},
		{ db }
	).id;
}

describe('a community reads what it asked the standard for', () => {
	it('lists every entry, newest first, with its words, author, date and definition', () => {
		const older = record(lena, 'Quiet hours after ten', NOW - 86_400_000);
		const newer = record(ana, 'Guests staying longer than a week', NOW);

		const entries = listStandardFeedback(lena, { db });

		expect(entries.map((entry) => entry.body)).toEqual([
			'Guests staying longer than a week',
			'Quiet hours after ten'
		]);
		expect(entries[0]).toMatchObject({
			kind: 'gap',
			standard: { id: 'rcos-core', version: '0.1' },
			definitionId: newer,
			author: 'Ana Restrepo',
			createdAt: NOW
		});
		expect(entries[1]).toMatchObject({ definitionId: older, author: 'Lena Vogt' });
	});

	it('names the clause as the entry’s own version numbers it', () => {
		db.insert(standardFeedback)
			.values({
				id: newId(),
				communityId: ana.community.id,
				definitionId: null,
				clauseKey: CLAUSE.key,
				standardId: 'rcos-core',
				version: '0.1',
				kind: 'ambiguity',
				body: 'Which members count as present?',
				createdBy: lena.user.id,
				createdAt: new Date(NOW),
				sharedUpstream: false
			})
			.run();

		const [entry] = listStandardFeedback(ana, { db });
		expect(entry).toMatchObject({ clauseRef: CLAUSE.ref, definitionId: null, kind: 'ambiguity' });
	});

	it('keeps an entry whose definition has since been removed, without a link', () => {
		const id = record(lena, 'Pets in shared kitchens');
		db.delete(definition).where(eq(definition.id, id)).run();

		const [entry] = listStandardFeedback(ana, { db });
		expect(entry).toMatchObject({ body: 'Pets in shared kitchens', definitionId: null });
	});

	it('is empty for a community that has recorded nothing', () => {
		expect(listStandardFeedback(ana, { db })).toEqual([]);
	});
});

describe('only the people who may read it', () => {
	it('refuses a role that does not hold community.read, and returns nothing', () => {
		record(lena, 'Quiet hours after ten');
		const observer = { ...ana, membership: { ...ana.membership, role: 'observer' as never } };

		expect(catchRefusal(() => listStandardFeedback(observer, { db }))?.status).toBe(403);
	});

	it('never crosses between two communities', () => {
		record(lena, 'Quiet hours after ten');
		const theirs = seedFruitEntry();

		expect(listStandardFeedback(bo, { db }).map((entry) => entry.id)).toEqual([theirs]);
		expect(listStandardFeedback(ana, { db }).map((entry) => entry.body)).toEqual([
			'Quiet hours after ten'
		]);
	});

	it('does not follow a row that points at another community’s definition', () => {
		// A shape no service writes; the join is scoped anyway, so a bad row finds
		// nothing rather than somebody else's definition and its visibility.
		const foreign = record(bo, 'Their own rule', NOW, fruitShelf());
		db.delete(standardFeedback).run();
		db.insert(standardFeedback)
			.values({
				id: newId(),
				communityId: ana.community.id,
				definitionId: foreign,
				clauseKey: null,
				standardId: 'rcos-core',
				version: '0.1',
				kind: 'gap',
				body: 'Pointing across',
				createdBy: lena.user.id,
				createdAt: new Date(NOW),
				sharedUpstream: false
			})
			.run();

		expect(listStandardFeedback(ana, { db })).toEqual([]);
	});

	it('hides an entry whose definition is restricted from the reader', () => {
		const hidden = record(lena, 'A rule only the stewards may read');
		record(lena, 'Quiet hours after ten', NOW - 1);
		restrict(
			ana,
			{ type: 'definition', id: hidden },
			{
				justification: 'Asked for by the member it concerns.',
				audience: 'stewards',
				expiresAt: new Date(NOW + 86_400_000)
			},
			{ db }
		);

		expect(listStandardFeedback(lena, { db }).map((entry) => entry.body)).toEqual([
			'Quiet hours after ten'
		]);
		// The steward the exception names still sees it.
		expect(listStandardFeedback(ana, { db }).map((entry) => entry.body)).toContain(
			'A rule only the stewards may read'
		);
	});
});

describe('an erased author', () => {
	it('stays on the entry as a former member, never by name', () => {
		record(lena, 'Quiet hours after ten');
		erasePerson(db, { userId: lena.user.id, actorId: lena.user.id, now: NOW });

		const [entry] = listStandardFeedback(ana, { db });
		expect(entry!.body).toBe('Quiet hours after ten');
		expect(entry!.author).toMatch(/^Former member \(M-\d{4}\)$/);
		expect(entry!.author).not.toContain('Lena');
	});
});

describe('the export carries it', () => {
	const openBundle = (bytes: Uint8Array) => {
		const entries = unzipSync(bytes);
		return {
			names: Object.keys(entries),
			text: (path: string) => strFromU8(entries[path]!)
		};
	};

	it('as Markdown and JSON, named in the readme', () => {
		record(lena, 'Quiet hours after ten');

		const bundle = openBundle(buildBundle(db, asSignedIn(ana), NOW).bytes);

		expect(bundle.names).toEqual(
			expect.arrayContaining(['standard-feedback.md', 'standard-feedback.json'])
		);
		expect(bundle.text('standard-feedback.md')).toContain('## Quiet hours after ten');
		expect(bundle.text('standard-feedback.md')).toContain('Lena Vogt');
		expect(JSON.parse(bundle.text('standard-feedback.json'))).toEqual([
			{
				kind: 'gap',
				body: 'Quiet hours after ten',
				standard: { id: 'rcos-core', version: '0.1' },
				clauseRef: null,
				author: 'Lena Vogt',
				createdAt: new Date(NOW).toISOString()
			}
		]);
		expect(bundle.text('README.md')).toContain('standard-feedback.md');
		expect(JSON.parse(bundle.text('manifest.json')).counts.standardFeedback).toBe(1);
	});

	it('says there is none when nothing was recorded', () => {
		const bundle = openBundle(buildBundle(db, asSignedIn(ana), NOW).bytes);

		expect(bundle.text('standard-feedback.md')).toContain('No feedback on the standard');
		expect(JSON.parse(bundle.text('standard-feedback.json'))).toEqual([]);
	});

	it('leaves out an entry on a definition the exporter may not see', () => {
		const hidden = record(lena, 'A rule only the stewards may read');
		restrict(
			ana,
			{ type: 'definition', id: hidden },
			{
				justification: 'Asked for by the member it concerns.',
				audience: 'stewards',
				expiresAt: new Date(NOW + 86_400_000)
			},
			{ db }
		);

		const bundle = openBundle(buildBundle(db, asSignedIn(lena), NOW).bytes);
		expect(bundle.text('standard-feedback.md')).not.toContain('only the stewards');
		expect(bundle.text('standard-feedback.json')).not.toContain('only the stewards');
	});

	it('carries no erased name', () => {
		record(lena, 'Quiet hours after ten');
		erasePerson(db, { userId: lena.user.id, actorId: lena.user.id, now: NOW });

		const bundle = openBundle(buildBundle(db, asSignedIn(ana), NOW).bytes);
		const both = bundle.text('standard-feedback.md') + bundle.text('standard-feedback.json');
		expect(both).not.toContain('Lena');
		expect(both).toMatch(/Former member \(M-\d{4}\)/);
	});
});

/** The neighbouring community's shelf. */
function fruitShelf(): string {
	return db
		.select()
		.from(communityArtifact)
		.where(eq(communityArtifact.communityId, bo.community.id))
		.get()!.id;
}

/** One entry of the neighbour's own, returning its id. */
function seedFruitEntry(): string {
	record(bo, 'Harvest sharing', NOW, fruitShelf());
	return db
		.select()
		.from(standardFeedback)
		.where(eq(standardFeedback.communityId, bo.community.id))
		.get()!.id;
}
