import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The privilege boundary, enforced rather than documented.
 *
 * docs/05-admin-console.md §2: a platform admin sees tenant metadata and never
 * community content. That holds only if the admin services cannot reach content
 * — so this asserts what they import, because a comment saying "don't" is not a
 * control, and the temptation to join one content table for one useful column is
 * exactly how the boundary erodes.
 */
const root = join(import.meta.dirname, '../..');
const adminServices = join(root, 'src/lib/server/services/admin');
const adminRoutes = join(root, 'src/routes/(admin)');

/** Tables and modules that hold what a community decided. */
const CONTENT = [
	'definition',
	'discussion',
	'proposal',
	'decision',
	'document',
	'passage',
	'evidence',
	'consentRound',
	'objection',
	'selfAudit',
	'learningEntry',
	'services/definitions',
	'services/discussions',
	'services/decisions',
	'services/documents',
	'services/standard'
];

function filesIn(dir: string): string[] {
	try {
		statSync(dir);
	} catch {
		return [];
	}
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);
		return statSync(path).isDirectory() ? filesIn(path) : [path];
	});
}

function importsOf(file: string): string[] {
	const source = readFileSync(file, 'utf8');
	return [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);
}

describe('admin services see metadata, never content', () => {
	const files = filesIn(adminServices).filter((f) => f.endsWith('.ts'));

	it('there are admin services to check', () => {
		expect(files.length).toBeGreaterThan(0);
	});

	it.each(files.map((f) => relative(root, f)))('%s imports no content', (relativePath) => {
		const imports = importsOf(join(root, relativePath));
		const offending = imports.filter((specifier) =>
			CONTENT.some((name) => specifier.includes(name))
		);
		expect(
			offending,
			`${relativePath} imports content: ${offending.join(', ')} — docs/05-admin-console.md §2`
		).toEqual([]);
	});

	it.each(files.map((f) => relative(root, f)))('%s names no content table', (relativePath) => {
		const source = readFileSync(join(root, relativePath), 'utf8');
		// Catches a raw query that skips the import boundary.
		const named = CONTENT.filter((name) =>
			new RegExp(`\\b${name}\\b`).test(source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ''))
		);
		expect(named, `${relativePath} refers to content: ${named.join(', ')}`).toEqual([]);
	});
});

describe('admin routes reach only admin services', () => {
	const files = filesIn(adminRoutes).filter((f) => f.endsWith('.ts'));

	it.each(files.length > 0 ? files.map((f) => relative(root, f)) : ['(no admin routes yet)'])(
		'%s',
		(relativePath) => {
			if (relativePath.startsWith('(no ')) {
				expect(true).toBe(true);
				return;
			}
			const imports = importsOf(join(root, relativePath));
			const offending = imports.filter(
				(specifier) => specifier.includes('services/') && !specifier.includes('services/admin')
			);
			expect(offending, `${relativePath} reaches past the admin services`).toEqual([]);
		}
	);
});
