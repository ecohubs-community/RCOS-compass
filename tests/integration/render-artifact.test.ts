import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { anonymousIn, asSignedIn } from '../../src/lib/server/auth/audience.js';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { definition, definitionVersion } from '../../src/lib/server/db/schema/definitions.js';
import { communityStandard } from '../../src/lib/server/db/schema/tenancy.js';
import { publish } from '../../src/lib/server/services/publishing.js';
import {
	artifactToMarkdown,
	renderArtifact
} from '../../src/lib/server/services/render-artifact.js';
import { getStandard } from '../../src/lib/server/standard/index.js';
import { createTestDb } from '../support/db.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * One rendering, wherever an artifact is shown outwardly.
 *
 * The public page, the export's Markdown, the PDF and the mirrored commit are
 * the same operation. Built three times they agree on the day they are written
 * and diverge quietly afterwards — and three renderings that disagree is
 * exactly what an auditor would find, in a product whose whole purpose is
 * letting a community show an outsider what is true.
 */
const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);
const view = getStandard('rcos-core', '0.1');
const ARTIFACT = view.mandatoryArtifacts()[0]!;
const SECTION = view.authoredSectionsOf(ARTIFACT.key)[0]!;

let db: Db;
let cleanup: () => void;
let ana: Ctx;
let standardRowId: string;

function adopt(sectionKey: string, body: string): string {
	const id = newId();
	const versionId = newId();
	db.insert(definition)
		.values({
			id,
			communityId: ana.community.id,
			scope: 'standard',
			communityStandardId: standardRowId,
			sectionKey,
			adoptedVersionId: versionId,
			provisional: false,
			createdBy: ana.user.id,
			createdAt: new Date(NOW),
			updatedAt: new Date(NOW)
		})
		.run();
	db.insert(definitionVersion)
		.values({
			id: versionId,
			definitionId: id,
			n: 1,
			body,
			plainLanguage: null,
			type: null,
			authorId: ana.user.id,
			aiAssisted: false,
			aiTask: null,
			linterResult: null,
			createdAt: new Date(NOW),
			adoptedAt: new Date(NOW),
			decisionId: null,
			supersedesVersionId: null
		})
		.run();
	return id;
}

function adoptLocal(title: string, body: string): string {
	const id = newId();
	const versionId = newId();
	db.insert(definition)
		.values({
			id,
			communityId: ana.community.id,
			scope: 'local',
			attachKind: 'rcos_artifact',
			attachRcosArtifactKey: ARTIFACT.key,
			title,
			adoptedVersionId: versionId,
			provisional: false,
			createdBy: ana.user.id,
			createdAt: new Date(NOW),
			updatedAt: new Date(NOW)
		})
		.run();
	db.insert(definitionVersion)
		.values({
			id: versionId,
			definitionId: id,
			n: 1,
			body,
			plainLanguage: null,
			type: null,
			authorId: ana.user.id,
			aiAssisted: false,
			aiTask: null,
			linterResult: null,
			createdAt: new Date(NOW),
			adoptedAt: new Date(NOW),
			decisionId: null,
			supersedesVersionId: null
		})
		.run();
	return id;
}

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	const home = makeCommunity(db, { slug: 'valle-verde' });
	standardRowId = newId();
	db.insert(communityStandard)
		.values({
			id: standardRowId,
			communityId: home.id,
			standardId: 'rcos-core',
			version: '0.1',
			status: 'active',
			adoptedAt: new Date(NOW),
			retiredAt: null
		})
		.run();
	const steward = makeUser(db, { email: 'ana@example.org' });
	ana = {
		user: steward,
		community: home,
		membership: makeMembership(db, home.id, steward.id, { role: 'steward', isOwner: true }),
		now: () => NOW
	} as Ctx;
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

describe('the same artifact, three ways', () => {
	it('says the same things through every adapter', () => {
		adopt(SECTION.key, 'Our purpose is to steward this land together.');
		adoptLocal('Quiet hours', 'No machinery before eight in the morning.');

		const rendered = renderArtifact(db, asSignedIn(ana), ARTIFACT.key)!;
		const markdown = artifactToMarkdown(rendered);

		// The structure is what the HTML page consumes; the Markdown is derived
		// from the same structure. Both must carry the community's text, the
		// section it answers, and the local addition's label.
		expect(rendered.sections.some((s) => s.body?.includes('steward this land'))).toBe(true);
		expect(markdown).toContain('steward this land together');
		expect(markdown).toContain(rendered.title);

		expect(rendered.localAdditions).toHaveLength(1);
		expect(markdown).toContain('Quiet hours');
		expect(markdown).toContain('No machinery before eight');
	});

	it('labels every local addition, in the structure and in the Markdown', () => {
		adoptLocal('Quiet hours', 'No machinery before eight in the morning.');
		const rendered = renderArtifact(db, asSignedIn(ana), ARTIFACT.key)!;

		// An auditor must be able to tell a house rule from a standard requirement
		// at a glance, and so must a new member.
		expect(rendered.localAdditions[0]!.label).toContain('not required by rcos-core');
		expect(artifactToMarkdown(rendered)).toContain('not required by rcos-core');
	});

	it('says plainly where a community has not decided yet', () => {
		const rendered = renderArtifact(db, asSignedIn(ana), ARTIFACT.key)!;
		expect(rendered.sections.every((section) => section.body === null)).toBe(true);
		// Not an empty heading, which reads as a rendering bug rather than as the
		// truthful "they have not got to this yet".
		expect(artifactToMarkdown(rendered)).toContain('Not yet decided');
	});
});

describe('a rendering carries only what its reader may see', () => {
	it('gives an anonymous reader the published sections and no others', () => {
		const published = adopt(SECTION.key, 'Our purpose is to steward this land together.');
		const other = view.authoredSectionsOf(ARTIFACT.key)[1];
		if (other) adopt(other.key, 'Something we have not published.');
		publish(ana, { type: 'definition', id: published }, { db });

		const rendered = renderArtifact(db, anonymousIn(ana.community.id), ARTIFACT.key)!;

		expect(rendered.sections.find((s) => s.key === SECTION.key)!.body).toContain(
			'steward this land'
		);
		if (other) {
			expect(rendered.sections.find((s) => s.key === other.key)!.body).toBeNull();
		}
		expect(artifactToMarkdown(rendered)).not.toContain('Something we have not published');
	});

	it("keeps an unpublished local addition out of the world's copy", () => {
		adoptLocal('Quiet hours', 'No machinery before eight in the morning.');
		const rendered = renderArtifact(db, anonymousIn(ana.community.id), ARTIFACT.key)!;
		expect(rendered.localAdditions).toEqual([]);
	});
});
