<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { onMount, type Component } from 'svelte';
	import HandMapCard from '$lib/components/documents/HandMapCard.svelte';
	import MappingQueue from '$lib/components/documents/MappingQueue.svelte';
	import MappingStateChip from '$lib/components/documents/MappingStateChip.svelte';
	import PaperView, { type Excerpt } from '$lib/components/documents/PaperView.svelte';
	import ReconfirmBlock from '$lib/components/documents/ReconfirmBlock.svelte';
	import ScanBlock from '$lib/components/documents/ScanBlock.svelte';
	import SuggestionCard from '$lib/components/documents/SuggestionCard.svelte';
	import VersionList from '$lib/components/documents/VersionList.svelte';
	import { pollWhileScanning } from '$lib/components/documents/poll';
	import Button from '$lib/components/ui/Button.svelte';
	import * as m from '$lib/paraglide/messages';
	import { links } from '$lib/links';
	import IconDownload from '~icons/tabler/download';

	let { data, form } = $props();
	const slug = $derived(data.community.slug);
	const doc = $derived(data.document);

	/** An explicit `?view=` travels with every link and form, so a choice sticks. */
	const withView = (params: Record<string, string>) =>
		new URLSearchParams({ ...params, ...(data.view ? { view: data.view } : {}) }).toString();

	/** Where forms post back to: the passage and page on screen. */
	const returnTo = $derived(
		withView({
			...(data.selected ? { passage: data.selected } : {}),
			...(data.paper.page !== null ? { page: String(data.paper.page) } : {})
		})
	);
	const passageHref = (id: string) => `?${withView({ passage: id })}`;
	const pageHref = (page: number) => `?${withView({ page: String(page) })}`;
	const viewHref = (view: 'original' | 'text', page: number | null = data.paper.page) =>
		`?${new URLSearchParams({
			view,
			...(page !== null ? { page: String(page) } : {}),
			...(data.selected ? { passage: data.selected } : {})
		})}`;

	/**
	 * The original PDF view (`document-original-view`). The server renders the
	 * text view; after mount, a PDF at 1024px and wider — or one asked for with
	 * `?view=original` on a phone — loads the viewer, which replaces the text
	 * once the file has opened. If it cannot, the text stays, with a sentence.
	 */
	let wide = $state(false);
	let mounted = $state(false);
	onMount(() => {
		const query = window.matchMedia('(min-width: 1024px)');
		const update = () => (wide = query.matches);
		update();
		mounted = true;
		query.addEventListener('change', update);
		return () => query.removeEventListener('change', update);
	});
	let originalFailed = $state(false);
	let originalReady = $state(false);
	let Viewer = $state.raw<Component<
		import('$lib/components/documents/pdf/PdfViewer.svelte').PdfViewerProps
	> | null>(null);
	const wantsOriginal = $derived(
		mounted &&
			doc.paged &&
			doc.status === 'extracted' &&
			data.view !== 'text' &&
			!originalFailed &&
			(wide || data.view === 'original')
	);
	$effect(() => {
		if (!wantsOriginal || Viewer) return;
		import('$lib/components/documents/pdf/PdfViewer.svelte').then(
			(module) => (Viewer = module.default),
			() => (originalFailed = true)
		);
	});
	$effect(() => {
		if (!wantsOriginal) originalReady = false;
	});
	const showingOriginal = $derived(wantsOriginal && originalReady && Viewer !== null);
	const requirementHref = (ref: string) => `${links.standard(slug)}#clause-${ref}`;

	/**
	 * Selecting is a navigation, so the URL always names the passage and a
	 * reload lands in the same place — replaced rather than pushed, because
	 * stepping back through every card a member looked at is not what Back means.
	 */
	const select = (href: string) =>
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- same page, query only
		goto(href, { replaceState: true, noScroll: true, keepFocus: true });

	/** Words selected in a paragraph; only used while that paragraph is the one selected. */
	let excerpt = $state<Excerpt | null>(null);
	function takeExcerpt(chosen: Excerpt) {
		excerpt = chosen;
		if (chosen.passageId !== data.selected) void select(passageHref(chosen.passageId));
	}

	$effect(() => (data.scan.live ? pollWhileScanning() : undefined));

	let rail = $state<HTMLElement | null>(null);
	$effect(() => {
		if (!data.selected || !rail) return;
		rail
			.querySelector(`[data-passage-card="${CSS.escape(data.selected)}"]`)
			?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	});

	const readable = $derived(doc.status === 'extracted' && data.paper.passages.length > 0);
	const selectedParagraph = $derived(
		data.paper.passages.find((row) => row.id === data.selected && row.kind === 'paragraph') ?? null
	);
	const selectedHasClaims = $derived(data.cards.some((card) => card.passageId === data.selected));
	const mapped = $derived(data.counts.identified - data.counts.open);
	const coveragePercent = $derived(
		data.coverage.of === 0 ? 0 : Math.round((data.coverage.have / data.coverage.of) * 100)
	);

	const problem = $derived(form && 'error' in form ? form.error : null);
	const scanStarted = $derived(
		form?.step === 'startScan' &&
			'result' in form &&
			typeof form.result === 'object' &&
			form.result &&
			'queued' in form.result
			? form.result.queued
				? m.workspace_scan_queued()
				: m.workspace_scan_already()
			: null
	);
	const replaceRefused = $derived(
		form?.step === 'replace' &&
			'result' in form &&
			typeof form.result === 'object' &&
			form.result &&
			'refused' in form.result
			? form.result.refused
			: null
	);
