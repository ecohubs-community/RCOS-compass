<script lang="ts">
	import { useTime } from '$lib/time/use-time';
	import type { PageData } from '../$types';
	import MessageBody from './MessageBody.svelte';

	/**
	 * The replies under one message or one reason, and the way to add another.
	 *
	 * One level deep: a reply to a reply is filed under the post that started
	 * the exchange (`addMessage`), so this never nests. The link is a link, with
	 * the post in the URL, so replying works before JavaScript arrives.
	 */
	interface Props {
		replies: PageData['posts'][number][];
		/** Where "Reply" goes, or null when this member may not reply. */
		replyHref: string | null;
	}
	let { replies, replyHref }: Props = $props();

	const clock = useTime();
</script>

<!--
	eslint-disable svelte/no-navigation-without-resolve --
	`replyHref` is this same page with `?reply=` — a bare query built by the page.
-->

{#if replies.length > 0}
	<ol class="border-border mt-3 flex flex-col gap-3 border-l-2 pl-3">
		{#each replies as reply (reply.id)}
			<li id="post-{reply.id}" class="flex scroll-mt-4 gap-2">
				<span
					class="bg-raised text-fg-secondary text-meta flex h-5 w-5 flex-none items-center justify-center rounded-full font-medium"
					aria-hidden="true">{reply.author.initials.slice(0, 1)}</span
				>
				<div class="min-w-0 flex-1">
					<p class="flex flex-wrap items-baseline gap-x-2">
						<span class="text-fg text-meta font-medium">{reply.author.label}</span>
						<span class="text-fg-muted text-meta"
							>{clock.moment(reply.createdAt, 'dateTimeShort')}</span
						>
						{#if reply.editedAt && !reply.deleted}
							<span class="text-fg-muted text-meta"
								>· edited {clock.moment(reply.editedAt, 'dateTimeShort')}</span
							>
						{/if}
					</p>
					<MessageBody entry={reply} />
				</div>
			</li>
		{/each}
	</ol>
{/if}
{#if replyHref}
	<a
		href={replyHref}
		class="text-fg-secondary hover:text-fg text-meta mt-1.5 inline-flex min-h-8 items-center underline underline-offset-2"
		>Reply</a
	>
{/if}
