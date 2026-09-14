<script lang="ts">
	import { enhance } from '$app/forms';
	import * as m from '$lib/paraglide/messages';
	import { links } from '$lib/links';
	import IconDots from '~icons/tabler/dots';
	import Button from '$lib/components/ui/Button.svelte';
	import MappingStateChip, { type MappingState } from './MappingStateChip.svelte';
	import VersionList from './VersionList.svelte';
	import { fileSize, shortDate } from './format.js';

	/**
	 * One document in the library. Design 09's row: what it is, where it stands,
	 * how far along it is, and the one next thing to do — with the less frequent
	 * acts behind a menu.
	 *
	 * The menu is a `<details>`, not a scripted dropdown: every item is a link or
	 * a one-field form, so it opens, reads and works without JavaScript, and the
	 * keyboard reaches it like any disclosure.
	 */
	type Version = {
		id: string;
		filename: string;
		bytes: number;
		uploadedAt: number;
		uploader: string | null;
		supersededAt: number;
		supersededBy: string | null;
	};

	type Row = {
		id: string;
		filename: string;
		kind: string;
		bytes: number;
		pages: number | null;
		uploadedAt: number;
		uploader: string | null;
		state: MappingState;
		primaryAction: 'start' | 'continue' | 'review' | 'open';
		statusDetail: string | null;
		scanDetail: string | null;
		byHandOnly: boolean;
		counts: {
			paragraphs: number;
			paragraphsRead: number;
			identified: number;
			open: number;
			becameDefinitions: number;
			versions: number;
			confirmedClaims: number;
		};
		versions: readonly Version[];
	};

	type Props = {
		row: Row;
		slug: string;
		accepts: string;
		can: { upload: boolean; destroy: boolean; scan: boolean };
		/** Whether this member can scan anything here, and why not. */
		scanning: { offer: boolean; reason: string | null };
	};

	let { row, slug, accepts, can, scanning }: Props = $props();

	const href = $derived(links.document(slug, row.id));

	const settled = $derived(row.counts.identified - row.counts.open);

	const progress = $derived.by(() => {
		switch (row.state) {
			case 'reading':
				return m.library_progress_reading();
			case 'could_not_read':
			case 'cannot_scan':
				return row.statusDetail ?? '';
			case 'scanning':
				return m.library_progress_scanning({
					read: row.counts.paragraphsRead,
					total: row.counts.paragraphs
				});
			case 'not_scanned':
				return m.library_progress_not_scanned();
			case 'not_governance':
				return m.library_progress_not_governance();
			case 'in_progress':
			case 'mapped': {
				if (row.byHandOnly && row.state === 'in_progress') {
					return row.counts.identified === 1
						? m.library_progress_by_hand_one()
						: m.library_progress_by_hand_many({ count: row.counts.identified });
				}
				const mapped = m.library_progress_mapped({ settled, identified: row.counts.identified });
				if (row.counts.becameDefinitions === 0) return mapped;
				const became =
					row.counts.becameDefinitions === 1
						? m.library_progress_became_one()
						: m.library_progress_became_many({ count: row.counts.becameDefinitions });
				return `${mapped} · ${became}`;
			}
		}
	});

	const bar = $derived(
		row.state === 'scanning'
			? row.counts.paragraphs === 0
				? 0
				: row.counts.paragraphsRead / row.counts.paragraphs
			: row.counts.identified === 0
				? 0
				: settled / row.counts.identified
	);

	/** Starting a scan is offered on a not-scanned row, and disabled with a reason where it cannot run. */
	const startable = $derived(row.state === 'not_scanned' && can.scan);
	const blockedReason = $derived(
		row.state === 'cannot_scan'
			? row.statusDetail
			: startable && !scanning.offer
				? scanning.reason
				: null
	);
	const menuStartable = $derived(
		can.scan && scanning.offer && (row.state === 'not_scanned' || row.state === 'in_progress')
	);
</script>

<li
	class="border-border relative flex flex-wrap items-center gap-x-4 gap-y-3 border-b px-4 py-3.5 last:border-b-0"
