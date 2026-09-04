<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';

	let { data, form } = $props();

	const PROVIDER_NAME: Record<string, string> = {
		null: 'none',
		fixture: 'a recorded fixture (tests only)',
		google: 'Google AI Studio',
		'openai-compatible': 'an OpenAI-compatible endpoint'
	};
</script>

<svelte:head><title>AI assistance · {data.community.name}</title></svelte:head>

<main class="mx-auto w-full max-w-3xl px-6 py-8">
	<h1 class="text-page font-medium">AI assistance</h1>
	<p class="text-fg-secondary mt-2">
		Compass can suggest which clauses your documents already answer, and ask two extra questions
		about a definition. Everything it does can be done by hand, and is, when this is off.
	</p>

	{#if !data.ai.providerConfigured}
		<p class="border-border bg-raised text-fg-secondary mt-6 rounded-(--radius-card) border p-4">
			This installation has no AI provider configured, so there is nothing to switch on. Mapping and
			linting work as they always do.
		</p>
	{:else}
		<section class="border-border mt-6 rounded-(--radius-card) border p-4" aria-labelledby="switch">
			<h2 id="switch" class="text-title font-medium">
				{data.ai.enabled ? 'On' : 'Off'}
			</h2>
			<!--
				The provider is named here rather than in a policy nobody reads. Some
				hosted tiers reserve the right to train on submitted prompts, and
				governance drafts are among the most sensitive text a community holds.
			-->
			<p class="text-fg-secondary mt-2">
				Text you send would go to <strong class="text-fg"
					>{PROVIDER_NAME[data.ai.providerName] ?? data.ai.providerName}</strong
				>. Only the passage or definition being worked on is sent — never your whole document
				library, and never member names or email addresses.
			</p>

			{#if data.can.manage}
				<form method="POST" action="?/toggle" class="mt-4" use:enhance>
					<input type="hidden" name="enabled" value={data.ai.enabled ? 'off' : 'on'} />
					<Button type="submit" variant={data.ai.enabled ? 'secondary' : 'primary'}>
						{data.ai.enabled ? 'Switch it off' : 'Switch it on'}
					</Button>
				</form>
			{:else}
				<p class="text-fg-muted text-meta mt-3">A steward can change this.</p>
			{/if}
			{#if form?.error}<p role="alert" class="text-danger mt-2">{form.error}</p>{/if}
		</section>

		<section class="mt-8" aria-labelledby="usage">
			<h2 id="usage" class="text-section font-medium">What you have used</h2>
			<!-- An invisible quota is indistinguishable from a bug. -->
			<dl
				class="border-border mt-3 grid grid-cols-2 gap-x-6 gap-y-3 rounded-(--radius-card) border p-4 sm:grid-cols-3"
			>
				<div>
					<dt class="text-fg-muted text-meta">Tasks today</dt>
					<dd data-tabular>{data.ai.budget.tasksToday} of {data.ai.budget.tasksPerDay}</dd>
				</div>
				<div>
					<dt class="text-fg-muted text-meta">Your tokens this month</dt>
					<dd data-tabular>
						{data.ai.budget.tokensThisMonth.toLocaleString()} of {data.ai.budget.tokensPerMonth.toLocaleString()}
					</dd>
				</div>
				<div>
					<dt class="text-fg-muted text-meta">Community this month</dt>
					<dd data-tabular>
						{data.ai.budget.communityTokensThisMonth.toLocaleString()} of {data.ai.budget.communityTokensPerMonth.toLocaleString()}
					</dd>
				</div>
			</dl>

			{#if data.can.manage && data.perMember.length > 0}
				<h3 class="text-title mt-6 font-medium">Per member, this month</h3>
				<ul class="mt-2 flex flex-col gap-1">
					{#each data.perMember as row (row.email)}
						<li class="flex justify-between">
							<span class="text-fg-secondary">{row.email}</span>
							<span data-tabular>{row.tokens.toLocaleString()} tokens · {row.tasks} tasks</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</main>
