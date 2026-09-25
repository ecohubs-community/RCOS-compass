<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import Markdown from '$lib/components/ui/Markdown.svelte';
	import MentionField from '$lib/components/discussions/MentionField.svelte';
	import type { PageData } from '../$types';
	import { threadContext } from './thread-context';

	/**
	 * What a message says, and what its author can do to it.
	 *
	 * Edit and delete are the author's alone, on a `message` only (the reason
	 * given with a vote is changed by answering again). Everything here is a
	 * form or a link, so it works before JavaScript: editing is `?edit=` on the
	 * URL, and the form replaces the text where it stands.
	 *
	 * A deleted message stays in its place, so the replies under it keep
	 * answering something. Everybody else sees that it was deleted — the server
	 * never sends them its words. Its author sees their words struck through,
	 * with a way to restore them: a delete is easy to regret, and a quiet undo is
	 * kinder than a confirmation box.
	 */
	interface Props {
		entry: PageData['posts'][number];
		/** Where "Reply" goes, or null when there is no reply link here. */
		replyHref?: string | null;
	}
	let { entry, replyHref = null }: Props = $props();

	const thread = threadContext();
	const own = $derived(entry.kind === 'message' && entry.editable !== null);
	const editing = $derived(own && !entry.deleted && thread.editing === entry.id);
	const here = $derived(thread.version ? `?v=${thread.version}` : '?');
	const control =
		'text-fg-secondary hover:text-fg text-meta inline-flex min-h-8 cursor-pointer items-center underline underline-offset-2';
</script>

<!--
	eslint-disable svelte/no-navigation-without-resolve --
	`?edit=` and `?v=` are this same page with a different state — bare queries.
-->

{#if editing}
	<form method="POST" action="?/edit" class="mt-1 flex flex-col gap-2" use:enhance>
		<input type="hidden" name="postId" value={entry.id} />
		{#if thread.version}<input type="hidden" name="v" value={thread.version} />{/if}
		<label for="edit-{entry.id}" class="sr-only">Edit your message</label>
		<MentionField
			id="edit-{entry.id}"
			name="body"
			rows={3}
			required
			value={entry.editable ?? ''}
			class="border-border bg-bg text-fg rounded-(--radius-control) border p-2"
			members={thread.members}
		/>
		<div class="flex flex-wrap items-center gap-3">
			<Button type="submit" variant="secondary">Save</Button>
			<a href="{here}#post-{entry.id}" class={control}>Cancel</a>
		</div>
	</form>
{:else if entry.deleted}
	{#if own}
		<Markdown blocks={entry.body} class="text-fg-muted mt-1 line-through" />
		<p class="text-fg-muted text-meta mt-1">You deleted this. Only you can still see the words.</p>
	{:else}
		<p class="text-fg-muted mt-1 italic">Message has been deleted.</p>
	{/if}
{:else}
	<Markdown blocks={entry.body} class="mt-1" />
{/if}

{#if !editing && (replyHref || own)}
	<div class="mt-0.5 flex flex-wrap items-center gap-x-3">
		{#if replyHref && !entry.deleted}
			<a href={replyHref} class={control}>Reply</a>
		{/if}
		{#if own && !entry.deleted}
			<a href="{here}{here === '?' ? '' : '&'}edit={entry.id}#post-{entry.id}" class={control}
				>Edit</a
			>
			<form method="POST" action="?/delete" use:enhance>
				<input type="hidden" name="postId" value={entry.id} />
				{#if thread.version}<input type="hidden" name="v" value={thread.version} />{/if}
				<button type="submit" class={control}>Delete</button>
			</form>
		{:else if own}
			<form method="POST" action="?/restore" use:enhance>
				<input type="hidden" name="postId" value={entry.id} />
				{#if thread.version}<input type="hidden" name="v" value={thread.version} />{/if}
				<button type="submit" class={control}>Restore</button>
			</form>
		{/if}
	</div>
{/if}
