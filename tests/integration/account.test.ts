import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../../src/lib/server/db/index.js';
import { user } from '../../src/lib/server/db/schema/auth.js';
import { erasureSummary, renamePerson } from '../../src/lib/server/services/account.js';
import { personLabel } from '../../src/lib/server/services/person.js';
import { createTestDb } from '../support/db.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

const NOW = Date.UTC(2026, 8, 24, 12, 0, 0);

let db: Db;
let cleanup: () => void;

beforeEach(() => ({ db, cleanup } = createTestDb()));
afterEach(() => cleanup());

const nameOf = (id: string) => db.select().from(user).where(eq(user.id, id)).get()!;

/** What it throws when it refuses: `error(400, …)` from SvelteKit. */
function refusal(act: () => unknown): { status?: number; body?: { message?: string } } | null {
	try {
		act();
		return null;
	} catch (thrown) {
		return thrown as { status?: number; body?: { message?: string } };
	}
}

describe('renaming an account', () => {
	it('changes the name every surface prints, and nobody else’s', () => {
		const ana = makeUser(db, { name: 'Ana' });
		const lena = makeUser(db, { name: 'Lena Vogt' });

		expect(renamePerson(db, ana.id, '  Ana Restrepo  ', NOW + 1)).toBe('Ana Restrepo');

		const row = nameOf(ana.id);
		expect(row.name).toBe('Ana Restrepo');
		expect(row.updatedAt.getTime()).toBe(NOW + 1);
		// The one function every surface names people through reads the new name.
		expect(personLabel({ erasedAt: null, name: row.name })).toBe('Ana Restrepo');
		expect(nameOf(lena.id).name).toBe('Lena Vogt');
	});

	it.each([
		['empty', ''],
		['only spaces', '   '],
		['longer than an invitation allows', 'x'.repeat(101)],
		['not text at all', null]
	])('refuses a name that is %s, and keeps the old one', (_why, name) => {
		const ana = makeUser(db, { name: 'Ana Restrepo' });

		const refused = refusal(() => renamePerson(db, ana.id, name, NOW));

		expect(refused?.status).toBe(400);
		expect(refused?.body?.message).toBeTruthy();
		expect(nameOf(ana.id).name).toBe('Ana Restrepo');
	});
});

describe('what the erase section states before its button', () => {
	it('names every community the person will read as a former member in, ended ones included', () => {
		const ana = makeUser(db);
		const here = makeCommunity(db);
		const left = makeCommunity(db);
		const seat = makeMembership(db, here.id, ana.id);
		const old = makeMembership(db, left.id, ana.id, { ended: true });

		const summary = erasureSummary(db, ana.id);

		expect(summary.labels.sort()).toEqual(
			[seat.seq, old.seq].map((seq) => `M-${String(seq).padStart(4, '0')}`).sort()
		);
		expect(summary.ownsAnything).toBe(false);
	});

	it('warns an owner, who has to hand the community over first', () => {
		const ana = makeUser(db);
		makeMembership(db, makeCommunity(db).id, ana.id, { role: 'steward', isOwner: true });

		expect(erasureSummary(db, ana.id).ownsAnything).toBe(true);
	});
});
