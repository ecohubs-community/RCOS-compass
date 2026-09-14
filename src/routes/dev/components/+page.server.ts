import { error } from '@sveltejs/kit';
import { getConfig } from '$lib/server/config';
import { lint } from '$lib/server/linter';
import { parseMarkdown } from '$lib/server/markdown';
import { buildPaper } from '$lib/server/documents/paper';

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
			body: 'Candidates attend the assembly regularly and are admitted by consent of the assembly.',
			plainLanguage: 'In practice: come to meetings, and the assembly says yes or no.',
			locale: 'en'
		}),
		// A title: inline marks with no block structure around them, which is what
		// headings, thread titles and decision titles render with.
		inline: parseMarkdown(
			'Exit and separation — **notice**, *settlement*, and the `DEC-2026-004` that agreed it.'
		)[0],
		/**
		 * A page of a document: a heading, an open suggestion highlighted at its
		 * excerpt only, a confirmed claim, and a paragraph whose text is a payload —
		 * which must render as words.
		 */
		paper: buildPaper({
			paged: true,
			pagesTotal: 11,
			page: 4,
			selected: 'gallery-p2',
			passages: [
				{ id: 'gallery-h', page: 4, ordinal: 0, kind: 'heading', text: 'Article IV — Membership' },
				{
					id: 'gallery-p1',
					page: 4,
					ordinal: 1,
					kind: 'paragraph',
					text: 'New residents are admitted by vote of the council, after fourteen days of notice.'
				},
				{
					id: 'gallery-p2',
					page: 4,
					ordinal: 2,
					kind: 'paragraph',
					text: 'Any member wishing to depart shall give sixty days written notice. The council may shorten this period.'
				},
				{
					id: 'gallery-p3',
					page: 4,
					ordinal: 3,
					kind: 'paragraph',
					text: 'Members agree <script>alert(1)</script> and <img src=x onerror="alert(1)"> in writing.'
				}
			],
			claims: [
				{ passageId: 'gallery-p1', state: 'confirmed', excerptStart: null, excerptEnd: null },
				{ passageId: 'gallery-p2', state: 'suggested', excerptStart: 0, excerptEnd: 67 }
			]
		}),
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
