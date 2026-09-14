import { getLogger } from '../logger.js';
import type { RenderedArtifact } from './render-artifact.js';
import { isoDateIn } from '../../time/format.js';

/**
 * The printable copy, when the instance can make one.
 * `docs/00-architecture.md` §8.
 *
 * That section chose headless Chromium via Playwright, "which is already a
 * dependency" — and it is, as a *dev* dependency. Making it a production one
 * puts a few hundred megabytes of browser on every deployment, for a third
 * format of a bundle that is already complete without it.
 *
 * So Playwright is **not a dependency of this package at all**. It is resolved
 * at runtime through a non-literal specifier, which also keeps it out of the
 * bundler's graph: an instance that wants printable copies installs it, and one
 * that does not is smaller and works. Adding it as an optional dependency was
 * tried and pulled a second copy of `playwright-core` into the tree beside the
 * one the test runner uses, which broke type-checking for a third output
 * format.
 *
 * Its absence is not an error. An instance with Playwright puts a PDF in the
 * bundle; one without produces the same bundle minus that file, and **the
 * manifest says which** — a bundle that silently varies in content is worse
 * than one that is honestly smaller.
 *
 * The HTML is generated here rather than fetched from a route: rendering a page
 * that requires a session would mean the export job authenticating to its own
 * server, which is a second copy of the authorisation rules and a socket
 * dependency inside a background job.
 */

export async function renderPdf(
	artifacts: RenderedArtifact[],
	communityName: string
): Promise<Uint8Array | null> {
	/** Only what this file uses, so the absent module still type-checks. */
	type Chromium = {
		launch: () => Promise<{
			newPage: () => Promise<{
				setContent: (html: string, options: { waitUntil: 'load' }) => Promise<void>;
				pdf: (options: Record<string, unknown>) => Promise<Buffer>;
			}>;
			close: () => Promise<void>;
		}>;
	};

	let chromium: Chromium;
	try {
		// Non-literal, so neither TypeScript nor the bundler tries to resolve a
		// package this project does not depend on.
		const specifier = 'playwright';
		({ chromium } = (await import(/* @vite-ignore */ specifier)) as { chromium: Chromium });
	} catch {
		// Not installed. Expected on a lean deployment, and not a failure.
		return null;
	}

	let browser: Awaited<ReturnType<Chromium['launch']>> | undefined;
	try {
		browser = await chromium.launch();
		const page = await browser.newPage();
		await page.setContent(printableHtml(artifacts, communityName), { waitUntil: 'load' });
		const pdf = await page.pdf({
			format: 'A4',
			margin: { top: '20mm', bottom: '20mm', left: '18mm', right: '18mm' },
			printBackground: false
		});
		return new Uint8Array(pdf);
	} catch (problem) {
		// A browser that will not launch is an operational detail, not something
		// the community asked about. The bundle is complete without it.
		getLogger().warn({ err: problem }, 'PDF rendering unavailable; exporting without it');
		return null;
	} finally {
		await browser?.close();
	}
}

/**
 * Self-contained HTML: no stylesheet link, no font request, no image.
 *
 * The renderer runs in a job with no network, and a print layout that silently
 * loses its styling because a request failed is a worse artefact than a plain
 * one.
 */
function printableHtml(artifacts: RenderedArtifact[], communityName: string): string {
	const escape = (value: string) =>
		value.replace(
			/[&<>"']/g,
			(c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot', "'": '#39' }[c]};`
		);

	const body = artifacts
		.map((artifact) => {
			const sections = artifact.sections
				.map((section) =>
					[
						`<h2>${escape(section.title)}</h2>`,
						section.body
							? `<p>${escape(section.body).replace(/\n{2,}/g, '</p><p>')}</p>`
							: '<p class="none">Not yet decided by this community.</p>',
						section.adopted
							? `<p class="meta">Adopted ${
									section.adopted.decisionRef ? `by ${escape(section.adopted.decisionRef)} ` : ''
								}on ${isoDateIn(section.adopted.adoptedAt, artifact.timeZone)}</p>`
							: ''
					].join('')
				)
				.join('');

			const additions = artifact.localAdditions
				.map(
					(addition) =>
						`<h3>${escape(addition.title)}</h3><p>${escape(addition.body)}</p><p class="meta">${escape(addition.label)}</p>`
				)
				.join('');

			return [
				`<section><h1>${escape(artifact.title)}</h1>`,
				`<p class="meta">${escape(artifact.standard.id)} v${escape(artifact.standard.version)}</p>`,
				sections,
				additions ? `<h2>Local additions</h2>${additions}` : '',
				'</section>'
			].join('');
		})
		.join('');

	return [
		'<!doctype html><html lang="en"><head><meta charset="utf-8">',
		`<title>${escape(communityName)}</title>`,
		'<style>',
		'body{font:11pt/1.5 Georgia,serif;color:#111;max-width:none}',
		'section{page-break-after:always}',
		'h1{font-size:20pt;margin:0 0 4pt}h2{font-size:13pt;margin:16pt 0 4pt}h3{font-size:11pt}',
		'.meta{color:#555;font-size:9pt;font-style:italic}',
		'.none{color:#666;font-style:italic}',
		'</style></head><body>',
		body,
		'</body></html>'
	].join('');
}
