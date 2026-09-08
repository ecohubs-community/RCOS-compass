<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import * as m from '$lib/paraglide/messages';

	/**
	 * "Something is wrong with this screen", from any screen.
	 * `docs/08-roadmap-mvp.md` P7.
	 *
	 * In the shell rather than on a page, because the observation worth catching
	 * arrives while somebody is stuck — and a person who has to find the feedback
	 * page first is a person who tells you in a call instead, or not at all.
	 *
	 * It posts to the community's own feedback screen and sends the route and
	 * what they typed. Nothing reads the page: a report that scooped up the
	 * half-written definition on screen would be a governance leak wearing a
	 * helpful hat.
	 */
	let { slug }: { slug: string } = $props();

	let open = $state(false);
</script>

<div class="mt-3">
	{#if open}
		<form
			method="POST"
			action="{resolve('/(app)/c/[slug]/feedback', { slug })}?/report"
			use:enhance={() =>
				({ update }) => {
					open = false;
					return update();
				}}
			class="flex flex-col gap-2"
		>
			<p class="text-fg font-medium">{m.feedback_heading()}</p>
			<input type="hidden" name="route" value={page.url.pathname} />

			<label class="text-fg-secondary text-meta" for="feedback-kind"
				>{m.feedback_kind_label()}</label
			>
			<select
				id="feedback-kind"
				name="kind"
				class="border-border bg-raised text-fg h-8 rounded-(--radius-control) border px-2"
			>
				<option value="confusing">{m.feedback_kind_confusing()}</option>
				<option value="broken">{m.feedback_kind_broken()}</option>
				<option value="missing">{m.feedback_kind_missing()}</option>
				<option value="other">{m.feedback_kind_other()}</option>
			</select>

			<label class="text-fg-secondary text-meta" for="feedback-body"
				>{m.feedback_what_label()}</label
			>
			<textarea
				id="feedback-body"
				name="body"
				required
				rows="3"
				class="border-border bg-raised text-fg rounded-(--radius-control) border px-2 py-1"
			></textarea>

			<p class="text-fg-muted text-meta">{m.feedback_privacy()}</p>
			<div class="flex gap-2">
				<button
					type="submit"
					class="bg-accent-deep text-fg h-8 cursor-pointer rounded-(--radius-control) px-3 font-medium"
					>{m.feedback_send()}</button
				>
				<button
					type="button"
					onclick={() => (open = false)}
					class="text-fg-secondary hover:text-fg h-8 cursor-pointer px-2 underline underline-offset-2"
					>{m.feedback_cancel()}</button
				>
			</div>
		</form>
	{:else}
		<button
			type="button"
			onclick={() => (open = true)}
			class="text-fg-muted hover:text-fg text-meta cursor-pointer underline underline-offset-2"
			>{m.feedback_button()}</button
		>
	{/if}
</div>
