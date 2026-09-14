<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { links } from '$lib/links';
	import NotificationBell from '$lib/components/notifications/NotificationBell.svelte';
	import type { NotificationItem } from '$lib/notifications/kinds';
	import IconPlus from '~icons/tabler/plus';
	import IconSearch from '~icons/tabler/search';

	/**
	 * The 52px shell bar. Design: `design_files/platform/TopBar.dc.html`, and the
	 * designer prompt's "App shell (all screens)" — breadcrumb left, a global
	 * search field centre-left, a "New discussion" button right.
	 *
	 * It was specified for every screen and never built; search ended up in the
	 * sidebar instead, which put a text field in the one column that is otherwise
	 * all navigation, and left no home for the thing a member does most often
	 * after reading something: start a discussion about it.
	 *
	 * The bell sits beside it: the unread count and the latest few, opening onto
	 * the notifications page (UI spec §4.11). The count used to ride on the
	 * Discussions nav item, back when there was nowhere for it to lead.
	 */
	type Props = {
		community: string;
		slug: string;
		/** Where the reader is, in the nav's own words. */
		crumb: string;
		/** A step below it — the document open in the workspace, "Documents / bylaws-2019.pdf". */
		sub?: string | null;
		unread: number;
		/** The bell's latest few. */
		notifications: readonly NotificationItem[];
		now: number;
	};

	let { community, slug, crumb, sub = null, unread, notifications, now }: Props = $props();

	let field = $state<HTMLInputElement | null>(null);
	/**
	 * The ⌘K hint is drawn only where the shortcut works. A key cap that decorates
	 * a field it cannot reach teaches somebody a shortcut that fails.
	 */
	const shortcut = (event: KeyboardEvent) => {
		if (event.key !== 'k' || !(event.metaKey || event.ctrlKey)) return;
		event.preventDefault();
		field?.focus();
		field?.select();
	};
</script>

<svelte:window onkeydown={shortcut} />

<div
	class="border-border bg-bg flex min-h-13 flex-wrap items-center gap-x-3.5 gap-y-2 border-b px-4 py-2"
>
	<nav class="flex items-center gap-1.5 whitespace-nowrap" aria-label={m.topbar_breadcrumb()}>
		<span class="text-fg-muted">{community}</span>
		<span class="text-border-strong" aria-hidden="true">/</span>
		{#if sub}
			<span class="text-fg-secondary">{crumb}</span>
			<span class="text-border-strong" aria-hidden="true">/</span>
			<span class="text-fg max-w-60 truncate" aria-current="page">{sub}</span>
		{:else}
			<span class="text-fg" aria-current="page">{crumb}</span>
		{/if}
	</nav>

	<form method="GET" action={links.search(slug)} class="min-w-44 flex-1 sm:max-w-85">
		<div class="relative">
			<IconSearch
				class="text-fg-muted pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2"
				aria-hidden="true"
			/>
			<input
				bind:this={field}
				type="search"
				name="q"
				placeholder={m.topbar_search_placeholder()}
				aria-label={m.topbar_search_label()}
				aria-keyshortcuts="Meta+K Control+K"
				class="border-border bg-surface text-fg placeholder:text-fg-muted text-meta h-7.5 w-full min-w-0 rounded-(--radius-control) border py-1 pr-12 pl-8"
			/>
			<!--
				Hidden below `sm`: a phone has no ⌘K, and a key cap it cannot press is
				a label taking room from the placeholder.
			-->
			<kbd
				class="border-border text-fg-muted absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border px-1 text-[10px] sm:block"
				aria-hidden="true">⌘K</kbd
			>
		</div>
	</form>

	<div class="ml-auto">
		<NotificationBell {slug} {unread} items={notifications} {now} />
	</div>

	<a
		href={links.discussions(slug)}
		class="bg-accent-solid hover:bg-accent-solid-hover inline-flex h-7.5 items-center gap-1.5 rounded-(--radius-control) px-2.5 font-medium whitespace-nowrap text-white"
	>
		<IconPlus class="h-3.5 w-3.5 flex-none" aria-hidden="true" />
		{m.topbar_new_discussion()}
	</a>
</div>
