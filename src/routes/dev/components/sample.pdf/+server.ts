import { error } from '@sveltejs/kit';
import { getConfig } from '$lib/server/config';
import { pdf } from '../../../../../scripts/make-document-fixtures.mjs';

/**
 * The PDF the gallery's original view draws. Development only, guarded on
 * runtime configuration like the gallery page itself, and built by the fixture
 * script so what it contains is written down.
 */
export function GET() {
	if (getConfig().isProduction) error(404, 'Not found');
	const bytes = pdf([
		{
			ops: [
				{ x: 72, y: 720, size: 16, text: 'Article IV — Membership' },
				{
					x: 72,
					y: 680,
					size: 11,
					text: 'New residents are admitted by vote of the council, after'
				},
				{ x: 72, y: 664, size: 11, text: 'fourteen days of notice posted in the common house.' },
				{
					x: 72,
					y: 632,
					size: 11,
					text: 'Any member wishing to depart shall give sixty days notice.'
				},
				{ x: 72, y: 616, size: 11, text: 'The council may shorten this period at its discretion.' }
			]
		},
		'Page two of the agreements.'
	]);
	return new Response(new Uint8Array(bytes), {
		headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' }
	});
}
