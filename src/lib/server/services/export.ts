import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, gt, lte } from 'drizzle-orm';
import { zipSync, strToU8 } from 'fflate';
import { communityOf, type Audience } from '../auth/audience.js';
import { requirePermission, type Ctx } from '../auth/guard.js';
import { visibleLevels } from '../auth/visible-to.js';
import { getConfig } from '../config.js';
import { getDb, type Db } from '../db/index.js';
import { newId } from '../db/id.js';
import { decision } from '../db/schema/decisions.js';
import { producedFile, type ProducedFile } from '../db/schema/self-audit.js';
import { community } from '../db/schema/tenancy.js';
import { standardViewFor } from './completeness.js';
import { listDecisions } from './decisions.js';
import { artifactToMarkdown, renderArtifact } from './render-artifact.js';

/**
 * A community taking everything it has and leaving.
 * `docs/10-legal-and-operations.md` §1.3, `docs/00` §9.
 *
 * The promise in the terms is that a community's data is its own. That is only
 * true if the bundle is usable **without us** — so the Markdown is plain, the
 * JSON is complete, and neither needs a network, a database or a running
 * Compass to make sense. `tests/integration/export.test.ts` unpacks the file
 * with nothing serving and reads it, because a suite whose web server is
 * running cannot demonstrate that.
 *
 * Everything is filtered by the requester's audience, and the manifest records
 * which visibility levels it contained — a bundle that quietly omits something
 * is worse than one that says what it left out.
 */

export type BundleManifest = {
	community: { slug: string; name: string };
	standard: { id: string; version: string; licence: string; attribution: string } | null;
	/** The application's own licence, named beside the standard's. */
	licence: string;
	exportedAt: string;
	/** What the exporter could see. A partial bundle that says so is honest. */
	visibilityLevels: string[];
	files: string[];
	counts: { artifacts: number; decisions: number };
	/**
	 * Whether the printable copy is in here.
	 *
	 * An instance without a headless browser produces the same bundle minus one
	 * file. Saying so is the difference between a bundle that is honestly
	 * smaller and one that silently varies.
	 */
	pdf: 'included' | 'unavailable on this instance';
};

/**
 * The application's licence, named in every bundle beside the standard's.
 *
 * `docs/00` §12a: PolyForm Noncommercial is not an OSI open-source licence, and
 * a bundle that says so is a bundle nobody has to guess about in five years.
 */
export const APPLICATION_LICENCE = 'PolyForm Noncommercial 1.0.0';

/** Built in memory: a community's whole governance is a few hundred kilobytes. */
export function buildBundle(
	db: Db,
	audience: Audience,
	now: number,
	extras: { pdf?: Uint8Array | null } = {}
): { filename: string; bytes: Uint8Array; manifest: BundleManifest } {
	const communityId = communityOf(audience);
	const home = db.select().from(community).where(eq(community.id, communityId)).get()!;
	const standard = standardViewFor(db, communityId);

	const files: Record<string, Uint8Array> = {};
	const names: string[] = [];
	const add = (path: string, contents: string) => {
		files[path] = strToU8(contents);
		names.push(path);
	};

	const artifacts = standard
		? standard.view.artifacts
				.map((artifact) => renderArtifact(db, audience, artifact.key))
				.filter((rendered) => rendered !== null)
		: [];

	for (const rendered of artifacts) {
		// One file per artifact, named for the key rather than the title: a title
		// is localised and a filename should not change language.
		add(`artifacts/${rendered.key}.md`, artifactToMarkdown(rendered));
	}

	const decisions = listDecisions(audience, { db });
	add('decisions.md', decisionRegister(decisions, home.name));
	add(
		'decisions.json',
		JSON.stringify(
			decisions.map((row) => ({
				ref: row.ref,
				title: row.title,
				type: row.type,
				layer: row.layer,
				mechanism: row.mechanism,
				threshold: row.threshold,
				tally: { present: row.tallyPresent, for: row.tallyFor, against: row.tallyAgainst },
				unresolvedObjections: row.unresolvedObjections,
				decidedAt: row.decidedAt.toISOString(),
				reviewDueAt: row.reviewDueAt?.toISOString() ?? null,
				provisional: row.provisional,
				status: row.status,
				proposalText: row.proposalText,
				rationale: row.rationale
			})),
			null,
			2
		)
	);

	if (extras.pdf) {
		files['governance.pdf'] = extras.pdf;
		names.push('governance.pdf');
	}

	const manifest: BundleManifest = {
		community: { slug: home.slug, name: home.name },
		standard: standard
			? {
					id: standard.row.standardId,
					version: standard.row.version,
					// From the standard's own metadata, so a standard published under
					// different terms carries those. `docs/00` §12a.
					licence: standard.view.meta.licence,
					attribution: standard.view.meta.attribution
				}
			: null,
		licence: APPLICATION_LICENCE,
		exportedAt: new Date(now).toISOString(),
		visibilityLevels: [...visibleLevels(audience)],
		files: [...names, 'manifest.json', 'README.md'],
		counts: { artifacts: artifacts.length, decisions: decisions.length },
		pdf: extras.pdf ? 'included' : 'unavailable on this instance'
	};
	add('manifest.json', JSON.stringify(manifest, null, 2));
	add('README.md', readme(manifest));

	return {
		filename: `${home.slug}-governance-${new Date(now).toISOString().slice(0, 10)}.zip`,
		bytes: zipSync(files, { level: 6 }),
		manifest
	};
}

/**
 * The register as Markdown. Shared with the mirror, which commits the same file:
 * a community reading its repository and a community reading its export must
 * not be given two different accounts of the same decisions.
 */
