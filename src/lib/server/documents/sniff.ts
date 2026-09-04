/**
 * What a file actually is, as opposed to what it is called.
 * docs/04-security.md §5.1.
 *
 * The rule is that **extension and sniffed content must agree**. An extension is
 * a claim made by whoever uploaded the file; the first few bytes are a fact about
 * it. A file called `bylaws.pdf` that begins `MZ` is a Windows executable, and
 * accepting it because of its name is how an upload form becomes a way to store
 * and serve arbitrary binaries from a domain members trust.
 *
 * Written here rather than taken as a dependency, deliberately. The allowlist is
 * five formats, three of which are one signature each; a general-purpose sniffer
 * would bring a hundred formats we must reject anyway, and the interesting part —
 * deciding that a zip is specifically a docx and not an odt — it would not do.
 */

/** The types a community may upload. Everything else is refused. */
export const ACCEPTED = ['pdf', 'docx', 'odt', 'md', 'txt'] as const;
export type AcceptedType = (typeof ACCEPTED)[number];

export const MIME: Record<AcceptedType, string> = {
	pdf: 'application/pdf',
	docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	odt: 'application/vnd.oasis.opendocument.text',
	md: 'text/markdown',
	txt: 'text/plain'
};

export type SniffResult = { ok: true; type: AcceptedType } | { ok: false; reason: string };

/** How many bytes the decision needs. The zip case reads furthest. */
export const SNIFF_BYTES = 4096;

const startsWith = (bytes: Uint8Array, signature: number[]): boolean =>
	signature.every((byte, i) => bytes[i] === byte);

/** `%PDF-` */
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d];
/** `PK\x03\x04` — the start of any zip, which docx and odt both are. */
const ZIP = [0x50, 0x4b, 0x03, 0x04];

/**
 * Is this plausibly text a person wrote?
 *
 * Markdown and plain text have no signature, so the question has to be asked
 * the other way round: does it contain anything that text does not? A NUL byte
 * or a stray control character means something binary is wearing a `.txt`.
 */
function looksLikeText(bytes: Uint8Array): boolean {
	if (bytes.length === 0) return true;
	for (const byte of bytes) {
		if (byte === 0) return false;
		// Tab, newline and carriage return are the only control codes text uses.
		if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) return false;
	}
	// Valid UTF-8 as well: a Latin-1 file is fine, but a file that decodes to
	// replacement characters everywhere is not text in any encoding we can read.
	try {
		new TextDecoder('utf-8', { fatal: true }).decode(bytes);
		return true;
	} catch {
		return false;
	}
}

/**
 * Which OOXML/ODF flavour a zip is.
 *
 * Both formats put a recognisable name early in the archive, so the first few
 * kilobytes are enough: `.odt` writes an uncompressed `mimetype` entry first by
 * specification, and `.docx` names `word/document.xml` in its content types.
 * Anything else zip-shaped — a plain `.zip`, a jar, an epub — is refused, which
 * is the point: an archive is not a document.
 */
function zipFlavour(bytes: Uint8Array): AcceptedType | null {
	const head = new TextDecoder('latin1').decode(bytes);
	if (head.includes('mimetype') && head.includes('opendocument.text')) return 'odt';
	if (head.includes('word/document.xml') || head.includes('wordprocessingml')) return 'docx';
	return null;
}

/**
 * The extension a filename claims, lowercased and without the dot.
 *
 * Any directory part is dropped first. A browser sends a bare filename, but the
 * multipart field is whatever the client puts in it, and `v1.0/bylaws` has no
 * extension — reading one out of the directory name would be an answer to a
 * question nobody asked.
 */
export function extensionOf(filename: string): string {
	const base = filename.split(/[\\/]/).pop() ?? '';
	const at = base.lastIndexOf('.');
	return at <= 0 ? '' : base.slice(at + 1).toLowerCase();
}

/**
 * Decide what a file is, and refuse it when its name and its bytes disagree.
 *
 * `head` should be the first {@link SNIFF_BYTES}; the answer never depends on
 * more, which is what lets this run before the whole file has been accepted.
 */
export function sniff(filename: string, head: Uint8Array): SniffResult {
	const claimed = extensionOf(filename);
	if (!(ACCEPTED as readonly string[]).includes(claimed)) {
		return {
			ok: false,
			reason: `Compass reads PDF, Word, OpenDocument, Markdown and plain text. "${claimed || filename}" is not one of those.`
		};
	}
	const type = claimed as AcceptedType;

	const disagrees = (what: string): SniffResult => ({
		ok: false,
		reason: `That file is named .${type} but its contents are ${what}. Compass refuses files whose name and contents disagree.`
	});

	if (startsWith(head, PDF)) {
		return type === 'pdf' ? { ok: true, type } : disagrees('a PDF');
	}

	if (startsWith(head, ZIP)) {
		const flavour = zipFlavour(head);
		if (!flavour) return disagrees('an archive of some other kind');
		return flavour === type ? { ok: true, type } : disagrees(`a ${flavour} file`);
	}

	if (type === 'pdf') return disagrees('not a PDF');
	if (type === 'docx' || type === 'odt') return disagrees('not an Office document');

	// `md` and `txt`, which have no signature of their own.
	return looksLikeText(head) ? { ok: true, type } : disagrees('binary rather than text');
}
