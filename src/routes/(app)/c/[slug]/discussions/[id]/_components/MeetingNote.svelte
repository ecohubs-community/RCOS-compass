<script lang="ts">
	import Markdown from '$lib/components/ui/Markdown.svelte';
	import { useTime } from '$lib/time/use-time';
	import IconCalendarEvent from '~icons/tabler/calendar-event';
	import type { PageData } from '../$types';

	/**
	 * What a meeting decided, written up — the header and the summary as one
	 * piece, so nobody mistakes it for somebody's reply. Used on its own for a
	 * meeting that produced no text, and at the top of a proposal card for one
	 * that did.
	 */
	interface Props {
		entry: PageData['posts'][number];
		/** False when the meeting produced no proposal, which the note says. */
		produced: boolean;
	}
	let { entry, produced }: Props = $props();

	const clock = useTime();
</script>

<div>
	<p class="text-meta flex flex-wrap items-center gap-x-2 gap-y-0.5">
		<IconCalendarEvent class="text-fg-muted h-3.5 w-3.5 flex-none" aria-hidden="true" />
		<span class="text-fg-secondary tracking-wide uppercase"
			>Meeting · {clock.dateShort(entry.createdAt)}</span
		>
		<span class="text-fg-muted"
			>written up by <span class="text-fg-secondary">{entry.author.label}</span> · {clock.moment(
				entry.createdAt,
				'dateTimeShort'
			)}</span
		>
	</p>
	<Markdown blocks={entry.body} class="text-fg mt-2 font-serif leading-relaxed" />
	{#if !produced}
		<p class="text-fg-muted text-meta mt-2">No proposal came out of this meeting.</p>
	{/if}
</div>
