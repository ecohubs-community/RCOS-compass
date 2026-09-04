import { join } from 'node:path';

/**
 * The documents P4 is tested against. `scripts/make-document-fixtures.mjs`
 * builds them; `pnpm fixtures:documents` regenerates them.
 *
 * Built from a readable script rather than committed as opaque blobs, because
 * "what exactly is in the zip bomb" has to be a question with an answer.
 */
const DIR = join(import.meta.dirname, '../fixtures/documents');

export const DOCUMENTS = {
	/** Plausible bylaws with real sentences. The one the loop maps a passage from. */
	bylawsPdf: 'valle-verde-bylaws.pdf',
	bylawsDocx: 'valle-verde-bylaws.docx',
	/** RCOS publishes its templates in this format; a community fills one in. */
	bylawsOdt: 'valle-verde-bylaws.odt',
	/** Pages with no text operators at all — what a scan looks like to an extractor. */
	scan: 'scanned-minutes.pdf',
	/** Longer than the extraction ceiling, so the remainder must be reported. */
	tooLong: 'four-hundred-pages.pdf',
	/** ~219 KB on disk, 220 MB unpacked. */
	zipBomb: 'zip-bomb.docx',
	/** An ODT whose XML declares recursive entities — the billion-laughs shape. */
	hostileOdt: 'hostile.odt',
	/** A Windows executable wearing a PDF's name. */
	wrongType: 'not-really.pdf',
	/** Tells the model to mark every clause satisfied. `docs/06` §6.7. */
	injection: 'injection.pdf'
} as const;

export function fixturePath(name: string): string {
	return join(DIR, name);
}
