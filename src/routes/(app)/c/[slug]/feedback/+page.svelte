<script lang="ts">
	import { enhance } from '$app/forms';
	import * as m from '$lib/paraglide/messages';

	let { data, form } = $props();

	const day = (ms: number) =>
		new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
</script>

<svelte:head><title>{m.nav_feedback()}</title></svelte:head>

<main class="mx-auto w-full max-w-6xl px-6 py-8">
	<h1 class="text-page font-medium">{m.nav_feedback()}</h1>
	<p class="text-fg-secondary mt-2">{m.feedback_privacy()}</p>

	{#if form?.sent}
		<p role="status" class="text-fg-secondary mt-4">{m.feedback_sent()}</p>
	{/if}

	{#if data.reports.length === 0}
		<p class="text-fg-secondary mt-6">{m.feedback_none()}</p>
	{:else}
		<ul class="mt-6 flex flex-col gap-3">
			{#each data.reports as report (report.id)}
				<li class="border-border bg-surface rounded-(--radius-card) border p-4">
					<p class="text-fg-muted text-meta">
						{report.kind} · <code>{report.route}</code> · {report.from} · {day(report.createdAt)}
						{#if report.status === 'handled'}· handled{/if}
					</p>
					<p class="mt-2 whitespace-pre-line">{report.body}</p>
					{#if data.can.manage && report.status === 'open'}
						<form method="POST" action="?/handled" use:enhance class="mt-2">
							<input type="hidden" name="id" value={report.id} />
							<button
								type="submit"
								class="text-fg-secondary hover:text-fg text-meta cursor-pointer underline underline-offset-2"
								>{m.feedback_mark_handled()}</button
							>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</main>
