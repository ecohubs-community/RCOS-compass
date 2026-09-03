import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../../src/lib/server/clock.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { claim, enqueue, fail as failJob } from '../../src/lib/server/jobs/index.js';
import { auditActionsSeen, listPlatformAudit } from '../../src/lib/server/services/admin/audit.js';
import {
	changeTenantSlug,
	createTenant,
	renameTenant,
	setTenantLimits,
	suspendTenant,
	type AdminActor
} from '../../src/lib/server/services/admin/communities.js';
import { instanceStatus } from '../../src/lib/server/services/admin/status.js';
import { createTestDb } from '../support/db.js';
import { makeUser } from '../support/factories.js';

/**
 * The two read-only screens: the platform audit log (§3.4) and instance status
 * (§3.5). Both are metadata surfaces, and both are the pages an operator reads
 * when something has gone wrong — so what they show has to be right.
 */
const START = Date.UTC(2026, 8, 2, 12, 0, 0);

let db: Db;
let cleanup: () => void;
let clock: ReturnType<typeof fixedClock>;
let actor: AdminActor;

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	clock = fixedClock(START);
	const admin = makeUser(db, { email: 'ops@example.org' });
	actor = { userId: admin.id, email: admin.email, ip: '203.0.113.9' };
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

function tenant(slug = 'valle-verde', name = 'Valle Verde') {
	return createTenant(db, clock, actor, { name, slug, ownerEmail: `owner-${slug}@example.org` })
		.communityId;
}

describe('the platform audit log', () => {
	it('names the community rather than making an operator hold ids', () => {
		const id = tenant();
		renameTenant(db, clock, actor, id, 'Valle Verde Ecoaldea');

		const [event] = listPlatformAudit({ action: 'community.renamed' }, db);
		expect(event!.communityName).toBe('Valle Verde Ecoaldea');
		expect(event!.communityId).toBe(id);
	});

	it('flattens a scalar before/after into one readable change', () => {
		const id = tenant();
		renameTenant(db, clock, actor, id, 'Valle Verde Ecoaldea');

		const [event] = listPlatformAudit({ action: 'community.renamed' }, db);
		expect(event!.changes).toEqual([
			{ field: 'value', from: 'Valle Verde', to: 'Valle Verde Ecoaldea' }
		]);
	});

	it('flattens a per-field before/after and shows only what moved', () => {
		const id = tenant();
		setTenantLimits(
			db,
			clock,
			actor,
			id,
			{ maxMembers: 150, storageMb: null, aiMonthlyTokens: null },
			'pilot allocation'
		);

		const [event] = listPlatformAudit({ action: 'community.limits_changed' }, db);
		expect(event!.changes).toEqual([{ field: 'maxMembers', from: '—', to: '150' }]);
		// The reason is not a before/after pair, so it is carried as a note.
		expect(event!.notes).toEqual(
			expect.arrayContaining([{ key: 'reason', value: 'pilot allocation' }])
		);
	});

	it('filters by community, by action, and by actor or address', () => {
		const a = tenant('valle-verde', 'Valle Verde');
		const b = tenant('other-place', 'Other Place');
		renameTenant(db, clock, actor, a, 'Renamed A');
		suspendTenant(db, clock, actor, b, 'non-payment');

		expect(listPlatformAudit({ communityId: a }, db).every((e) => e.communityId === a)).toBe(true);
		expect(listPlatformAudit({ action: 'community.suspended' }, db)).toHaveLength(1);
		expect(listPlatformAudit({ actor: '203.0.113' }, db).length).toBeGreaterThan(0);
		expect(listPlatformAudit({ actor: 'nobody@nowhere' }, db)).toHaveLength(0);
	});

	it('finds nothing for an action nobody has ever performed, rather than failing', () => {
		tenant();
		expect(listPlatformAudit({ action: 'not-a-real-action' }, db)).toEqual([]);
	});

	it('offers only actions that actually appear in the trail', () => {
		const id = tenant();
		changeTenantSlug(db, clock, actor, id, 'valle-verde-ec');

		const actions = auditActionsSeen(db);
		expect(actions).toContain('community.created');
		expect(actions).toContain('community.slug_changed');
		expect(actions).not.toContain('community.deleted');
	});

	it('is newest first, so the last thing that happened is the first thing read', () => {
		const id = tenant();
		renameTenant(db, clock, actor, id, 'Second');
		clock.advance(1_000);
		suspendTenant(db, clock, actor, id, 'later');

		const [first] = listPlatformAudit({}, db);
		expect(first!.action).toBe('community.suspended');
	});
});

describe('instance status', () => {
	it('reports the build, the migrations and a non-zero database size', () => {
		const status = instanceStatus(db);

		expect(status.buildSha).toBeTruthy();
		// The suite's database is migrated by createTestDb, so this proves the
		// query reads the real drizzle bookkeeping table rather than guessing.
		expect(status.migration.applied).toBeGreaterThan(0);
		expect(status.database.bytes).toBeGreaterThan(0);
	});

	it('counts tenants by status', () => {
		tenant('valle-verde');
		const b = tenant('other-place');
		suspendTenant(db, clock, actor, b, 'non-payment');

		expect(instanceStatus(db).tenants).toEqual({ active: 1, suspended: 1, deleted: 0 });
	});

	it('reports queue depth per kind', () => {
		enqueue(db, clock, { kind: 'prune-rate-limits' });
		enqueue(db, clock, { kind: 'prune-rate-limits' });

		const [kind] = instanceStatus(db).queue;
		expect(kind).toMatchObject({ kind: 'prune-rate-limits', pending: 2, running: 0, dead: 0 });
	});

	it('surfaces a job that gave up, with its message and not its payload', () => {
		const job = enqueue(db, clock, {
			kind: 'prune-rate-limits',
			payload: { secretish: 'a-document-id' },
			maxAttempts: 1
		});
		// Claim before failing: `attempts` is incremented by the claim, and it is
		// what `fail` compares against maxAttempts. Failing an unclaimed job
		// retries it, which is correct and is not what this test is about.
		claim(db, clock);
		failJob(db, clock, job.id, new Error('handler exploded'));

		const status = instanceStatus(db);
		expect(status.deadJobs).toHaveLength(1);
		expect(status.deadJobs[0]!.lastError).toContain('handler exploded');
		// A payload can name a document; rendering one would make this a content
		// surface by accident.
		expect(JSON.stringify(status.deadJobs)).not.toContain('a-document-id');
	});

	it('says plainly when mail is not configured', () => {
		// The vitest environment leaves SMTP_URL unset, which is exactly the state
		// an operator needs the page to shout about.
		expect(instanceStatus(db).subsystems.mail).toBe('unconfigured');
	});
});