export function decisionRegister(rows: (typeof decision.$inferSelect)[], name: string): string {
	const lines = [`# ${name} — decision register`, ''];
	if (rows.length === 0) lines.push('*No decisions have been recorded.*', '');
	for (const row of rows) {
		lines.push(
			`## ${row.ref} — ${row.title}`,
			'',
			`Decided ${row.decidedAt.toISOString().slice(0, 10)} · ${row.mechanism}${
				row.tallyFor !== null && row.tallyPresent !== null
					? ` · ${row.tallyFor} of ${row.tallyPresent} present`
					: ''
			}${row.provisional ? ' · provisional' : ''}`,
			'',
			row.proposalText,
			''
		);
		if (row.rationale) lines.push(`*${row.rationale}*`, '');
	}
	return lines.join('\n');
}

/**
 * The file somebody opens first, in five years, with no idea what this is.
 *
 * Written into the bundle rather than assumed, because "readable without the
 * app" includes being intelligible to a person who never used it.
 */
function readme(manifest: BundleManifest): string {
	return [
		`# ${manifest.community.name}`,
		'',
		`This is a complete export of how ${manifest.community.name} governs itself, taken on ${manifest.exportedAt.slice(0, 10)}.`,
		'',
		'Everything here is plain Markdown and JSON. You do not need any particular',
		'software to read it, and nothing in it requires a network connection.',
		'',
		'- `artifacts/` — one file per governance document, with the text the',
		'  community adopted and how each part was decided.',
		'- `decisions.md` and `decisions.json` — the decision register: what was',
		'  decided, when, by what mechanism, and with what tally.',
		'- `manifest.json` — what this bundle contains and what it does not.',
		'',
		manifest.standard
			? `The community works against ${manifest.standard.id} v${manifest.standard.version}, an open standard for community governance. Anything marked as a community addition is a rule they wrote for themselves, which the standard does not ask for.`
			: '',
		'',
		'## Licences',
		'',
		manifest.standard
			? `The standard's own text is ${manifest.standard.licence} — ${manifest.standard.attribution}. It stays under those terms wherever it appears, including here.`
			: '',
		'',
		`The software that produced this bundle is licensed under ${manifest.licence}. That is not an OSI open-source licence, and the community's own words in this bundle are the community's, under no licence of ours.`,
		'',
		`This bundle contains what the person who exported it could see (${manifest.visibilityLevels.join(', ')}).`,
		''
	].join('\n');
}

/**
 * Signed with a key derived from `BETTER_AUTH_SECRET`, not a new variable.
 *
 * A new required variable means every existing deployment fails to boot for a
 * feature it may never use, and an optional one means a feature that silently
 * does nothing. The domain separator is what keeps this key from being the auth
 * key: signing an export link must not produce anything a session check would
 * accept, and vice versa.
 */
const DOMAIN = 'rcos-compass/export-link/v1';

export function signDownload(fileId: string, expiresAt: number): string {
	const payload = `${fileId}.${expiresAt}`;
	const mac = createHmac('sha256', `${DOMAIN}:${getConfig().BETTER_AUTH_SECRET}`)
		.update(payload)
		.digest('base64url');
	return `${payload}.${mac}`;
}

export function verifyDownload(token: string, now: number): { fileId: string } | null {
	const parts = token.split('.');
	if (parts.length !== 3) return null;
	const [fileId, expiresAtRaw, mac] = parts as [string, string, string];

	const expiresAt = Number(expiresAtRaw);
	if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;

	const expected = createHmac('sha256', `${DOMAIN}:${getConfig().BETTER_AUTH_SECRET}`)
		.update(`${fileId}.${expiresAtRaw}`)
		.digest('base64url');

	// Constant-time, because the alternative leaks the signature a byte at a time
	// to anybody willing to make a few thousand requests.
	const a = Buffer.from(mac);
	const b = Buffer.from(expected);
	if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

	return { fileId };
}

/** One hour: long enough to paste into an email, short enough not to outlive the sitting. */
export const EXPORT_LINK_TTL_MS = 60 * 60_000;
/** The file itself outlives the link, so a steward can regenerate one without re-exporting. */
export const EXPORT_FILE_TTL_MS = 7 * 24 * 60 * 60_000;

export function recordBundle(
	db: Db,
	ctx: Ctx,
	built: { filename: string; bytes: Uint8Array; manifest: BundleManifest },
	storageKey: string
): ProducedFile {
	const id = newId();
	db.insert(producedFile)
		.values({
			id,
			communityId: ctx.community.id,
			kind: 'export',
			storageKey,
			filename: built.filename,
			bytes: built.bytes.byteLength,
			levels: built.manifest.visibilityLevels,
			requestedBy: ctx.user.id,
			createdAt: new Date(ctx.now()),
			expiresAt: new Date(ctx.now() + EXPORT_FILE_TTL_MS)
		})
		.run();
	return db.select().from(producedFile).where(eq(producedFile.id, id)).get()!;
}

/** The exports a community can still download. */
export function listExports(ctx: Ctx, options: { db?: Db } = {}): ProducedFile[] {
	requirePermission(ctx, 'community.export');
	const db = options.db ?? getDb();
	return db
		.select()
		.from(producedFile)
		.where(
			and(
				eq(producedFile.communityId, ctx.community.id),
				gt(producedFile.expiresAt, new Date(ctx.now()))
			)
		)
		.orderBy(desc(producedFile.createdAt))
		.all();
}

/** Files past their date, for the cleanup job. */
export function expiredFiles(db: Db, now: number): ProducedFile[] {
	return db
		.select()
		.from(producedFile)
		.where(lte(producedFile.expiresAt, new Date(now)))
		.all();
}
