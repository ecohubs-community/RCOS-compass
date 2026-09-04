import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extensionOf, sniff, SNIFF_BYTES } from '../../src/lib/server/documents/sniff.js';

/**
 * Name and contents have to agree. docs/04-security.md §5.1.
 *
 * The table is small enough to test exhaustively, and worth testing that way:
 * every cell where a name and a content type disagree is a cell where accepting
 * the file would let somebody store an arbitrary binary on a domain members
 * trust, and serve it from there.
 */
const FIXTURES = join(import.meta.dirname, '../fixtures/documents');
const head = (name: string) => readFileSync(join(FIXTURES, name)).subarray(0, SNIFF_BYTES);

const bytes = (text: string) => new TextEncoder().encode(text);

describe('a file is what its contents say', () => {
	it.each([
		['valle-verde-bylaws.pdf', 'pdf'],
		['valle-verde-bylaws.docx', 'docx'],
		['valle-verde-bylaws.odt', 'odt']
	])('accepts %s', (name, type) => {
		expect(sniff(name, head(name))).toEqual({ ok: true, type });
	});

	it('accepts text and markdown, which have no signature', () => {
		expect(sniff('notes.txt', bytes('Minutes of the assembly.\n'))).toEqual({
			ok: true,
			type: 'txt'
		});
		expect(sniff('notes.md', bytes('# Minutes\n\n- one\n'))).toEqual({ ok: true, type: 'md' });
	});
});

describe('a file is not what its name says', () => {
	it('refuses an executable named .pdf', () => {
		const result = sniff('not-really.pdf', head('not-really.pdf'));
		expect(result.ok).toBe(false);
		expect(result.ok === false && result.reason).toMatch(/name and contents disagree/);
	});

	it('refuses a docx named .odt, and the other way round', () => {
		expect(sniff('bylaws.odt', head('valle-verde-bylaws.docx')).ok).toBe(false);
		expect(sniff('bylaws.docx', head('valle-verde-bylaws.odt')).ok).toBe(false);
	});

	it('refuses a PDF named .txt', () => {
		expect(sniff('bylaws.txt', head('valle-verde-bylaws.pdf')).ok).toBe(false);
	});

	it('refuses a plain zip wearing either Office extension', () => {
		// An archive is not a document, whatever it is called.
		const plainZip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
		expect(sniff('stuff.docx', plainZip).ok).toBe(false);
		expect(sniff('stuff.odt', plainZip).ok).toBe(false);
	});

	it('refuses binary wearing a text extension', () => {
		expect(sniff('notes.txt', new Uint8Array([0x00, 0x01, 0x02])).ok).toBe(false);
	});

	it('refuses a type that is not on the list at all', () => {
		for (const name of ['run.sh', 'page.html', 'icon.svg', 'archive.zip', 'noextension']) {
			const result = sniff(name, bytes('anything'));
			expect(result.ok, name).toBe(false);
		}
	});
});

describe('extensionOf', () => {
	it('takes the last one, lowercased', () => {
		expect(extensionOf('Bylaws.Final.PDF')).toBe('pdf');
		expect(extensionOf('bylaws')).toBe('');
	});

	it('is not fooled by a dot in a directory name', () => {
		// The multipart filename field is whatever the client puts in it.
		expect(extensionOf('v1.0/bylaws')).toBe('');
		expect(extensionOf('docs\\2019\\bylaws.pdf')).toBe('pdf');
	});

	it('does not read a dotfile as an extension', () => {
		expect(extensionOf('.bylaws')).toBe('');
	});
});
