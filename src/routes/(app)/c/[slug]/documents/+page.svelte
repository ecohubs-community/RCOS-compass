<script lang="ts">
	import DocumentRow from '$lib/components/documents/DocumentRow.svelte';
	import UploadDropZone from '$lib/components/documents/UploadDropZone.svelte';
	import { pollWhileScanning } from '$lib/components/documents/poll';
	import * as m from '$lib/paraglide/messages';
	import { links } from '$lib/links';

	let { data, form } = $props();
	const slug = $derived(data.community.slug);

	const FILTERS = [
		{ key: 'all', label: m.library_filter_all },
		{ key: 'not_mapped', label: m.library_filter_not_mapped },
		{ key: 'mapped', label: m.library_filter_mapped }
	] as const;

	/** While a scan runs the list re-reads itself; `pollWhileScanning` holds the rule. */
	const anyScanning = $derived(data.rows.some((row) => row.state === 'scanning'));
	$effect(() => (anyScanning ? pollWhileScanning() : undefined));

	const uploadResults = $derived(form && 'results' in form ? form.results : null);
	const uploadError = $derived(
		form?.step === 'upload' &&
			'error' in form &&
			(form.error === 'none' || form.error === 'too_many')
			? form.error
			: null
	);
	/** "Scan started" names the file; the row itself turns to "Scanning" on the same answer. */
	const scanStarted = $derived.by(() => {
		if (
			form?.step !== 'scan' ||
			!('result' in form) ||
			!form.result ||
			!('queued' in form.result)
		) {
			return null;
		}
		const row = data.rows.find((candidate) => candidate.id === form.documentId);
		const filename = row?.filename ?? '';
		return form.result.queued
			? m.library_scan_queued({ filename })
			: m.library_scan_already({ filename });
	});
	const replaceRefused = $derived(
		form?.step === 'replace' && 'result' in form && form.result && 'refused' in form.result
			? form.result.refused
			: null
	);
</script>

<svelte:head><title>{m.library_title()} · {data.community.name}</title></svelte:head>

<main class="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6">
	<header>
		<h1 class="text-page font-medium tracking-tight">{m.library_title()}</h1>
		<p class="text-fg-muted mt-1 max-w-3xl">
			{m.library_description({ community: data.community.name })}
		</p>
	</header>

	{#if data.can.upload}
		<UploadDropZone
			community={data.community.name}
			accepts={data.accepts}
			maxMb={data.maxMb}
			maxFiles={data.maxFiles}
			serverResults={uploadResults}
			serverError={uploadError}
		/>
	{/if}

	<div class="flex flex-wrap items-center gap-x-2.5 gap-y-2">
		<p class="text-fg-secondary text-meta" data-tabular>
			{data.counts.all === 1
				? m.library_count_one()
				: m.library_count_many({ count: data.counts.all })}
			{#if data.coverage.of > 0}
				<span class="text-border-strong" aria-hidden="true">·</span>
				<span class="text-fg-muted">
					{m.library_coverage({ have: data.coverage.have, of: data.coverage.of })}
				</span>
			{/if}
		</p>
		<nav
			class="border-border ml-auto inline-flex overflow-hidden rounded-(--radius-control) border"
			aria-label={m.library_filters_label()}
		>
			{#each FILTERS as filter (filter.key)}
				<a
					href="{links.documents(slug)}?filter={filter.key}"
					aria-current={data.filter === filter.key ? 'page' : undefined}
					class="text-meta border-border border-r px-3 py-1.5 last:border-r-0 {data.filter ===
					filter.key
						? 'bg-raised text-fg'
						: 'text-fg-secondary hover:text-fg'}"
				>
					{filter.label()}{filter.key === 'all' ? '' : ` · ${data.counts[filter.key]}`}
				</a>
			{/each}
		</nav>
	</div>

	{#if form && form.step !== 'upload' && 'error' in form}
		<p role="alert" class="text-danger">{form.error}</p>
	{/if}
	{#if scanStarted}
		<p role="status" class="text-fg-secondary">{scanStarted}</p>
	{/if}
	{#if replaceRefused}
		<p role="alert" class="text-danger">{replaceRefused}</p>
	{/if}

	{#if data.counts.all === 0}
		<p class="text-fg-secondary">{m.library_empty()}</p>
	{:else}
		<section class="border-border bg-surface overflow-visible rounded-(--radius-card) border">
			{#if data.rows.length === 0}
				<p class="text-fg-muted px-4 py-3.5">{m.library_empty_filter()}</p>
			{:else}
				<ul>
					{#each data.rows as row (row.id)}
						<DocumentRow
							{row}
							{slug}
							accepts={data.accepts}
							can={data.can}
							scanning={data.scanning}
						/>
					{/each}
				</ul>
			{/if}
			<p class="text-fg-muted text-meta border-border border-t px-4 py-2.5">{m.library_footer()}</p>
		</section>
	{/if}
</main>
