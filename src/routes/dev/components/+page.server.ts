import { error } from '@sveltejs/kit';
import { getConfig } from '$lib/server/config';
import { lint } from '$lib/server/linter';
import { parseMarkdown } from '$lib/server/markdown';

/**
 * The gallery is a development and review surface; it never ships.
 *
 * Guarded on validated runtime configuration rather than on `dev` from
 * `$app/environment`. `dev` is a build-time constant, and the bundler tree-shook
 * the guard out entirely — the compiled route was `function load() {}`, so the
 * page was served by production builds despite the check. A runtime check cannot
 * be optimised away, and it is the same mechanism the `__test` routes use.
 */
export function load() {
	if (getConfig().isProduction) error(404, 'Not found');

	// Parsed here because the parser is server-side: the safety argument lives
	// there, and there is no reason to ship a Markdown parser to the browser to
	// render text the server has already parsed.
	return {
		// A definition with something wrong with it, and something right: the panel
		// shows both, because one that only ever complains gets closed.
		linter: lint({
			type: 'enforceable',
			body: 'Candidates attend the assembly regularly and are admitted by consent of the assembly.',
			plainLanguage: 'In practice: come to meetings, and the assembly says yes or no.',
			locale: 'en'
		}).findings,
		markdown: parseMarkdown(
			[
				'A member **may** leave at any time, with *notice* where practical.',
				'',
				'## What happens to their things',
				'',
				'- Personal property leaves with them',
				'- Commons contributions stay, per the [Treasury Ruleset](/c/valle-verde)',
				'',
				'> Agreed at the assembly of 12 June.',
				'',
				'Payloads render as words, never as behaviour: ' +
					'<img src=x onerror="alert(1)"> and [this link](javascript:alert(1)).'
			].join('\n')
		)
	};
}
