<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Untranslated from '$lib/components/ui/Untranslated.svelte';
	import StatusChip, {
		MODIFIER_LABELS,
		STATUS_LABELS,
		type Modifier,
		type Status
	} from '$lib/components/ui/StatusChip.svelte';
	import HelpTip from '$lib/components/ui/HelpTip.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import Markdown from '$lib/components/ui/Markdown.svelte';
	import InlineText from '$lib/components/ui/InlineText.svelte';
	import LinterPanel from '$lib/components/ui/LinterPanel.svelte';
	import LinterNotRun from '$lib/components/ui/LinterNotRun.svelte';
	import { HELP, type HelpId } from '$lib/help/registry';
	import DocumentRow from '$lib/components/documents/DocumentRow.svelte';
	import MappingStateChip, {
		type MappingState
	} from '$lib/components/documents/MappingStateChip.svelte';
	import UploadDropZone from '$lib/components/documents/UploadDropZone.svelte';
	import ClausePicker from '$lib/components/documents/ClausePicker.svelte';
	import HandMapCard from '$lib/components/documents/HandMapCard.svelte';
	import MappingQueue from '$lib/components/documents/MappingQueue.svelte';
	import PaperView from '$lib/components/documents/PaperView.svelte';
	import ReconfirmBlock from '$lib/components/documents/ReconfirmBlock.svelte';
	import ScanBlock from '$lib/components/documents/ScanBlock.svelte';
	import SuggestionCard, { type Card } from '$lib/components/documents/SuggestionCard.svelte';
	import VersionList from '$lib/components/documents/VersionList.svelte';
	import PdfViewer from '$lib/components/documents/pdf/PdfViewer.svelte';

	let { data } = $props();

	const statuses = Object.keys(STATUS_LABELS) as Status[];
	const modifiers = Object.keys(MODIFIER_LABELS) as Modifier[];
	const helpIds = Object.keys(HELP) as HelpId[];

	const mappingStates: MappingState[] = [
		'reading',
		'could_not_read',
		'cannot_scan',
		'not_scanned',
		'scanning',
		'in_progress',
		'mapped',
		'not_governance'
	];

	/** One library row per state that looks different: counts, actions, the disabled start. */
	const DAY = 86_400_000;
	const sampleRow = (
		id: string,
		filename: string,
		state: MappingState,
		primaryAction: 'start' | 'continue' | 'review' | 'open',
		counts: Partial<{
			paragraphs: number;
			paragraphsRead: number;
			identified: number;
			open: number;
			becameDefinitions: number;
			versions: number;
		}> = {},
		extra: { statusDetail?: string; byHandOnly?: boolean } = {}
	) => ({
		id,
		filename,
		kind: filename.split('.').pop()!.toUpperCase(),
		bytes: 184_000,
		pages: filename.endsWith('.pdf') ? 14 : null,
		uploadedAt: Date.UTC(2026, 8, 1) - DAY,
		uploader: 'Ana Ruiz',
		state,
		primaryAction,
		statusDetail: extra.statusDetail ?? null,
		scanDetail: null,
		byHandOnly: extra.byHandOnly ?? false,
		counts: {
			paragraphs: 42,
			paragraphsRead: 0,
			identified: 0,
			open: 0,
			becameDefinitions: 0,
			versions: 0,
			confirmedClaims: 0,
			...counts
		},
		versions: []
	});
	const sampleRows = [
		sampleRow('gallery-1', 'Bylaws 2019.pdf', 'in_progress', 'continue', {
			identified: 12,
			open: 5,
			becameDefinitions: 2,
			versions: 1
		}),
		sampleRow('gallery-2', 'Membership agreement.docx', 'mapped', 'review', {
			identified: 7,
			becameDefinitions: 4
		}),
		sampleRow('gallery-3', 'Meeting notes March.md', 'not_scanned', 'start'),
		sampleRow('gallery-4', 'Land survey.pdf', 'scanning', 'open', { paragraphsRead: 24 }),
		sampleRow(
			'gallery-5',
			'Site plan.png',
			'cannot_scan',
			'open',
			{},
			{
				statusDetail: 'Compass keeps images for reference; there are no words in it to map.'
			}
		),
		sampleRow('gallery-6', 'Recipes.txt', 'not_governance', 'open')
	];

	const clauseOptions = [
		{
			key: 'c-3.6.1',
			ref: '3.6.1',
			title: 'Voluntary Exit',
			question: 'How does a member leave?',
			layer: 1
		},
		{
			key: 'c-3.6.2',
			ref: '3.6.2',
			title: 'Voluntary Exit',
			question: 'What notice is required?',
			layer: 1
		},
		{ key: 'c-3.6.3', ref: '3.6.3', title: 'Forced Exit', question: null, layer: 1 }
	];
	const requirement = {
		key: 'c-3.6.2',
		ref: '3.6.2',
		title: 'Voluntary Exit',
		text: 'A community MUST define how a member ends their membership, the notice required, and how obligations and property are settled.',
		normativity: 'MUST' as const,
		layer: 1,
		layerName: 'Membership',
		artifact: 'Exit & Separation Protocol',
		standard: 'RCOS-Core v0.1'
	};
	const card = (id: string, state: Card['state'], extra: Partial<Card> = {}): Card => ({
		evidenceId: id,
		passageId: `passage-${id}`,
		page: 4,
		number: 2,
		quote: 'Any member wishing to depart shall give sixty days written notice.',
		state,
		clauseKey: 'c-3.6.2',
		clauseRef: '3.6.2',
		clauseTitle: 'Voluntary Exit',
		reason: 'Says how much notice a leaving member gives, but not how their share is settled.',
		suggestedBy: 'ai',
		excerpt: null,
		confirmer: null,
		confirmedAt: null,
		definable: true,
		...extra
	});
	const cards: Card[] = [
		card('gallery-open', 'suggested'),
		card('gallery-confirmed', 'confirmed', {
			confirmer: 'Ana Ruiz',
			confirmedAt: Date.UTC(2026, 7, 29),
			suggestedBy: 'human',
			reason: null
		}),
		card('gallery-no-reason', 'suggested', {
			reason: null,
			clauseRef: '3.6.3',
			clauseTitle: 'Forced Exit'
		}),
		card('gallery-dismissed', 'dismissed', { definable: false })
	];
	const versions = [
		{
			id: 'gallery-v1',
			filename: 'Bylaws 2018.pdf',
			bytes: 120_000,
			uploadedAt: Date.UTC(2025, 2, 1),
			uploader: 'Lena Berg',
			supersededAt: Date.UTC(2026, 7, 20),
			supersededBy: 'Ana Ruiz'
		}
	];
