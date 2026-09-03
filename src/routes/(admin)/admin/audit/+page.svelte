<script lang="ts">
	import { resolve } from '$app/paths';

	let { data } = $props();

	const stamp = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
</script>

<svelte:head><title>Audit log · RCOS Compass</title></svelte:head>

<main class="mx-auto max-w-6xl px-6 py-8">
	<h1 class="text-page font-medium">Audit log</h1>
	<p class="text-fg-secondary mt-2">
		Every administrative and security event on this instance, newest first. Append-only — nobody,
		including an administrator, can edit or remove an entry.
	</p>

	<!-- A GET form: a filtered view is a URL someone can bookmark or paste. -->
	<form method="GET" class="mt-6 flex flex-wrap items-end gap-3">
		<div class="flex flex-col gap-1.5">
			<label for="action" class="text-fg font-medium">Action</label>
			<select
				id="action"
				name="action"
				class="border-border bg-raised text-fg h-9 rounded-(--radius-control) border px-2.5"
			>
				<option value="">Any</option>
				{#each data.actions as action (action)}
					<option value={action} selected={data.filters.action === action}>{action}</option>
				{/each}
			</select>
		</div>
		<div class="flex flex-col gap-1.5">
			<label for="community" class="text-fg font-medium">Community</label>
			<select
				id="community"
				name="community"
				class="border-border bg-raised text-fg h-9 rounded-(--radius-control) border px-2.5"
			>
				<option value="">Any</option>
				{#each data.tenants as tenant (tenant.id)}
					<option value={tenant.id} selected={data.filters.communityId === tenant.id}
						>{tenant.name}</option
					>
				{/each}
			</select>
		</div>
		<div class="flex flex-col gap-1.5">
			<label for="actor" class="text-fg font-medium">Actor or IP</label>
			<input
				id="actor"
				name="actor"
				value={data.filters.actor ?? ''}
				class="border-border bg-raised text-fg h-9 rounded-(--radius-control) border px-2.5"
			/>
		</div>
		<button
			type="submit"
			class="bg-raised border-border hover:border-border-strong h-9 cursor-pointer rounded-(--radius-control) border px-3 font-medium"
		>
			Filter
		</button>
		<a
			href={resolve('/(admin)/admin/audit')}
			class="text-fg-secondary hover:text-fg h-9 leading-9 underline underline-offset-2"
		>
			Clear
		</a>
	</form>

	{#if data.events.length === 0}
		<p class="text-fg-muted mt-8">Nothing matches.</p>
	{:else}
		<div class="mt-6 overflow-x-auto">
			<table class="w-full text-left">
				<thead class="text-fg-muted text-meta border-border border-b">
					<tr>
						<th class="py-2 font-normal">At (UTC)</th>
						<th class="py-2 font-normal">Actor</th>
						<th class="py-2 font-normal">IP</th>
						<th class="py-2 font-normal">Action</th>
						<th class="py-2 font-normal">Community</th>
						<th class="py-2 font-normal">What changed</th>
					</tr>
				</thead>
				<tbody>
					{#each data.events as event (event.id)}
						<tr class="border-border/60 border-b align-top">
							<td class="py-2 whitespace-nowrap" data-tabular>{stamp(event.at)}</td>
							<td class="text-fg-secondary py-2">{event.actorEmail ?? 'system'}</td>
							<td class="text-fg-secondary py-2" data-tabular>{event.ip ?? '—'}</td>
							<td class="py-2 whitespace-nowrap">{event.action}</td>
							<td class="text-fg-secondary py-2">{event.communityName ?? '—'}</td>
							<td class="py-2">
								{#each event.changes as change (change.field)}
									<div class="text-meta">{change.field}: {change.from} → {change.to}</div>
								{/each}
								{#each event.notes as note (note.key)}
									<div class="text-fg-muted text-meta">{note.key}: {note.value}</div>
								{/each}
								{#if event.changes.length === 0 && event.notes.length === 0}
									<span class="text-fg-muted">—</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="text-fg-muted text-meta mt-3">
			Showing the most recent {data.events.length}. Retention is 400 days.
		</p>
	{/if}
</main>