</script>

<!--
	eslint-disable svelte/no-navigation-without-resolve --
	Every href below is a query on this same page (`?passage=`, `?page=`, `?step=`),
	built by a local helper; `resolve` is for route ids, and there is none here.
-->

<svelte:head><title>{doc.filename} · {data.community.name}</title></svelte:head>

{#snippet scan()}
	<ScanBlock
		live={data.scan.live}
		availability={data.scan.availability}
		progress={{ read: data.counts.paragraphsRead, total: data.counts.paragraphs }}
		detail={doc.scanStatus === 'stopped' ||
		doc.scanStatus === 'queued' ||
		doc.scanStatus === 'running'
			? doc.scanDetail
			: null}
		{returnTo}
		canMapByHand={data.can.map && data.state === 'not_scanned'}
	/>
{/snippet}

<div class="flex min-h-0 flex-1 flex-col lg:overflow-hidden">
	<header
		class="border-border flex flex-none flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2.5 sm:px-6"
	>
		<h1 class="text-title min-w-0 font-medium break-all">{doc.filename}</h1>
		<MappingStateChip state={data.state} />
		<span class="flex-1"></span>
		<a
			href={links.documentFile(slug, doc.id)}
			class="text-fg-secondary hover:text-fg text-meta inline-flex min-h-8 items-center gap-1.5"
		>
			<IconDownload class="h-3.5 w-3.5" aria-hidden="true" />{m.workspace_download()}
		</a>
		{#if data.can.upload}
			<details class="relative">
				<summary
					class="border-border text-fg-secondary hover:text-fg text-meta inline-flex min-h-8 cursor-pointer list-none items-center rounded-(--radius-control) border px-2.5"
					>{m.library_menu_versions({ count: data.counts.versions })}</summary
				>
				<div
					class="border-border-strong bg-surface absolute top-10 right-0 z-20 flex w-80 max-w-[90vw] flex-col gap-3 rounded-(--radius-control) border p-3"
				>
					<form
						method="POST"
						action="?/replace"
						enctype="multipart/form-data"
						class="flex flex-col gap-2"
						use:enhance
					>
						<input type="hidden" name="documentId" value={doc.id} />
						<label for="workspace-replace" class="text-fg-secondary text-meta"
							>{m.library_menu_replace()}</label
						>
						<input
							id="workspace-replace"
							name="file"
							type="file"
							required
							accept={data.accepts}
							class="text-fg-secondary text-meta max-w-full"
						/>
						<Button type="submit" size="sm" class="self-start"
							>{m.library_menu_replace_submit()}</Button
						>
					</form>
					<VersionList {slug} documentId={doc.id} versions={data.versions} can={data.can} />
				</div>
			</details>
		{/if}
	</header>

	{#if problem || replaceRefused}
		<p role="alert" class="text-danger border-border border-b px-4 py-2 sm:px-6">
			{problem ?? replaceRefused}
		</p>
	{/if}
	{#if scanStarted}
		<p role="status" class="text-fg-secondary border-border border-b px-4 py-2 sm:px-6">
			{scanStarted}
		</p>
	{/if}

	{#if !readable}
		<div class="px-4 py-6 sm:px-6">
			{#if doc.status === 'uploaded' || doc.status === 'extracting'}
				<p role="status" class="text-fg-secondary">{m.workspace_reading()}</p>
			{:else}
				<p class="text-fg-secondary">{doc.statusDetail ?? m.workspace_no_text()}</p>
			{/if}
		</div>
	{:else}
		<!-- Two panes at 1024px and wider. -->
		<div class="hidden min-h-0 flex-1 lg:flex lg:overflow-hidden">
			<section
				class="border-border bg-surface flex w-[45%] min-w-0 flex-none flex-col border-r"
				aria-label={m.workspace_document_label()}
			>
				{#if originalFailed}
					<p role="status" class="text-fg-secondary border-border border-b px-4 py-2">
						{m.original_failed()}
						<a
							href={links.documentFile(slug, doc.id)}
							class="text-accent-fg underline underline-offset-2">{m.workspace_download()}</a
						>
					</p>
				{:else if doc.paged && data.view === 'text'}
					<p class="border-border border-b px-4 py-2 text-right">
						<a href={viewHref('original')} class="text-accent-fg text-meta"
							>{m.original_switch_original()}</a
						>
					</p>
				{/if}
				{#if wide && wantsOriginal && Viewer}
					<div class={originalReady ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
						<Viewer
							url={links.documentFile(slug, doc.id)}
							highlights={data.highlights}
							governancePages={data.governancePages}
							selected={data.selected}
							page={data.paper.page}
							{pageHref}
							textHref={viewHref('text')}
							onselect={(passageId) => select(passageHref(passageId))}
							onready={() => (originalReady = true)}
							onfail={() => (originalFailed = true)}
							onpage={(page, event) => {
								event.preventDefault();
								void select(pageHref(page));
							}}
						/>
					</div>
				{/if}
				{#if !showingOriginal}
					<PaperView
						paper={data.paper}
						selected={data.selected}
						filename={doc.filename}
						{passageHref}
						{pageHref}
						onselect={(_id, href) => select(href)}
						onexcerpt={takeExcerpt}
					/>
				{/if}
				<footer class="border-border flex flex-none flex-col gap-2 border-t px-4 py-2.5">
					<div class="flex items-center gap-2.5">
						{#if data.paper.page !== null && data.paper.page > 1}
							<a
								href={pageHref(data.paper.page - 1)}
								class="border-border text-fg-secondary hover:text-fg text-meta flex-none rounded-(--radius-control) border px-2.5 py-1"
								>‹ {m.workspace_page_prev({ page: data.paper.page - 1 })}</a
							>
						{/if}
						<span class="text-fg-muted text-meta min-w-0 flex-1" data-tabular>
							{data.paper.paged
								? m.workspace_on_page({
										count: data.identifiedOnPage,
										pages: data.counts.governancePages
									})
								: m.workspace_on_sheet({ count: data.counts.identified })}
						</span>
						{#if data.paper.page !== null && data.paper.page < data.paper.pageCount}
							<a
								href={pageHref(data.paper.page + 1)}
								class="border-border text-fg-secondary hover:text-fg text-meta flex-none rounded-(--radius-control) border px-2.5 py-1"
								>{m.workspace_page_next({ page: data.paper.page + 1 })} ›</a
							>
						{/if}
					</div>
					{#if data.nextOpen}
						<a
							href={passageHref(data.nextOpen)}
							class="text-accent-fg text-meta self-end"
							onclick={(event) => {
								event.preventDefault();
								void select(passageHref(data.nextOpen!));
							}}>{m.workspace_next_open()}</a
						>
					{:else if data.counts.identified > 0}
						<div class="flex flex-wrap items-center justify-end gap-2.5">
							<span class="text-fg-secondary text-meta">{m.workspace_all_answered()}</span>
							{#if data.canMarkDone && data.can.map}
								<form method="POST" action="?{returnTo ? `${returnTo}&` : ''}/markDone" use:enhance>
									<Button type="submit" size="sm" variant="primary"
										>{m.workspace_mark_done()}</Button
									>
								</form>
							{:else if data.done && data.can.map}
								<form method="POST" action="?{returnTo ? `${returnTo}&` : ''}/reopen" use:enhance>
									<Button type="submit" size="sm" variant="ghost">{m.workspace_reopen()}</Button>
								</form>
							{/if}
						</div>
					{/if}
				</footer>
			</section>

			<section class="flex min-w-0 flex-1 flex-col" aria-label={m.workspace_mapping_label()}>
				<div class="border-border bg-surface flex-none border-b px-5 py-3.5">
					<p class="text-fg" data-tabular>
						{data.counts.identified === 1
							? m.workspace_rail_found_one({ filename: doc.filename, mapped })
							: m.workspace_rail_found_many({
									filename: doc.filename,
									found: data.counts.identified,
									mapped
								})}
					</p>
					{#if data.coverage.of > 0}
						<div class="mt-2 flex items-center gap-2.5">
							<div class="bg-border h-1 flex-1 overflow-hidden rounded-full" aria-hidden="true">
								<!-- style= exception 1 (docs/02 §5): a computed bar width. -->
								<div class="bg-accent h-full" style="width: {coveragePercent}%"></div>
							</div>
							<span class="text-fg-secondary text-meta" data-tabular>
								{m.workspace_coverage({ have: data.coverage.have, of: data.coverage.of })}
							</span>
						</div>
					{/if}
					<div class="mt-3">{@render scan()}</div>
				</div>

				<div class="flex flex-none flex-wrap items-center gap-x-2.5 gap-y-1 px-5 pt-3 pb-1">
					<h2 class="text-fg-muted text-meta tracking-[0.06em] uppercase">
						{m.workspace_suggested_label()}
					</h2>
					<span class="text-fg-muted text-meta">{m.workspace_ai_note()}</span>
				</div>

				<div
					bind:this={rail}
					class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pt-2 pb-5"
				>
					<ReconfirmBlock candidates={data.reconfirm} canMap={data.can.map} {returnTo} />

					{#if selectedParagraph && !selectedHasClaims && data.can.map}
						<HandMapCard
							passageId={selectedParagraph.id}
							number={selectedParagraph.number ?? 0}
							excerpt={excerpt?.passageId === selectedParagraph.id ? excerpt : null}
							clauses={data.clauses}
							{returnTo}
						/>
					{/if}

					{#each data.cards as card (card.evidenceId)}
						<SuggestionCard
							{card}
							filename={doc.filename}
							paged={doc.paged}
							selected={card.passageId === data.selected}
							requirement={data.requirements[card.clauseKey] ?? null}
							requirementHref={requirementHref(card.clauseRef)}
							clauses={data.clauses}
							can={data.can}
							passageHref={passageHref(card.passageId)}
							{returnTo}
							onselect={select}
						/>
					{:else}
						<p class="text-fg-secondary">{m.workspace_no_cards()}</p>
					{/each}
				</div>
			</section>
		</div>

		<!-- One passage at a time below 1024px. -->
		<div class="lg:hidden">
			{#if originalFailed && data.view === 'original'}
				<p role="status" class="text-fg-secondary border-border border-b px-4 py-2">
					{m.original_failed()}
					<a
						href={links.documentFile(slug, doc.id)}
						class="text-accent-fg underline underline-offset-2">{m.workspace_download()}</a
					>
				</p>
			{/if}
			{#if !wide && wantsOriginal && Viewer}
				<div class="flex flex-col gap-2 px-4 py-3">
					<a
						href="?{new URLSearchParams({
							step: 'read',
							...(data.selected ? { passage: data.selected } : {})
						})}"
						class="text-accent-fg text-meta">{m.original_back_to_queue()}</a
					>
					<div
						class="border-border flex h-[80vh] flex-col overflow-hidden rounded-(--radius-card) border"
					>
						<Viewer
							url={links.documentFile(slug, doc.id)}
							highlights={data.highlights}
							governancePages={data.governancePages}
							selected={data.selected}
							page={data.paper.page}
							{pageHref}
							textHref="?{new URLSearchParams({
								view: 'page',
								...(data.paper.page !== null ? { page: String(data.paper.page) } : {})
							})}"
							thumbnails={false}
							onselect={(passageId) => select(passageHref(passageId))}
							onready={() => (originalReady = true)}
							onfail={() => (originalFailed = true)}
						/>
					</div>
				</div>
			{:else}
				<MappingQueue
					filename={doc.filename}
					paged={doc.paged}
					cards={data.cards}
					counts={data.counts}
					requirements={data.requirements}
					{requirementHref}
					clauses={data.clauses}
					can={data.can}
					passage={data.selected}
					step={data.step}
					seePage={data.seePage}
					paper={data.paper}
					reconfirm={data.reconfirm}
					canMarkDone={data.canMarkDone && data.can.map}
					{scan}
					{excerpt}
					onexcerpt={takeExcerpt}
					originalHref={doc.paged
						? (passageId, page) =>
								`?${new URLSearchParams({ view: 'original', page: String(page), passage: passageId })}`
						: null}
				/>
			{/if}
		</div>
	{/if}
</div>
