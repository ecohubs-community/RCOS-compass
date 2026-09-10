import type { PageServerLoad } from './$types';

/**
 * Where the licences live now.
 *
 * They used to be two more paragraphs in a footer on every screen, which made
 * the footer tall enough to be in the way on the screens people actually work
 * on. The three documents a community agreed to stay in the footer — the
 * `legal-documents` spec requires them reachable from anywhere in the app, and
 * it is right to — but the standard's licence and attribution are reference,
 * read once, and belong on a page somebody goes to.
 *
 * No load of its own: the shell already resolves the standard's metadata, and a
 * second query for the same four strings would be a second answer to keep in
 * step with the first.
 */
export const load: PageServerLoad = () => ({});
