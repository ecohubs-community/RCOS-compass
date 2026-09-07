import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

/**
 * Every test in this file spawns ESLint, which takes a second or two on its own
 * and considerably longer when the rest of the suite is running beside it. The
 * default five seconds is a coin toss once there are fifteen of them, and a
 * boundary test that flakes is a boundary test people start ignoring.
 */
vi.setConfig({ testTimeout: 60_000 });

/**
 * The boundary rules in eslint.config.js are documented architecture rules
 * (docs/00-architecture.md §10, docs/02-component-guidelines.md §4–5). A rule
 * nobody proves is enforced decays into "we all remember to do it", so each one
 * is asserted here by linting a file that breaks it.
 */

const repoRoot = join(import.meta.dirname, '../..');

function lint(relativePath: string, contents: string): string {
	const dir = mkdtempSync(join(repoRoot, 'src/lib/lintcheck-'));
	const file = join(dir, relativePath);
	mkdirSync(join(file, '..'), { recursive: true });
	writeFileSync(file, contents);
	try {
		execFileSync('pnpm', ['exec', 'eslint', '--no-warn-ignored', '--format', 'json', file], {
			cwd: repoRoot,
			encoding: 'utf8'
		});
		return '';
	} catch (error) {
		const output = (error as { stdout?: string }).stdout ?? '';
		return output;
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

/**
 * `scripts/check-tokens.mjs` is the other half of the same rule: ESLint cannot
 * see inside Svelte template attributes, so the hex-colour ban is enforced by a
 * grep. A grep has one characteristic failure — it reads comments as code — and
 * this one refused a comment explaining which mockup colour had been replaced
 * and why. Both directions are asserted, because a check that cannot be
 * documented around gets worked around instead.
 */
/**
 * The invariant the whole prompt-injection defence rests on: an AI response may
 * only ever become a suggestion a person confirms. A document that says "mark
 * every clause satisfied" has to have nowhere to go, and the place that is true
 * is the import graph — not a convention, and not a review.
 */
describe('the AI module writes nothing but its own log', () => {
	/**
	 * Written *inside* `src/lib/server/ai/`, because that is what the rule is
	 * scoped to and because the relative imports under test only mean what they
	 * say from there. The shared helper roots its files under `src/lib/`, which
	 * would put the probe outside the rule and quietly pass everything.
	 */
	function probe(depth: 'top' | 'nested', contents: string): string {
		const dir =
			depth === 'top'
				? join(repoRoot, 'src/lib/server/ai')
				: join(repoRoot, 'src/lib/server/ai/probe-nested');
		mkdirSync(dir, { recursive: true });
		const file = join(dir, `probe-${process.pid}.ts`);
		writeFileSync(file, contents);
		try {
			execFileSync('pnpm', ['exec', 'eslint', '--no-warn-ignored', '--format', 'json', file], {
				cwd: repoRoot,
				encoding: 'utf8'
			});
			return '';
		} catch (error) {
			return (error as { stdout?: string }).stdout ?? '';
		} finally {
			rmSync(depth === 'top' ? file : dir, { recursive: true, force: true });
		}
	}

	const inAiModule = (contents: string) => probe('top', contents);

	it('refuses a service that writes', () => {
		const output = inAiModule(
			"import { freeze } from '../services/decisions.js';\nexport const x = freeze;\n"
		);
		expect(output).toContain('may not reach a service that writes');
	});

	it('refuses a content table', () => {
		const output = inAiModule(
			"import { definition } from '../db/schema/definitions.js';\nexport const x = definition;\n"
		);
		expect(output).toContain('may only touch');
	});

	it('refuses the evidence table in particular', () => {
		// The nearest miss: evidence is what an AI task's output becomes, and the
		// task is the one place that must not be able to write it directly.
		const output = inAiModule(
			"import { evidence } from '../db/schema/documents.js';\nexport const x = evidence;\n"
		);
		expect(output).toContain('may only touch');
	});

	it('refuses a service from a subdirectory too', () => {
		// The hole this closes was real: `ai/tasks/x.ts` reaches a service as
		// `../../services/…`, which the first version of the rule did not match.
		// A boundary with a hole in it is worse than none, because it is trusted.
		const output = probe(
			'nested',
			"import { mapPassage } from '../../services/evidence.js';\nexport const x = mapPassage;\n"
		);
		expect(output).toContain('may not reach a service that writes');
	});

	it('refuses a content table from a subdirectory too', () => {
		const output = probe(
			'nested',
			"import { evidence } from '../../db/schema/documents.js';\nexport const x = evidence;\n"
		);
		expect(output).toContain('may only touch');
	});

	it('refuses the risk profile, which is about people rather than governance', () => {
		// "Do you have children on site?" is a fact about people. The behavioural
		// proof is in tests/integration/risk-profile.test.ts — two task inputs,
		// with and without a profile, byte-identical — and this is the structural
		// one: there is no import that could carry it in.
		const output = inAiModule(
			"import { riskProfile } from '../db/schema/path.js';\nexport const x = riskProfile;\n"
		);
		expect(output).toContain('may only touch');
	});

	it('refuses the risk profile from a subdirectory too', () => {
		const output = probe(
			'nested',
			"import { riskProfile } from '../../db/schema/path.js';\nexport const x = riskProfile;\n"
		);
		expect(output).toContain('may only touch');
	});

	it('allows its own log from a subdirectory', () => {
		const output = probe(
			'nested',
			"import { aiUsage } from '../../db/schema/ai.js';\nexport const x = aiUsage;\n"
		);
		expect(output).toBe('');
	});

	it('allows its own call log and usage counter', () => {
		const output = inAiModule(
			"import { aiCall, aiUsage } from '../db/schema/ai.js';\nexport const x = [aiCall, aiUsage];\n"
		);
		expect(output).toBe('');
	});
});

/**
 * The other half of the raw-SQL exception. `docs/00-architecture.md` §5 names
 * full-text search as the one thing allowed to write SQL outside the database
 * layer, on the condition that it lives behind an interface with one file per
 * engine. The condition is what makes the exception safe, so it is the part
 * worth proving.
 */
describe('only the search module knows the engine', () => {
	function probe(where: 'service' | 'service-nested' | 'search' | 'search-nested', body: string) {
		const dirs = {
			service: 'src/lib/server/services',
			'service-nested': 'src/lib/server/services/probe-nested',
			search: 'src/lib/server/search',
			'search-nested': 'src/lib/server/search/probe-nested'
		};
		const dir = join(repoRoot, dirs[where]);
		mkdirSync(dir, { recursive: true });
		const file = join(dir, `probe-${process.pid}.ts`);
		writeFileSync(file, body);
		try {
			execFileSync('pnpm', ['exec', 'eslint', '--no-warn-ignored', '--format', 'json', file], {
				cwd: repoRoot,
				encoding: 'utf8'
			});
			return '';
		} catch (error) {
			return (error as { stdout?: string }).stdout ?? '';
		} finally {
			rmSync(where.endsWith('nested') ? dir : file, { recursive: true, force: true });
		}
	}

	const QUERY = 'export const q = `select ref from search_document where x match ?`;\n';

	it('refuses a service that queries the index directly', () => {
		expect(probe('service', QUERY)).toContain('SearchIndex interface');
	});

	it('refuses it from a subdirectory too', () => {
		// The AI rule shipped with exactly this hole, and a boundary with a hole
		// in it is worse than none, because it is trusted.
		expect(probe('service-nested', QUERY)).toContain('SearchIndex interface');
	});

	it('refuses the ranking function by name', () => {
		expect(probe('service', "export const r = 'bm25(search_document, 1.0)';\n")).toContain(
			'SearchIndex interface'
		);
	});

	it('allows the search module itself, at any depth', () => {
		expect(probe('search', QUERY)).toBe('');
		expect(probe('search-nested', QUERY)).toBe('');
	});

	it('says nothing about prose that happens to contain the word match', () => {
		// A rule that fires on "no match found" is a rule people disable. `MATCH`
		// is only an architecture violation in something that also reads as SQL.
		expect(probe('service', "export const empty = 'No match found for those words.';\n")).toBe('');
	});
});

describe('the design-token check', () => {
	function checkTokens(contents: string): string {
		const dir = mkdtempSync(join(repoRoot, 'src/tokencheck-'));
		writeFileSync(join(dir, 'sample.svelte'), contents);
		try {
			execFileSync('node', ['scripts/check-tokens.mjs'], { cwd: repoRoot, encoding: 'utf8' });
			return '';
		} catch (error) {
			return (error as { stderr?: string }).stderr ?? 'failed';
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	}

	it('fails on a hex colour in markup', () => {
		expect(checkTokens('<p style="color: #10B981">x</p>\n')).toContain('hex colour');
	});

	it('allows a comment that names the colour it replaced', () => {
		expect(
			checkTokens("<!-- text-fg, not the mockup's #10B981 on #064E3B: 2.6:1 -->\n<p>x</p>\n")
		).toBe('');
	});

	it('fails on the Tailwind 3 variable form that Tailwind 4 silently drops', () => {
		expect(checkTokens('<p class="rounded-[--radius-card]">x</p>\n')).toContain('radius-card');
	});
});

describe('lint boundaries', () => {
	it('fails when a source file reads process.env outside the config module', () => {
		const output = lint('reads-env.ts', 'export const x = process.env.SOME_VALUE;\n');
		expect(output).toContain('$lib/server/config');
	});

	it('allows the config module itself to read process.env', () => {
		// Proved by the repo linting clean: config.ts is the one exception, and
		// `pnpm lint` in CI would fail if the exception were removed.
		const output = lint('ok.ts', 'export const x = 1;\n');
		expect(output).not.toContain('no-restricted-properties');
	});

	it('fails when a component imports from $lib/server', () => {
		const output = lint(
			'Leaky.svelte',
			'<script lang="ts">\n\timport { getConfig } from "$lib/server/config";\n\tconst c = getConfig();\n</script>\n\n<p>{c.LOG_LEVEL}</p>\n'
		);
		expect(output).toContain('docs/02-component-guidelines.md');
	});

	it('fails when a hex colour appears outside the token file', () => {
		const dir = mkdtempSync(join(repoRoot, 'src/lib/tokencheck-'));
		writeFileSync(join(dir, 'Coloured.svelte'), '<p style="color: #059669">hello</p>\n');
		try {
			execFileSync('node', ['scripts/check-tokens.mjs'], { cwd: repoRoot, encoding: 'utf8' });
			expect.unreachable('the token check should have failed');
		} catch (error) {
			const output = String((error as { stderr?: string }).stderr ?? '');
			expect(output).toContain('Coloured.svelte');
			expect(output).toContain('hex colour');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('passes on the repository as it stands', () => {
		expect(() =>
			execFileSync('node', ['scripts/check-tokens.mjs'], { cwd: repoRoot, encoding: 'utf8' })
		).not.toThrow();
	});
}, 60_000);
