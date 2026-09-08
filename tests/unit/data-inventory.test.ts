import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The inventory, checked against the schema. `docs/13-data-inventory.md`.
 *
 * A privacy policy is written from a list of what the product holds, and such a
 * list is accurate on the day it is written. This is what keeps it accurate: a
 * table that stores a name, an address or an IP and is not in the inventory
 * fails here, so the next phase to add one has to say what it is for before the
 * suite goes green.
 *
 * The heuristic is a floor rather than a ceiling — it finds columns named for
 * what they hold, and cannot find a person's name inside a column called `body`.
 * That limit is the reason §3 of the inventory exists and is written by hand.
 */
const SCHEMA = 'src/lib/server/db/schema';
const INVENTORY = 'docs/13-data-inventory.md';

/** Columns whose *name* says they hold something about a person. */
const PERSONAL = /^(name|.*_name|email|.*_email|ip|ip_address|user_agent|filename)$/;

/** Columns the pattern catches that are not about a person. */
const NOT_PERSONAL: Record<string, string> = {
	'community.name': 'The community’s own name, which it chose and publishes.',
	'community_artifact.name': 'A shelf a community named, not a person.',
	'standard.name': 'Part of the vendored standard.'
};

function tablesWithPersonalColumns(): Map<string, string[]> {
	const found = new Map<string, string[]>();

	for (const file of readdirSync(SCHEMA).filter((name) => name.endsWith('.ts'))) {
		const source = readFileSync(join(SCHEMA, file), 'utf8');
		const tables = [...source.matchAll(/sqliteTable\(\s*'([a-z_]+)'/g)];

		tables.forEach((match, index) => {
			const start = match.index! + match[0].length;
			const end = tables[index + 1]?.index ?? source.length;
			const columns = [...source.slice(start, end).matchAll(/text\('([a-z_]+)'/g)]
				.map((column) => column[1]!)
				.filter((column) => PERSONAL.test(column))
				.filter((column) => !NOT_PERSONAL[`${match[1]}.${column}`]);

			if (columns.length > 0) found.set(match[1]!, columns);
		});
	}

	return found;
}

describe('the data inventory is complete', () => {
	const inventory = readFileSync(INVENTORY, 'utf8');

	it('names every table that holds a name, an address or an IP', () => {
		// The table, named in a code span, with or without one of its columns
		// after it — the document talks about `document` and about
		// `decision_attendee.external_name`, and both are the table being named.
		const missing = [...tablesWithPersonalColumns().keys()].filter(
			(table) => !new RegExp('`' + table + '[.`]').test(inventory)
		);

		expect(
			missing,
			`tables holding personal data and missing from ${INVENTORY}: ${missing.join(', ')}`
		).toEqual([]);
	});

	it('finds something to check', () => {
		// A regex that matched nothing would make the test above pass forever.
		expect(tablesWithPersonalColumns().size).toBeGreaterThan(5);
	});

	it('says what erasure does, and where it does nothing', () => {
		// The tables erasure does *not* touch are the ones a community will ask
		// about, so the document has to say so rather than listing only the easy
		// half.
		expect(inventory).toMatch(/not automatic/i);
		expect(inventory).toMatch(/what has not been decided/i);
	});

	it('makes every exclusion say why', () => {
		for (const [column, because] of Object.entries(NOT_PERSONAL)) {
			expect(because.length, column).toBeGreaterThan(20);
		}
	});
});
