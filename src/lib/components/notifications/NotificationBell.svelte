<script lang="ts">
	import { Popover } from 'bits-ui';
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import * as m from '$lib/paraglide/messages';
	import { links } from '$lib/links';
	import type { NotificationItem } from '$lib/notifications/kinds';
	import IconBell from '~icons/tabler/bell';
	import NotificationList from './NotificationList.svelte';

	/**
	 * The bell in the top bar. UI spec §4.11; `openspec/changes/notifications-page`.
	 *
	 * A link to the notifications page until the page has hydrated, so without
	 * JavaScript it is simply that. After mount it opens a popover of the latest
	 * few — the same one-button forms as the page, so opening one here marks it
	 * read the same way — with *Mark all as read* and *See all*.
	 */
	type Props = {
		slug: string;
		unread: number;
		/** The latest few, from the community layout. */
		items: readonly NotificationItem[];
		now: number;
	};

	let { slug, unread, items, now }: Props = $props();

	let mounted = $state(false);
	let open = $state(false);
	onMount(() => {
		mounted = true;
	});

	const count = $derived(unread > 99 ? '99+' : String(unread));
	const label = $derived(
		unread > 0
			? m.notifications_bell_label({ count: unread > 99 ? '99+' : unread })
			: m.notifications_bell_none()
	);
	const trigger =
		'text-fg-secondary hover:text-fg hover:bg-raised relative inline-flex h-7.5 min-w-7.5 cursor-pointer items-center justify-center gap-1 rounded-(--radius-control) px-1.5';
</script>

{#snippet face()}
	<IconBell class="h-4 w-4 flex-none" aria-hidden="true" />
	{#if unread > 0}
		<span
			class="bg-accent-solid text-meta min-w-4.5 rounded-full px-1 text-center leading-4.5 font-medium text-white"
			data-tabular
			aria-hidden="true">{count}</span
		>
	{/if}
{/snippet}

{#if !mounted}
	<a href={links.notifications(slug)} class={trigger} aria-label={label}>{@render face()}</a>
{:else}
	<Popover.Root bind:open>
		<Popover.Trigger class={trigger} aria-label={label}>{@render face()}</Popover.Trigger>
		<Popover.Portal>
			<Popover.Content
				class="border-border bg-surface text-body z-50 flex max-h-[min(32rem,80vh)] w-[min(24rem,calc(100vw-1.5rem))] flex-col rounded-(--radius-card) border shadow-lg"
				sideOffset={6}
				align="end"
				role="dialog"
				aria-label={m.notifications_heading()}
			>
				<div class="border-border flex items-center gap-3 border-b px-3 py-2">
					<p class="text-fg flex-1 font-medium">{m.notifications_heading()}</p>
					{#if unread > 0}
						<form method="POST" action="{links.notifications(slug)}?/readAll" use:enhance>
							<button type="submit" class="text-accent text-meta cursor-pointer hover:underline">
								{m.notifications_mark_all()}
							</button>
						</form>
					{/if}
				</div>
				<div class="min-h-0 flex-1 overflow-y-auto p-1">
					{#if items.length === 0}
						<p class="text-fg-secondary px-3 py-4">{m.notifications_none()}</p>
					{:else}
						<NotificationList {slug} {items} {now} compact onopen={() => (open = false)} />
					{/if}
				</div>
				<div class="border-border border-t px-3 py-2">
					<a
						href={links.notifications(slug)}
						class="text-accent font-medium hover:underline"
						onclick={() => (open = false)}>{m.notifications_see_all()}</a
					>
				</div>
			</Popover.Content>
		</Popover.Portal>
	</Popover.Root>
{/if}
