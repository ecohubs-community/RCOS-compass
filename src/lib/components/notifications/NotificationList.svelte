<script lang="ts">
	import { enhance } from '$app/forms';
	import * as m from '$lib/paraglide/messages';
	import { links } from '$lib/links';
	import type { NotificationItem } from '$lib/notifications/kinds';
	import { notificationText } from '$lib/notifications/text';
	import { useTime } from '$lib/time/use-time';

	/**
	 * Notifications as rows. Shared by the page and the bell, so both open the
	 * same way: each row is a one-button form posting to the page's `open`
	 * action, which marks it read and goes to what it is about. A link would be
	 * preloaded on hover, and a preloaded link must not read anything.
	 */
	type Props = {
		slug: string;
		items: readonly NotificationItem[];
		/** The server's time the list was loaded at, for "2 hours ago" that agrees before and after hydration. */
		now: number;
		/** The notification `?gone=` names, shown with its sentence. */
		gone?: string | null;
		compact?: boolean;
		/** Called as a row is submitted — the bell closes its popover. */
		onopen?: () => void;
	};

	let { slug, items, now, gone = null, compact = false, onopen }: Props = $props();
	const time = useTime();
</script>

<ul class="flex flex-col {compact ? '' : 'gap-1'}">
	{#each items as item (item.id)}
		<li>
			<form
				method="POST"
				action="{links.notifications(slug)}?/open"
				use:enhance={() => {
					onopen?.();
				}}
			>
				<input type="hidden" name="id" value={item.id} />
				<button
					type="submit"
					class="hover:bg-raised flex w-full cursor-pointer items-start gap-3 rounded-(--radius-control) px-3 text-left {compact
						? 'py-2'
						: 'py-2.5'}"
				>
					<span
						class="mt-1.5 h-2 w-2 flex-none rounded-full {item.unread
							? 'bg-accent'
							: 'bg-transparent'}"
						aria-hidden="true"
					></span>
					<span class="flex min-w-0 flex-1 flex-col gap-0.5">
						<span
							class="{item.unread ? 'text-fg font-medium' : 'text-fg-secondary'} {item.available
								? ''
								: 'italic'}"
						>
							{#if item.unread}<span class="sr-only"
									>{m.notifications_unread()}:
								</span>{/if}{notificationText(item, (ms) => time.deadline(ms))}
						</span>
						<span class="text-fg-muted text-meta" data-tabular>
							<time
								datetime={new Date(item.createdAt).toISOString()}
								title={time.dateTime(item.createdAt)}>{time.relative(item.createdAt, now)}</time
							>
						</span>
						{#if gone === item.id}
							<span role="status" class="text-attention text-meta">{m.notifications_gone()}</span>
						{/if}
					</span>
				</button>
			</form>
		</li>
	{/each}
</ul>
