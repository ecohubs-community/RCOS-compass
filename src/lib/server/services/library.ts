import { and, desc, eq } from 'drizzle-orm';
import type { Ctx } from '../auth/guard.js';
import { requireRead, visibleTo } from '../auth/visible-to.js';
import { communityOf } from '../auth/audience.js';
import { getDb, type Db } from '../db/index.js';
import { user } from '../db/schema/auth.js';
import { document, documentFileVersion } from '../db/schema/documents.js';
import { membership } from '../db/schema/tenancy.js';
import { languageCoverage } from './evidence.js';
import { listVersions } from './document-versions.js';
import { libraryCounts, type DocumentCounts } from './mapping-counts.js';
import {
	mappingStateOf,
	scanIsStalled,
	type MappingState,
	type PrimaryAction,
	type ScanStatus
} from './mapping-state.js';
import { personLabel } from './person.js';

/**
 * The Documents library, as the screen needs it. Design 09; the change's
 * `document-library` spec.
 *
 * Everything a row shows is derived here from rows that already exist — the
 * state from `mappingStateOf`, the numbers from one grouped query — so the list
 * and the workspace a row opens tell the same story. Names go through
 * `personLabel`, so an erased uploader reads as a former member here as
 * everywhere else.
 */

export type LibraryFilter = 'all' | 'not_mapped' | 'mapped';
export const LIBRARY_FILTERS: readonly LibraryFilter[] = ['all', 'not_mapped', 'mapped'];

export type LibraryRow = {
	id: string;
	filename: string;
	/** `PDF`, `DOC`, `ODT`, `MD`, `TXT` — a label for the file's kind, not its extension. */
	kind: string;
	bytes: number;
	/** Pages for a PDF; null for formats with no page of their own. */
	pages: number | null;
	uploadedAt: number;
	uploader: string | null;
	state: MappingState;
	primaryAction: PrimaryAction;
	statusDetail: string | null;
	scanStatus: ScanStatus;
	scanDetail: string | null;
	counts: Omit<DocumentCounts, 'documentId'>;
	/** Mapped by hand only, with no scan yet — worded differently on the row. */
	byHandOnly: boolean;
};

const KIND: Record<string, string> = {
	'application/pdf': 'PDF',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOC',
	'application/vnd.oasis.opendocument.text': 'ODT',
	'text/markdown': 'MD',
	'text/plain': 'TXT'
};

export function kindOf(mime: string): string {
	return KIND[mime] ?? 'FILE';
}

/** Which filter a state belongs to, beyond "all" — the design's own counts. */
function filterOf(state: MappingState): LibraryFilter | null {
	if (state === 'not_scanned') return 'not_mapped';
	if (state === 'in_progress' || state === 'mapped') return 'mapped';
	return null;
}

export function libraryView(
	ctx: Ctx,
	filter: LibraryFilter,
	options: { db?: Db } = {}
): {
	rows: LibraryRow[];
	counts: Record<LibraryFilter, number>;
	coverage: { have: number; of: number };
} {
	const audience = requireRead(ctx);
	const db = options.db ?? getDb();
	const now = ctx.now();
	const counts = libraryCounts(ctx, { db });

	const found = db
		.select({
			document,
			name: user.name,
			erasedAt: user.erasedAt,
			displayName: membership.displayName,
			seq: membership.seq
		})
		.from(document)
		.leftJoin(user, eq(user.id, document.uploadedBy))
		.leftJoin(
			membership,
			and(eq(membership.userId, document.uploadedBy), eq(membership.communityId, ctx.community.id))
		)
		.where(
			and(eq(document.communityId, communityOf(audience)), visibleTo(audience, document.visibility))
		)
		.orderBy(desc(document.uploadedAt))
		.all();

	const all: LibraryRow[] = found.map(({ document: row, name, erasedAt, displayName, seq }) => {
		const count = counts.get(row.id) ?? {
			documentId: row.id,
			paragraphs: 0,
			paragraphsRead: 0,
			identified: 0,
			open: 0,
			becameDefinitions: 0,
			governancePages: 0,
			versions: 0,
			confirmedClaims: 0
		};
		const decided = mappingStateOf({
			status: row.status,
			scanStatus: row.scanStatus,
			scanStalled: scanIsStalled(row, now),
			identified: count.identified,
			open: count.open,
			doneAt: row.mappingDoneAt?.getTime() ?? null
		});
		const { documentId: _id, ...numbers } = count;
		return {
			id: row.id,
			filename: row.filename,
			kind: kindOf(row.mime),
			bytes: row.bytes,
			pages: row.mime === 'application/pdf' ? row.pagesTotal : null,
			uploadedAt: row.uploadedAt.getTime(),
			uploader:
				row.uploadedBy === null
					? null
					: personLabel({ name, erasedAt: erasedAt ?? null, displayName, seq }),
			state: decided.state,
			primaryAction: decided.primaryAction,
			statusDetail: row.statusDetail,
			scanStatus: row.scanStatus,
			scanDetail: row.scanDetail,
			counts: numbers,
			byHandOnly: row.scanStatus === 'none' && count.identified > 0
		};
	});

	const tally: Record<LibraryFilter, number> = { all: all.length, not_mapped: 0, mapped: 0 };
	for (const row of all) {
		const bucket = filterOf(row.state);
		if (bucket) tally[bucket] += 1;
	}

	return {
		rows: filter === 'all' ? all : all.filter((row) => filterOf(row.state) === filter),
		counts: tally,
		coverage: languageCoverage(ctx, { db })
	};
}

export type VersionRow = {
	id: string;
	filename: string;
	bytes: number;
	uploadedAt: number;
	uploader: string | null;
	supersededAt: number;
	supersededBy: string | null;
};

/** A document's earlier files, with the people behind each named through `personLabel`. */
export function versionsWithPeople(
	ctx: Ctx,
	documentId: string,
	options: { db?: Db } = {}
): VersionRow[] {
	const db = options.db ?? getDb();
	const versions = listVersions(ctx, documentId, { db });
	if (versions.length === 0) return [];

	const labelOf = (userId: string | null): string | null => {
		if (userId === null) return null;
		const person = db
			.select({
				name: user.name,
				erasedAt: user.erasedAt,
				displayName: membership.displayName,
				seq: membership.seq
			})
			.from(user)
			.leftJoin(
				membership,
				and(eq(membership.userId, user.id), eq(membership.communityId, ctx.community.id))
			)
			.where(eq(user.id, userId))
			.get();
		return person ? personLabel({ ...person, erasedAt: person.erasedAt ?? null }) : null;
	};

	return versions.map((row: typeof documentFileVersion.$inferSelect) => ({
		id: row.id,
		filename: row.filename,
		bytes: row.bytes,
		uploadedAt: row.uploadedAt.getTime(),
		uploader: labelOf(row.uploadedBy),
		supersededAt: row.supersededAt.getTime(),
		supersededBy: labelOf(row.supersededBy)
	}));
}
