import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The commands a person actually types.
 *
 * Both bugs this suite exists for were found by running them rather than by
 * reading them, which is the point: `pnpm preview` refused to start with
 * "BETTER_AUTH_SECRET is required" while a perfectly good `.env` sat next to it,
 * and `pnpm db:migrate` pointed at a file nobody had written.
 *
 * Neither is exotic. Vite loads `.env` for `dev` and `build`; a plain `node`
 * invocation does not, and `adapter-node`'s output is a plain Node server. So the
 * built server has different configuration-loading behaviour from the dev server,
 * and nothing said so until someone tried it.
 */
const root = join(import.meta.dirname, '../..');
const scripts: Record<string, string> = JSON.parse(
	readFileSync(join(root, 'package.json'), 'utf8')
).scripts;

const entries = Object.entries(scripts);

describe('every script points at something that exists', () => {
	it.each(entries)('%s', (_name, command) => {
		const referenced = [...command.matchAll(/(scripts\/[\w.-]+)/g)].map((m) => m[1]!);
		for (const path of referenced) {
			expect(existsSync(join(root, path)), `${path} does not exist`).toBe(true);
		}
	});
});

/**
 * Does this file read configuration from the environment? A script that does and
 * is launched by plain `node` will see only the real environment, never `.env`.
 */
function readsEnv(path: string): boolean {
	if (path === 'build/index.js') return true; // the server, via hooks
	const file = join(root, path);
	if (!existsSync(file)) return false;
	return /process\.env/.test(readFileSync(file, 'utf8'));
}

describe('a script that needs configuration is given it', () => {
	const nodeScripts = entries.filter(([, command]) => /(^|\s)node\s/.test(command));

	it('there are node scripts to check', () => {
		expect(nodeScripts.length).toBeGreaterThan(0);
	});

	it.each(nodeScripts)('%s', (name, command) => {
		// The target is the last argument that looks like a file.
		const target = [...command.matchAll(/(?:^|\s)((?:scripts|build)\/[\w./-]+)/g)]
			.map((m) => m[1]!)
			.at(-1);
		if (!target || !readsEnv(target)) return;

		expect(
			command,
			`"${name}" runs ${target}, which reads the environment, with plain node — ` +
				'so it sees no .env and fails with a configuration error that looks like a ' +
				'missing variable. Add --env-file-if-exists=.env.'
		).toMatch(/--env-file(-if-exists)?=/);
	});

	it('does not demand an env file of scripts that read nothing', () => {
		// check-standard reads vendored YAML and no configuration; requiring the
		// flag there would be cargo cult rather than a rule.
		expect(readsEnv('scripts/check-standard.mjs')).toBe(false);
		expect(scripts['check:standard']).not.toMatch(/--env-file/);
	});
});

describe('the container is configured by its environment, not by a file', () => {
	it('the Dockerfile does not load a .env that will not be in the image', () => {
		const dockerfile = readFileSync(join(root, 'Dockerfile'), 'utf8');
		// A production container gets its configuration from the environment. An
		// image that expected a bundled .env would either ship secrets or start
		// misconfigured, and the boot check would report the wrong cause.
		expect(dockerfile).not.toMatch(/--env-file/);
	});
});
