/**
 * The identifiers in the landing page's story of Valle Verde — a community that
 * does not exist, in the format the app really produces.
 *
 * Names and codes, not prose: they read the same in every language, so they
 * live here rather than in the message registry. The prose around them is in
 * `messages/`. Every shape here is one the app emits (decision refs are
 * `DEC-<year>-<nnn>`, gapless per community and year; public pages live under
 * `/p/<slug>`), because the page must not show anything the product cannot.
 */
export const demo = {
	community: 'Valle Verde',
	initials: 'VV',
	address: 'valle-verde.rcos-compass.app',
	publicPage: 'rcos-compass.app/p/valle-verde',
	exitDecision: 'DEC-2026-015',
	greenhouseDecision: 'DEC-2026-009',
	spendingDecision: 'DEC-2026-012',
	quietHoursDecision: 'DEC-2025-031',
	meetingDecision: 'DEC-2026-011',
	files: {
		bylaws: 'bylaws-2019.pdf',
		notes: 'meeting-notes-2022-2025.docx',
		houseRules: 'house-rules.md'
	},
	people: {
		lena: 'LK',
		marco: 'MB',
		ana: 'AR',
		tomas: 'TH'
	}
} as const;

/**
 * RCOS-Core 0.1 as published, the source `standard/rcos-core/0.1/meta.yaml`
 * names. The landing page links out to it; the app never fetches it.
 */
export const RCOS_STANDARD_URL = 'https://rcos.ecohubs.community/articles/rcos-core/v0-1';
