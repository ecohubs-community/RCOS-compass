import { and, eq, inArray } from 'drizzle-orm';
import type { Ctx } from '../auth/guard.js';
import { getDb, type Db } from '../db/index.js';
import { user } from '../db/schema/auth.js';
import { evidence, type Document } from '../db/schema/documents.js';
import { membership } from '../db/schema/tenancy.js';
import { buildPaper, paragraphNumbers, type Paper } from '../documents/paper.js';
import { activeStandardView } from './completeness.js';
import { getDocument, listPassages, mappingInputFor } from './documents.js';
import { languageCoverage, reconfirmCandidates } from './evidence.js';
import { kindOf } from './library.js';
import { documentCounts, type DocumentCounts } from './mapping-counts.js';
import { scanAvailability, type ScanAvailability } from './mapping.js';
import {
	canMarkDone,
	mappingStateOf,
	scanIsLive,
	type MappingState,
	type ScanStatus
} from './mapping-state.js';
import { personLabel } from './person.js';
import type { Normativity } from '../standard/types.js';

/**
 * One document's mapping workspace, as the screen needs it. Designs 05 and 16b;
 * the change's `mapping-workspace` and `document-viewer` specs.
 *
 * The two-pane layout and the phone queue read the same object, so nothing
 * either offers can exist for one width only. Confidence is stored and never
 * leaves this module: a card says *why*, in a sentence, and not how sure a model
 * claimed to be.
 */

export type CardState = 'suggested' | 'confirmed' | 'dismissed';

export type WorkspaceCard = {
	evidenceId: string;
	passageId: string;
	page: number;
	/** ¶ within the page, paragraphs only. */
	number: number;
	/** The excerpt, where the claim has one; otherwise the whole passage. */
	quote: string;
	state: CardState;
	clauseKey: string;
	clauseRef: string;
	clauseTitle: string;
	reason: string | null;
	suggestedBy: 'ai' | 'human';
	excerpt: { start: number; end: number } | null;
	confirmer: string | null;
	confirmedAt: number | null;
	/** The clause has a section that answers it, so a definition can start here. */
	definable: boolean;
};

export type Requirement = {
	key: string;
	ref: string;
	title: string;
	text: string;
	normativity: Normativity;
	layer: number;
	layerName: string | null;
	artifact: string | null;
	/** "RCOS-Core v0.1" — the standard this community adopted, by name. */
	standard: string;
};

export type ClauseOption = {
	key: string;
	ref: string;
	title: string;
	question: string | null;
	layer: number;
};

export type WorkspaceView = {
	document: {
		id: string;
		filename: string;
		kind: string;
		status: Document['status'];
		statusDetail: string | null;
		pagesTotal: number | null;
		pagesExtracted: number | null;
		paged: boolean;
		scanStatus: ScanStatus;
		scanDetail: string | null;
	};
	state: MappingState;
	counts: Omit<DocumentCounts, 'documentId'>;
	coverage: { have: number; of: number };
	scan: {
		live: boolean;
		/** Null: this member cannot run AI at all, and no control is shown. */
		availability: ScanAvailability | null;
	};
	canMarkDone: boolean;
	done: boolean;
	paper: Paper;
	selected: string | null;
	cards: WorkspaceCard[];
	requirements: Record<string, Requirement>;
	clauses: ClauseOption[];
	reconfirm: {
		evidenceId: string;
		passageId: string;
		clauseRef: string;
		quote: string;
		confirmer: string | null;
		confirmedAt: number | null;
	}[];
	/** Identified passages on the page shown. */
	identifiedOnPage: number;
	/**
	 * The next passage with an open suggestion after the selected one, wrapping —
	 * to the selected one itself when it is the only one left. Null: nothing open.
	 */
	nextOpen: string | null;
};

const NO_COUNTS: Omit<DocumentCounts, 'documentId'> = {
	paragraphs: 0,
	paragraphsRead: 0,
	identified: 0,
	open: 0,
	becameDefinitions: 0,
	governancePages: 0,
	versions: 0,
	confirmedClaims: 0
};

const STANDARD_NAMES: Record<string, string> = { 'rcos-core': 'RCOS-Core' };

