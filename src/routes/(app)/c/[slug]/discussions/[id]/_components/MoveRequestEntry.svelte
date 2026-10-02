<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Markdown from '$lib/components/ui/Markdown.svelte';
	import * as m from '$lib/paraglide/messages';
	import { useTime } from '$lib/time/use-time';
	import IconArrowBackUp from '~icons/tabler/arrow-back-up';
	import type { PageData } from '../$types';
	import { threadContext } from './thread-context';

	/**
	 * A member asking for an earlier version back, drawn where they asked.
	 * `openspec/changes/provenance-ui` D10.
	 *
	 * The post is the request and its reason; the state comes from the record,
	 * so the same post reads "open" today and "declined — with the note" next
	 * week. A steward answers it here — *Put v3 back* moves the question exactly
	 * as the rail's button does — and the person who asked can take it back.
	 * Every control is a form, so it works before JavaScript.
	 */
	interface Props {
		entry: PageData['posts'][number];
		request: PageData['moveRequests'][number] | undefined;
		/** Holds the capability to move the question. Passed, never derived from a role. */
		canAnswer: boolean;
	}
	let { entry, request, canAnswer }: Props = $props();

	const thread = threadContext();
	const clock = useTime();
	const time = (ms: number) => clock.moment(ms, 'dateTimeShort');
	const failed = $derived(
		page.form?.step === 'answerMove' && page.form?.requestId === request?.id
			? (page.form.error as string)
			: undefined
	);
	const target = $derived(request?.targetVersion ?? entry.subjectVersion ?? 0);
	const control =
		'border-border-strong text-fg hover:bg-raised text-meta inline-flex min-h-11 cursor-pointer items-center rounded-(--radius-control) border px-3';
</script>

<div id="post-{entry.id}" class="flex scroll-mt-4 gap-3">
	<span class="text-info-fg flex w-7 flex-none justify-center pt-1" aria-hidden="true">
		<IconArrowBackUp class="h-4 w-4" />
	</span>
	<div class="border-info/40 min-w-0 flex-1 rounded-(--radius-card) border px-3 py-3">
		<p class="flex flex-wrap items-baseline gap-x-2">
			<span class="text-fg-secondary">
				<span class="text-fg font-medium">{entry.author.label}</span>
				{request?.fromVersion
					? m.move_asks_instead({ version: target, from: request.fromVersion })
					: m.move_asks({ version: target })}
			</span>
			<span class="text-fg-muted text-meta">{time(entry.createdAt)}</span>
		</p>
		<Markdown blocks={entry.body} class="mt-1" />

		{#if request}
			<p class="text-meta mt-2" data-state={request.state}>
				{#if request.state === 'open'}
					<span class="text-attention-fg">{m.move_open()}</span>
				{:else if request.state === 'granted'}
					<span class="text-fg-secondary"
						>{m.move_granted({ who: request.answeredBy ?? '', version: target })}</span
					>
				{:else if request.state === 'declined'}
					<span class="text-fg-secondary">{m.move_declined({ who: request.answeredBy ?? '' })}</span
					>
				{:else if request.state === 'withdrawn'}
					<span class="text-fg-muted">{m.move_withdrawn()}</span>
				{:else}
					<span class="text-fg-muted">{m.move_lapsed()}</span>
				{/if}
				{#if request.answeredAt}<span class="text-fg-muted" data-tabular>
						· {time(request.answeredAt)}</span
					>{/if}
			</p>
			{#if request.answerNote}
				<p class="text-fg border-border mt-1 border-l-2 pl-3">{request.answerNote}</p>
			{/if}

			{#if request.state === 'open' && (canAnswer || request.mine)}
				<div class="mt-3 flex flex-col gap-2">
					{#if canAnswer}
						<form method="POST" action="?/answerMove" class="flex flex-col gap-2" use:enhance>
							<input type="hidden" name="requestId" value={request.id} />
							{#if thread.version}<input type="hidden" name="v" value={thread.version} />{/if}
							<label for="answer-{request.id}" class="text-fg-secondary text-meta"
								>{m.move_note()}</label
							>
							<input
								id="answer-{request.id}"
								name="note"
								class="border-border bg-bg text-fg min-h-11 rounded-(--radius-control) border px-2"
							/>
							<div class="flex flex-wrap gap-2">
								<button type="submit" name="grant" value="1" class={control}
									>{m.move_grant({ version: target })}</button
								>
								<button type="submit" name="grant" value="0" class={control}
									>{m.move_decline()}</button
								>
							</div>
						</form>
					{/if}
					{#if request.mine}
						<form method="POST" action="?/withdrawMove" use:enhance>
							<input type="hidden" name="requestId" value={request.id} />
							<button type="submit" class={control}>{m.move_withdraw()}</button>
						</form>
					{/if}
					{#if failed}<p role="alert" class="text-danger text-meta">{failed}</p>{/if}
				</div>
			{/if}
		{/if}
	</div>
</div>