</script>

<!--
	docs/02-component-guidelines.md §8: every primitive in every state, on one
	page. This is the review surface and the accessibility test target.
-->
<svelte:head>
	<title>Components · RCOS Compass</title>
</svelte:head>

<main class="mx-auto max-w-4xl px-6 py-10">
	<h1 class="text-page font-medium">Components</h1>
	<p class="text-fg-secondary mt-2">Every primitive in every state. Development only.</p>

	<section class="mt-10" aria-labelledby="buttons">
		<h2 id="buttons" class="text-section font-medium">Button</h2>
		<div class="mt-4 flex flex-wrap items-center gap-3">
			<Button variant="primary">Record decision</Button>
			<Button variant="secondary">Propose change</Button>
			<Button variant="ghost">Start discussion</Button>
			<Button variant="danger">Remove</Button>
			<Button variant="primary" pending>Recording</Button>
			<Button variant="secondary" disabled>Unavailable</Button>
			<Button variant="secondary" size="sm">Small</Button>
		</div>
	</section>

	<section class="mt-10" aria-labelledby="untranslated">
		<h2 id="untranslated" class="text-section font-medium">Untranslated strings</h2>
		<p class="text-fg-muted text-meta mt-1">
			A string with no translation in the reader's language shows the English with a marker. A
			silent fallback is how a half-translated interface looks finished and stays that way — nobody
			files a bug about a screen that reads fine.
		</p>
		<div class="mt-4 flex flex-wrap items-center gap-4">
			<span class="text-fg">Translated: <Untranslated key="nav_dashboard" /></span>
			<span class="text-fg"
				>Marked: <Untranslated key="nav_ai_settings" text="AI assistance" /></span
			>
		</div>
	</section>

	<section class="mt-10" aria-labelledby="chips">
		<h2 id="chips" class="text-section font-medium">Status</h2>
		<p class="text-fg-muted text-meta mt-1">
			Statuses are exclusive. The two modifiers below sit alongside a status; they are not statuses
			themselves.
		</p>
		<div class="mt-4 flex flex-wrap items-center gap-2">
			{#each statuses as status (status)}
				<StatusChip {status} />
			{/each}
		</div>
		<div class="mt-3 flex flex-wrap items-center gap-2">
			{#each modifiers as modifier (modifier)}
				<StatusChip {modifier} />
			{/each}
		</div>
		<div class="mt-3 flex flex-wrap items-center gap-2">
			<StatusChip status="in_discussion" />
			<StatusChip modifier="provisional" />
			<StatusChip modifier="ai_drafted" />
		</div>
	</section>

	<section class="mt-10" aria-labelledby="help">
		<h2 id="help" class="text-section font-medium">Help</h2>
		<p class="text-fg-muted text-meta mt-1">
			Every entry in the registry. Click or tap — never hover-only.
		</p>
		<ul class="mt-4 grid gap-2 sm:grid-cols-2">
			{#each helpIds as id (id)}
				<li class="border-border flex items-center gap-2 rounded-(--radius-control) border p-2">
					<HelpTip {id} />
					<span class="text-fg-secondary">{HELP[id]?.title}</span>
				</li>
			{/each}
		</ul>
	</section>

	<section class="mt-10" aria-labelledby="fields">
		<h2 id="fields" class="text-section font-medium">Text field</h2>
		<p class="text-fg-muted text-meta mt-1">
			Always a real label, never a placeholder standing in for one. An error is announced, not only
			coloured.
		</p>
		<div class="mt-4 grid max-w-md gap-4">
			<TextField id="gallery-email" label="Email" type="email" value="ana@example.org" />
			<TextField
				id="gallery-hinted"
				label="Community slug"
				value="valle-verde"
				hint="This becomes the address members visit."
			/>
			<TextField
				id="gallery-error"
				label="Six-digit code"
				value="12"
				error="Enter the six-digit code from your authenticator app."
			/>
			<TextField id="gallery-disabled" label="Standard version" value="RCOS-Core 0.1" disabled />
		</div>
	</section>

	<section class="mt-10" aria-labelledby="markdown">
		<h2 id="markdown" class="text-section font-medium">Governance text</h2>
		<p class="text-fg-muted text-meta mt-1">
			Parsed on the server into a narrow node tree and rendered through ordinary templating. The
			payloads in the last paragraph are words here, and only words — there is no raw-HTML sink for
			them to reach.
		</p>
		<div class="border-border mt-4 rounded-(--radius-card) border p-4">
			<Markdown blocks={data.markdown} />
		</div>
	</section>

	<section class="mt-10" aria-labelledby="inline">
		<h2 id="inline" class="text-section font-medium">Inline text</h2>
		<p class="text-fg-muted text-meta mt-1">
			The same node tree without block structure, for the places a title is a member's own text — a
			thread title, a decision title, a section heading.
		</p>
		<p class="text-fg mt-4">
			{#if data.inline?.type === 'paragraph'}
				<InlineText nodes={data.inline.children} />
			{/if}
		</p>
	</section>

	<section class="mt-10" aria-labelledby="linter">
		<h2 id="linter" class="text-section font-medium">Definition linter</h2>
		<p class="text-fg-muted text-meta mt-1">
			Warnings, notes and passing checks together. Nothing here can stop a freeze.
		</p>
		<div class="border-border mt-4 rounded-(--radius-card) border p-4">
			<LinterPanel result={data.linter} />
		</div>

		<p class="text-fg-muted text-meta mt-6">
			And the state before it has run — a sentence rather than an empty panel, because an empty
			panel reads as "nothing wrong here".
		</p>
		<div class="border-border mt-2 rounded-(--radius-card) border p-4">
			<LinterNotRun canRun={false} />
		</div>
	</section>

	<section class="mt-10" aria-labelledby="library">
		<h2 id="library" class="text-section font-medium">Document library</h2>
		<p class="text-fg-muted text-meta mt-1">
			Design 09. The chip in every mapping state, the drop zone, and a row per state that looks
			different — including the start control disabled with its reason.
		</p>
		<div class="mt-4 flex flex-wrap items-center gap-2">
			{#each mappingStates as state (state)}
				<MappingStateChip {state} />
			{/each}
		</div>
		<div class="mt-4">
			<UploadDropZone
				community="Valle Verde"
				accepts=".pdf,.docx,.odt,.md,.txt"
				maxMb={25}
				maxFiles={10}
				serverResults={[
					{ filename: 'Bylaws 2019.pdf', ok: true },
					{
						filename: 'Holiday.zip',
						ok: false,
						error: 'Compass does not accept this kind of file.'
					}
				]}
			/>
		</div>
		<ul class="border-border bg-surface mt-4 rounded-(--radius-card) border">
			{#each sampleRows as row (row.id)}
				<DocumentRow
					{row}
					slug="gallery"
					accepts=".pdf,.docx,.odt,.md,.txt"
					can={{ upload: true, destroy: true, scan: true }}
					scanning={{ offer: true, reason: null }}
				/>
			{/each}
			<DocumentRow
				row={sampleRow('gallery-7', 'Care rota.odt', 'not_scanned', 'start')}
				slug="gallery"
				accepts=".pdf,.docx,.odt,.md,.txt"
				can={{ upload: true, destroy: false, scan: true }}
				scanning={{ offer: false, reason: 'AI assistance is switched off for this community.' }}
			/>
		</ul>
	</section>

	<section class="mt-10" aria-labelledby="workspace">
		<h2 id="workspace" class="text-section font-medium">Mapping workspace</h2>
		<p class="text-fg-muted text-meta mt-1">
			Design 05. A page of text with a confirmed passage, an open suggestion highlighted at its
			excerpt, the selected passage, and a paragraph whose words are a script tag.
		</p>
		<div class="border-border mt-4 flex h-[28rem] flex-col rounded-(--radius-card) border">
			<PaperView
				paper={data.paper}
				selected="gallery-p2"
				filename="bylaws-2019.pdf"
				passageHref={(id) => `?passage=${id}`}
				pageHref={(page) => `?page=${page}`}
			/>
		</div>

		<div class="mt-4 flex flex-col gap-3">
			{#each cards as sample (sample.evidenceId)}
				<SuggestionCard
					card={sample}
					filename="bylaws-2019.pdf"
					paged={true}
					selected={sample.state === 'suggested' && sample.reason !== null}
					requirement={sample.clauseKey === 'c-3.6.2' ? requirement : null}
					requirementHref="#workspace"
					clauses={clauseOptions}
					can={{ map: true, draft: true }}
					passageHref="#workspace"
					returnTo=""
				/>
			{/each}
			<SuggestionCard
				card={card('gallery-read-only', 'suggested')}
				filename="bylaws-2019.pdf"
				paged={true}
				selected={false}
				{requirement}
				requirementHref="#workspace"
				clauses={clauseOptions}
				can={{ map: false, draft: false }}
				passageHref="#workspace"
				returnTo=""
			/>
			<HandMapCard
				passageId="gallery-hand"
				number={3}
				excerpt={{ start: 0, end: 36, text: 'Any member wishing to depart shall give' }}
				clauses={clauseOptions}
				returnTo=""
			/>
			<ClausePicker id="gallery-clause" options={clauseOptions} />
			<ReconfirmBlock
				candidates={[
					{
						evidenceId: 'gallery-stale',
						passageId: 'gallery-p1',
						clauseRef: '3.6.1',
						quote: 'A member may leave at any time by telling a steward in writing.',
						confirmer: 'Ana Ruiz',
						confirmedAt: Date.UTC(2026, 7, 29)
					}
				]}
				canMap={true}
				returnTo=""
			/>
			<ScanBlock
				live={false}
				availability={{ ok: true, paragraphs: 42, alreadyRead: 0 }}
				progress={{ read: 0, total: 42 }}
				detail={null}
				returnTo=""
				canMapByHand={true}
			/>
			<ScanBlock
				live={true}
				availability={{ ok: true, paragraphs: 42, alreadyRead: 18 }}
				progress={{ read: 18, total: 42 }}
				detail={null}
				returnTo=""
				canMapByHand={false}
			/>
			<ScanBlock
				live={false}
				availability={{ ok: false, reason: 'AI assistance is switched off for this community.' }}
				progress={{ read: 0, total: 42 }}
				detail={null}
				returnTo=""
				canMapByHand={true}
			/>
			<VersionList
				slug="gallery"
				documentId="gallery"
				{versions}
				can={{ upload: true, destroy: true }}
			/>
		</div>

		<h3 class="text-title mt-6 font-medium">The original PDF</h3>
		<p class="text-fg-muted text-meta mt-1">
			A two-page PDF drawn by pdf.js with its page strip: a confirmed passage and an open suggestion
			narrowed to one line, the confirmed one selected. Governance marked on page 1.
		</p>
		<div class="border-border mt-2 flex h-[32rem] flex-col rounded-(--radius-card) border">
			<PdfViewer
				url="/dev/components/sample.pdf"
				highlights={[
					{
						passageId: 'gallery-original-1',
						page: 1,
						number: 1,
						state: 'confirmed',
						words: 'New residents are admitted by vote of the',
						lines: [
							{ x: 72, y: 680, w: 330, h: 11, start: 0, end: 57 },
							{ x: 72, y: 664, w: 300, h: 11, start: 58, end: 110 }
						],
						excerpts: null
					},
					{
						passageId: 'gallery-original-2',
						page: 1,
						number: 2,
						state: 'open',
						words: 'Any member wishing to depart shall give',
						lines: [
							{ x: 72, y: 632, w: 330, h: 11, start: 0, end: 58 },
							{ x: 72, y: 616, w: 320, h: 11, start: 59, end: 114 }
						],
						excerpts: [{ start: 60, end: 100 }]
					}
				]}
				governancePages={[1]}
				selected="gallery-original-1"
				page={null}
				pageHref={(page) => `#page-${page}`}
				textHref={() => '#workspace'}
				onselect={() => {}}
				onfail={() => {}}
			/>
		</div>

		<h3 class="text-title mt-6 font-medium">The queue below 1024px</h3>
		<div class="border-border mt-2 max-w-[375px] rounded-(--radius-card) border">
			<MappingQueue
				filename="bylaws-2019.pdf"
				paged={true}
				{cards}
				counts={{ identified: 23, open: 9 }}
				requirements={{ 'c-3.6.2': requirement }}
				requirementHref={() => '#workspace'}
				clauses={clauseOptions}
				can={{ map: true, draft: true }}
				passage="passage-gallery-open"
				step="confirm"
				seePage={false}
				paper={data.paper}
				reconfirm={[]}
				canMarkDone={false}
				excerpt={null}
				onexcerpt={() => {}}
			>
				{#snippet scan()}{/snippet}
			</MappingQueue>
		</div>
	</section>

	<section class="mt-10" aria-labelledby="tokens">
		<h2 id="tokens" class="text-section font-medium">Tokens</h2>
		<div class="mt-4 grid gap-2 sm:grid-cols-2">
			<div class="border-border rounded-(--radius-card) border p-3">
				<p class="text-fg">Primary text on surface</p>
				<p class="text-fg-secondary">Secondary text</p>
				<p class="text-fg-muted">Muted text</p>
			</div>
			<div class="border-border rounded-(--radius-card) border p-3">
				<p class="text-accent-fg">Accent</p>
				<p class="text-attention">Attention</p>
				<p class="text-info">Information</p>
				<p class="text-danger">Destructive</p>
			</div>
		</div>
	</section>
</main>
