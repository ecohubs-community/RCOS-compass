<script lang="ts">
	import { resolve } from '$app/paths';

	let { data } = $props();
</script>

<svelte:head><title>Communities · RCOS Compass</title></svelte:head>

<main class="mx-auto max-w-5xl px-6 py-8">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-page font-medium">Communities</h1>
		<a
			href={resolve('/(admin)/admin/communities/new')}
			class="bg-accent-solid hover:bg-accent-solid-hover inline-flex h-8 items-center rounded-(--radius-control) px-3 font-medium text-white"
		>
			New community
		</a>
	</div>
	<p class="text-fg-secondary mt-2">
		{data.tenants.length} on this instance. Metadata only — no community's content is reachable from here.
	</p>

	{#if data.tenants.length === 0}
		<p class="text-fg-muted mt-8">Nothing yet.</p>
	{:else}
		<table class="mt-6 w-full text-left">
			<thead class="text-fg-muted text-meta border-border border-b">
				<tr>
					<th class="py-2 font-normal">Name</th>
					<th class="py-2 font-normal">Slug</th>
					<th class="py-2 font-normal">Status</th>
					<th class="py-2 text-right font-normal">Members</th>
					<th class="py-2 font-normal">Owner</th>
				</tr>
			</thead>
			<tbody>
				{#each data.tenants as tenant (tenant.id)}
					<tr class="border-border/60 border-b">
						<td class="py-2">
							<a
								href={resolve('/(admin)/admin/communities/[id]', { id: tenant.id })}
								class="hover:text-fg underline underline-offset-2">{tenant.name}</a
							>
						</td>
						<td class="text-fg-secondary py-2"><code>{tenant.slug}</code></td>
						<td class="py-2">{tenant.status}</td>
						<td class="py-2 text-right" data-tabular>{tenant.members}</td>
						<td class="text-fg-secondary py-2">{tenant.ownerEmail ?? 'pending owner'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</main>