export function workspaceView(
	ctx: Ctx,
	documentId: string,
	asked: { page: number | null; passage: string | null },
	options: { db?: Db } = {}
): WorkspaceView {
	const db = options.db ?? getDb();
	const now = ctx.now();
	const found = getDocument(ctx, documentId, { db });
	const passages = listPassages(ctx, documentId, { db });
	const counted = documentCounts(ctx, documentId, { db });
	const { documentId: _id, ...counts } = counted ?? { documentId, ...NO_COUNTS };
	const input = mappingInputFor(ctx, found, now, { db });
	const standard = activeStandardView(db, ctx);
	const locale = ctx.community.locale as 'en';

	const passageIds = passages.map((row) => row.id);
	const claims =
		passageIds.length === 0
			? []
			: db
					.select({
						evidence,
						name: user.name,
						erasedAt: user.erasedAt,
						displayName: membership.displayName,
						seq: membership.seq
					})
					.from(evidence)
					.leftJoin(user, eq(user.id, evidence.confirmedBy))
					.leftJoin(
						membership,
						and(
							eq(membership.userId, evidence.confirmedBy),
							eq(membership.communityId, ctx.community.id)
						)
					)
					.where(
						and(eq(evidence.communityId, ctx.community.id), inArray(evidence.passageId, passageIds))
					)
					.all();

	const selected = passageIds.includes(asked.passage ?? '') ? asked.passage : null;
	const paged = found.mime === 'application/pdf';
	const paper = buildPaper({
		paged,
		pagesTotal: found.pagesTotal,
		passages,
		claims: claims.map(({ evidence: row }) => row),
		page: asked.page,
		selected
	});

	const numbers = paragraphNumbers(passages);
	const byId = new Map(passages.map((row) => [row.id, row]));
	const order = new Map(passages.map((row, index) => [row.id, index]));

	const titleOf = (key: string): string => {
		const clause = standard?.view.clause(key);
		if (!clause || !standard) return key;
		if (clause.owner) {
			const section = standard.view.section(clause.owner);
			if (section) return standard.view.localise(section.i18n, locale).value.title;
		}
		return clause.specSection?.title ?? clause.ref;
	};

	const cards: WorkspaceCard[] = claims
		.filter(({ evidence: row }) => row.state !== 'stale' && row.passageId !== null)
		.filter(({ evidence: row }) => byId.get(row.passageId!)?.kind === 'paragraph')
		.map(({ evidence: row, name, erasedAt, displayName, seq }) => {
			const text = byId.get(row.passageId!)!.text;
			const excerpt =
				row.excerptStart !== null && row.excerptEnd !== null
					? { start: row.excerptStart, end: row.excerptEnd }
					: null;
			const clause = standard?.view.clause(row.clauseKey);
			return {
				evidenceId: row.id,
				passageId: row.passageId!,
				page: byId.get(row.passageId!)!.page,
				number: numbers.get(row.passageId!) ?? 0,
				quote: excerpt ? text.slice(excerpt.start, excerpt.end) : text,
				state: row.state as CardState,
				clauseKey: row.clauseKey,
				clauseRef: clause?.ref ?? row.clauseKey,
				clauseTitle: titleOf(row.clauseKey),
				reason: row.reason,
				suggestedBy: row.suggestedBy,
				excerpt,
				confirmer:
					row.confirmedBy === null || row.state !== 'confirmed'
						? null
						: personLabel({ name, erasedAt: erasedAt ?? null, displayName, seq }),
				confirmedAt: row.state === 'confirmed' ? (row.confirmedAt?.getTime() ?? null) : null,
				definable: Boolean(clause?.owner)
			};
		})
		.sort(
			(a, b) =>
				order.get(a.passageId)! - order.get(b.passageId)! ||
				a.clauseRef.localeCompare(b.clauseRef, undefined, { numeric: true })
		);

	const requirements: Record<string, Requirement> = {};
	if (standard) {
		const name = `${STANDARD_NAMES[standard.view.meta.standard] ?? standard.view.meta.standard} v${standard.view.meta.version}`;
		for (const card of cards) {
			const clause = standard.view.clause(card.clauseKey);
			if (!clause || requirements[clause.key]) continue;
			const section = clause.owner ? standard.view.section(clause.owner) : undefined;
			const artifact = section ? standard.view.artifact(section.artifact) : undefined;
			requirements[clause.key] = {
				key: clause.key,
				ref: clause.ref,
				title: card.clauseTitle,
				text: standard.view.clauseText(clause, locale).value,
				normativity: clause.normativity,
				layer: clause.layer,
				layerName:
					standard.view.meta.layers.find((layer) => layer.n === clause.layer)?.name ?? null,
				artifact: artifact ? standard.view.localise(artifact.i18n, locale).value.title : null,
				standard: name
			};
		}
	}

	const clauses: ClauseOption[] = standard
		? standard.view
				.countableClauses()
				.filter((clause) => clause.owner !== null)
				.map((clause) => ({
					key: clause.key,
					ref: clause.ref,
					title: titleOf(clause.key),
					question: standard.view.annotation(clause.owner!)?.question ?? null,
					layer: clause.layer
				}))
		: [];

	const confirmerLabel = (userId: string | null): string | null => {
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

	const open = [
		...new Set(cards.filter((card) => card.state === 'suggested').map((card) => card.passageId))
	];
	const after = selected ? order.get(selected)! : -1;
	const nextOpen = open.find((id) => order.get(id)! > after) ?? open[0] ?? null;

	const onPage = new Set(paper.passages.map((row) => row.id));

	return {
		document: {
			id: found.id,
			filename: found.filename,
			kind: kindOf(found.mime),
			status: found.status,
			statusDetail: found.statusDetail,
			pagesTotal: found.pagesTotal,
			pagesExtracted: found.pagesExtracted,
			paged,
			scanStatus: found.scanStatus,
			scanDetail: found.scanDetail
		},
		state: mappingStateOf(input).state,
		counts,
		coverage: languageCoverage(ctx, { db }),
		scan: {
			live: scanIsLive(input),
			availability: (() => {
				const available = scanAvailability(ctx, found, { db });
				return !available.ok && available.reason === null ? null : available;
			})()
		},
		canMarkDone: canMarkDone(input),
		done: found.mappingDoneAt !== null,
		paper,
		selected,
		cards,
		requirements,
		clauses,
		reconfirm: reconfirmCandidates(ctx, documentId, { db }).map((candidate) => ({
			evidenceId: candidate.evidenceId,
			passageId: candidate.passageId,
			clauseRef: candidate.clauseRef,
			quote: candidate.quote,
			confirmer: confirmerLabel(candidate.confirmedBy),
			confirmedAt: candidate.confirmedAt
		})),
		identifiedOnPage: new Set(
			cards.filter((card) => onPage.has(card.passageId)).map((card) => card.passageId)
		).size,
		nextOpen
	};
}