>
	<span
		class="border-border-strong text-fg-muted flex h-9.5 w-7.5 flex-none items-end justify-center rounded-[3px] border pb-0.5 font-mono text-[8.5px]"
		aria-hidden="true">{row.kind}</span
	>

	<div class="min-w-48 flex-1">
		<div class="flex flex-wrap items-center gap-x-2.5 gap-y-1">
			<a {href} class="text-fg hover:text-accent-fg font-medium break-all">{row.filename}</a>
			<MappingStateChip state={row.state} />
		</div>
		<p class="text-fg-muted text-meta mt-1">
			<span data-tabular>
				{row.kind}{row.pages ? ` · ${m.library_meta_pages({ count: row.pages })}` : ''} · {fileSize(
					row.bytes
				)}
			</span>
			<span class="text-border-strong" aria-hidden="true">·</span>
			{row.uploader
				? m.library_added_by({ date: shortDate(row.uploadedAt), person: row.uploader })
				: m.library_added({ date: shortDate(row.uploadedAt) })}
		</p>
	</div>

	<div class="w-full sm:w-62.5 sm:flex-none">
		<p
			class="text-fg-secondary text-meta"
			id={row.state === 'cannot_scan' ? `scan-reason-${row.id}` : undefined}
		>
			{progress}
		</p>
		{#if row.state === 'in_progress' || row.state === 'mapped' || row.state === 'scanning'}
			<div
				class="bg-border mt-1.5 h-[3px] overflow-hidden rounded-full"
				role="progressbar"
				aria-label={progress}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={Math.round(bar * 100)}
			>
				<!-- style= exception 1 (docs/02 §5): a computed bar width. -->
				<div class="bg-accent h-full" style="width: {Math.round(bar * 100)}%"></div>
			</div>
		{/if}
	</div>

	<div class="flex flex-none items-center gap-2">
		{#if startable && scanning.offer}
			<form method="POST" action="?/scan" use:enhance>
				<input type="hidden" name="documentId" value={row.id} />
				<Button type="submit" variant="primary">{m.library_action_start()}</Button>
			</form>
		{:else if blockedReason}
			<!-- Disabled, never hidden: the member learns scanning exists, and why not here. -->
			<Button disabled aria-describedby="scan-reason-{row.id}">{m.library_action_start()}</Button>
		{:else if row.primaryAction === 'continue'}
			<a
				{href}
				class="bg-accent-solid hover:bg-accent-solid-hover inline-flex h-8 items-center rounded-(--radius-control) px-3 font-medium text-white"
				>{m.library_action_continue()}</a
			>
		{:else if row.primaryAction === 'review'}
			<a
				{href}
				class="bg-raised border-border hover:border-border-strong text-fg inline-flex h-8 items-center rounded-(--radius-control) border px-3 font-medium"
				>{m.library_action_review()}</a
			>
		{:else}
			<a
				{href}
				class="text-fg-secondary hover:text-fg hover:bg-raised inline-flex h-8 items-center rounded-(--radius-control) px-3 font-medium"
				>{m.library_action_open()}</a
			>
		{/if}

		<details class="group relative">
			<summary
				class="text-fg-muted hover:text-fg flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-(--radius-control)"
				aria-label={m.library_menu_label({ filename: row.filename })}
			>
				<IconDots class="h-4 w-4" aria-hidden="true" />
			</summary>
			<div
				class="border-border-strong bg-surface absolute top-9 right-0 z-10 flex w-72 flex-col gap-1 rounded-(--radius-control) border p-1.5"
			>
				{#if menuStartable}
					<form method="POST" action="?/scan" use:enhance>
						<input type="hidden" name="documentId" value={row.id} />
						<Button type="submit" variant="ghost" class="w-full justify-start">
							{row.state === 'in_progress' ? m.library_action_continue() : m.library_action_start()}
						</Button>
					</form>
				{/if}
				<a {href} class="text-fg-secondary hover:bg-border hover:text-fg rounded-[5px] px-2.5 py-2"
					>{m.library_action_open()}</a
				>

				{#if can.upload}
					<details class="rounded-[5px]">
						<summary
							class="text-fg-secondary hover:bg-border hover:text-fg cursor-pointer rounded-[5px] px-2.5 py-2"
							>{m.library_menu_replace()}</summary
						>
						<form
							method="POST"
							action="?/replace"
							enctype="multipart/form-data"
							class="flex flex-col gap-2 px-2.5 py-2"
							use:enhance
						>
							<input type="hidden" name="documentId" value={row.id} />
							<label class="sr-only" for="replace-{row.id}">{m.library_menu_replace()}</label>
							<input
								id="replace-{row.id}"
								name="file"
								type="file"
								required
								accept={accepts}
								class="text-fg-secondary text-meta max-w-full"
							/>
							<Button type="submit" size="sm" class="self-start"
								>{m.library_menu_replace_submit()}</Button
							>
						</form>
					</details>
				{/if}

				{#if row.counts.versions > 0}
					<details class="rounded-[5px]">
						<summary
							class="text-fg-secondary hover:bg-border hover:text-fg cursor-pointer rounded-[5px] px-2.5 py-2"
							>{m.library_menu_versions({ count: row.counts.versions })}</summary
						>
						<div class="px-2.5 py-2">
							<VersionList {slug} documentId={row.id} versions={row.versions} {can} />
						</div>
					</details>
				{/if}

				{#if can.destroy}
					<details class="border-border mt-1 rounded-[5px] border-t pt-1">
						<summary class="text-danger hover:bg-border cursor-pointer rounded-[5px] px-2.5 py-2"
							>{m.library_menu_remove()}</summary
						>
						<form
							method="POST"
							action="?/remove"
							class="flex flex-col gap-2 px-2.5 py-2"
							use:enhance
						>
							<input type="hidden" name="documentId" value={row.id} />
							<p class="text-fg-secondary text-meta">
								{m.library_remove_warning({
									filename: row.filename,
									claims: row.counts.confirmedClaims,
									versions: row.counts.versions
								})}
							</p>
							<Button type="submit" variant="danger" size="sm" class="self-start"
								>{m.library_remove_submit()}</Button
							>
						</form>
					</details>
				{/if}
			</div>
		</details>
	</div>

	{#if blockedReason && row.state !== 'cannot_scan'}
		<p id="scan-reason-{row.id}" class="text-fg-muted text-meta w-full">{blockedReason}</p>
	{/if}
	{#if row.scanDetail && row.state === 'in_progress'}
		<p class="text-fg-muted text-meta w-full">{row.scanDetail}</p>
	{/if}
</li>
