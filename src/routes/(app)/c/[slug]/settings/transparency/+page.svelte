<script lang="ts">
	import { useTime } from '$lib/time/use-time';
	let { data } = $props();

	const time = useTime();
	const day = (ms: number) => time.date(ms);

	const SUBJECT: Record<string, string> = {
		definition: 'Definition',
		decision: 'Decision',
		document: 'Document',
		artifact: 'Artifact'
	};
</script>

<svelte:head><title>What we are not showing · {data.community.name}</title></svelte:head>

<main class="mx-auto w-full max-w-6xl px-6 py-8">
	<h1 class="text-page font-medium">What we are not showing</h1>
	<p class="text-fg-secondary mt-2">
		Almost everything here is visible to every member. These are the exceptions: what is restricted,
		who can still see it, why, and when the restriction ends.
	</p>
	<p class="text-fg-muted text-meta mt-2">
		Every one of them has an end date. Nothing stays hidden by default — when the date passes it
		becomes visible to all members again, and the change is recorded.
	</p>

	{#if data.live.length === 0}
		<p class="text-fg-secondary mt-8">Nothing is restricted. Every member can see everything.</p>
	{:else}
		<ul class="mt-6 flex flex-col gap-3">
			{#each data.live as item (item.id)}
				<li class="border-border bg-surface rounded-(--radius-card) border p-4">
					<div class="flex flex-wrap items-baseline gap-2">
						<span class="text-fg font-medium">{SUBJECT[item.subjectType] ?? item.subjectType}</span>
						<span class="text-fg-muted text-meta">visible to {item.audience}</span>
						<span class="text-fg-secondary text-meta ml-auto" data-tabular>
							{#if item.daysLeft > 0}
								ends {day(item.expiresAt)} · {item.daysLeft} day{item.daysLeft === 1 ? '' : 's'} left
							{:else}
								<span class="text-attention">past its end date — the next sweep will lift it</span>
							{/if}
						</span>
					</div>
					<p class="text-fg-secondary mt-2">{item.justification}</p>
					{#if item.renewsId}
						<p class="text-fg-muted text-meta mt-1">Renewed — the earlier reason is below.</p>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if data.ended.length > 0}
		<section class="mt-10" aria-labelledby="ended">
			<h2 id="ended" class="text-section font-medium">Restrictions that have ended</h2>
			<p class="text-fg-muted text-meta mt-1">
				Kept because “why was this hidden, and for how long?” is a question with an answer.
			</p>
			<ul class="mt-3 flex flex-col gap-2">
				{#each data.ended as item (item.id)}
					<li class="border-border/60 flex flex-wrap gap-x-3 border-b pb-2">
						<span class="text-fg-secondary text-meta"
							>{SUBJECT[item.subjectType] ?? item.subjectType}</span
						>
						<span class="text-fg-muted text-meta" data-tabular>ended {day(item.expiredAt)}</span>
						<span class="text-fg-secondary min-w-0 flex-1">{item.justification}</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</main>
