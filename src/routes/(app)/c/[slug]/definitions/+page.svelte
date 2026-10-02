<script lang="ts">
	import { enhance } from '$app/forms';
	import * as m from '$lib/paraglide/messages';
	import { links } from '$lib/links';
	import { useTime } from '$lib/time/use-time';
	import StatusChip, { STATUS_LABELS } from '$lib/components/ui/StatusChip.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import IconPlus from '~icons/tabler/plus';

	let { data, form } = $props();
	const slug = $derived(data.community.slug);
	const time = useTime();
	const filtered = $derived(
		data.filters.status !== null ||
			data.filters.artifact !== null ||
			data.filters.attention ||
			data.filters.provisional
	);
	const field = 'border-border bg-raised text-fg min-h-11 rounded-(--radius-control) border px-2.5';
</script>

<svelte:head><title>{m.defs_title()} · {data.community.name}</title></svelte:head>

<main class="mx-auto w-full max-w-6xl px-6 py-8">
	<div class="flex flex-wrap items-baseline gap-x-4 gap-y-2">
		<h1 class="text-page font-medium">{m.defs_title()}</h1>
		<span class="text-fg-muted text-meta" data-tabular
			>{m.defs_count({ shown: data.rows.length, total: data.total })}</span
		>
	</div>
	<p class="text-fg-secondary mt-2 max-w-3xl">{m.defs_intro()}</p>

	{#if data.can.draft && data.choices}
		<!--
			A local definition: the community's own rule. A <details>, so it opens
			with no JavaScript, and opens again by itself after a refusal so the
			reason is next to what was typed.
		-->
		<details
			class="border-border bg-surface mt-6 rounded-(--radius-card) border"
			open={data.newOpen || form?.step === 'create'}
		>
			<summary class="text-fg flex min-h-11 cursor-pointer items-center gap-2 px-4 font-medium"
				><IconPlus class="h-4 w-4 flex-none" aria-hidden="true" />{m.defs_new()}</summary
			>
			<form method="POST" action="?/create" class="flex flex-col gap-4 px-4 pb-4" use:enhance>
				<p class="text-fg-muted text-meta">{m.defs_new_intro()}</p>
				<TextField id="new-title" name="title" label={m.defs_new_title()} required />
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="flex flex-col gap-1.5">
						<label for="new-layer" class="text-fg font-medium">{m.defs_new_layer()}</label>
						<select id="new-layer" name="layer" required class={field}>
							<option value="">{m.defs_new_layer_choose()}</option>
							{#each data.choices.layers as layer (layer)}
								<option value={layer}>{m.defs_new_layer_option({ n: layer })}</option>
							{/each}
						</select>
					</div>
					<div class="flex flex-col gap-1.5">
						<label for="new-artifact" class="text-fg font-medium">{m.defs_new_artifact()}</label>
						<select id="new-artifact" name="artifact" class={field}>
							{#each data.choices.artifacts as artifact (artifact.key)}
								<option value={artifact.key}>{artifact.title}</option>
							{/each}
						</select>
					</div>
				</div>
				<div class="flex flex-col gap-1.5">
					<label for="new-purpose" class="text-fg font-medium">{m.defs_new_purpose()}</label>
					<textarea
						id="new-purpose"
						name="purpose"
						rows="3"
						class="border-border bg-raised text-fg rounded-(--radius-control) border p-2.5"
					></textarea>
				</div>
				<TextField
					id="new-touches"
					name="touches"
					label={m.defs_new_touches()}
					hint={m.defs_new_touches_hint()}
				/>
				<label class="flex min-h-11 items-start gap-2">
					<input
						type="checkbox"
						name="standardShouldRequireThis"
						class="mt-1"
						aria-describedby="new-require-hint"
					/>
					<span>
						<span class="text-fg">{m.defs_new_require()}</span>
						<span id="new-require-hint" class="text-fg-muted text-meta block"
							>{m.defs_new_require_hint()}</span
						>
					</span>
				</label>
				<Button type="submit" variant="primary" class="self-start">{m.defs_new_submit()}</Button>
				{#if form?.step === 'create' && form?.error}
					<p role="alert" class="text-danger">{form.error}</p>
				{/if}
			</form>
		</details>
	{/if}

	<!-- A GET form: the filters are the URL, so they work with no JavaScript. -->
	<form method="GET" class="mt-6 flex flex-wrap items-end gap-3" aria-label={m.defs_filters()}>
		<div class="flex flex-col gap-1.5">
			<label for="filter-status" class="text-fg-secondary text-meta">{m.defs_filter_status()}</label
			>
			<select id="filter-status" name="status" class={field}>
				<option value="">{m.defs_filter_any()}</option>
				{#each data.statuses as status (status)}
					<option value={status} selected={data.filters.status === status}
						>{STATUS_LABELS[status]}</option
					>
				{/each}
			</select>
		</div>
		<div class="flex flex-col gap-1.5">
			<label for="filter-artifact" class="text-fg-secondary text-meta"
				>{m.defs_filter_artifact()}</label
			>
			<select id="filter-artifact" name="artifact" class="{field} max-w-64">
				<option value="">{m.defs_filter_any()}</option>
				{#each data.artifacts as artifact (artifact.key)}
					<option value={artifact.key} selected={data.filters.artifact === artifact.key}
						>{artifact.title}</option
					>
				{/each}
			</select>
		</div>
		<label class="flex min-h-11 items-center gap-2">
			<input type="checkbox" name="attention" value="1" checked={data.filters.attention} />
			<span class="text-fg">{m.defs_filter_attention()}</span>
		</label>
		<label class="flex min-h-11 items-center gap-2">
			<input type="checkbox" name="provisional" value="1" checked={data.filters.provisional} />
			<span class="text-fg">{m.defs_filter_provisional()}</span>
		</label>
		<Button type="submit" variant="secondary">{m.defs_filter_apply()}</Button>
		{#if filtered}
			<a
				href={links.definitions(slug)}
				class="text-fg-secondary hover:text-fg inline-flex min-h-11 items-center underline underline-offset-2"
				>{m.defs_filter_clear()}</a
			>
		{/if}
	</form>

	{#if data.total === 0}
		<p class="text-fg-secondary mt-8">{m.defs_none()}</p>
	{:else if data.rows.length === 0}
		<p class="text-fg-secondary mt-8">{m.defs_empty()}</p>
	{:else}
		<!--
			One list, drawn as a table from 768px and as cards below it (docs/02 §7):
			the same rows, so a phone loses nothing but the columns.
		-->
		<ul class="mt-6 flex flex-col gap-2 md:hidden">
			{#each data.rows as row (row.id)}
				<li class="border-border bg-surface rounded-(--radius-card) border p-3">
					<a
						href={links.definition(slug, row.id)}
						class="text-fg font-medium underline underline-offset-2">{row.title}</a
					>
					<p class="mt-1 flex flex-wrap items-center gap-2">
						<StatusChip status={row.status} />
						{#if row.provisional}<StatusChip modifier="provisional" />{/if}
						{#if row.scope === 'local'}<StatusChip modifier="local" />{/if}
						{#if row.rediscussed}<span class="text-fg-muted text-meta"
								>{m.defs_under_discussion()}</span
							>{/if}
						{#if row.attention}<span class="text-attention-fg text-meta font-medium"
								>{m.defs_attention_badge()}</span
							>{/if}
					</p>
					<p class="text-fg-muted text-meta mt-1">
						{#if row.artifact}{row.artifact.title}{/if}{#if row.refs.length > 0}
							· §{row.refs[0]}{/if}
						· {row.version === null ? m.defs_not_adopted() : `v${row.version}`}
					</p>
					<p class="text-fg-muted text-meta mt-0.5" data-tabular>
						{row.lastChangedBy
							? m.defs_changed_by({ when: time.date(row.lastChangedAt), who: row.lastChangedBy })
							: time.date(row.lastChangedAt)}
					</p>
				</li>
			{/each}
		</ul>

		<table class="mt-6 hidden w-full border-collapse md:table">
			<thead>
				<tr class="border-border text-fg-muted text-meta border-b text-left">
					<th scope="col" class="py-2 pr-3 font-medium">{m.defs_col_definition()}</th>
					<th scope="col" class="py-2 pr-3 font-medium">{m.defs_col_artifact()}</th>
					<th scope="col" class="py-2 pr-3 font-medium">{m.defs_col_version()}</th>
					<th scope="col" class="py-2 pr-3 font-medium">{m.defs_col_status()}</th>
					<th scope="col" class="py-2 font-medium">{m.defs_col_changed()}</th>
				</tr>
			</thead>
			<tbody>
				{#each data.rows as row (row.id)}
					<tr class="border-border border-b align-top">
						<td class="py-2.5 pr-3">
							<a
								href={links.definition(slug, row.id)}
								class="text-fg font-medium underline underline-offset-2">{row.title}</a
							>
							{#if row.refs.length > 0}
								<span class="text-fg-muted text-meta font-mono whitespace-nowrap"
									>§{row.refs[0]}</span
								>
							{/if}
							{#if row.attention}<span class="text-attention-fg text-meta block font-medium"
									>{m.defs_attention_badge()}</span
								>{/if}
						</td>
						<td class="text-fg-secondary text-meta py-2.5 pr-3">{row.artifact?.title ?? ''}</td>
						<td class="text-fg-secondary text-meta py-2.5 pr-3" data-tabular
							>{row.version === null ? m.defs_not_adopted() : `v${row.version}`}</td
						>
						<td class="py-2.5 pr-3">
							<span class="flex flex-wrap items-center gap-1.5">
								<StatusChip status={row.status} />
								{#if row.provisional}<StatusChip modifier="provisional" />{/if}
								{#if row.scope === 'local'}<StatusChip modifier="local" />{/if}
							</span>
							{#if row.rediscussed}<span class="text-fg-muted text-meta block"
									>{m.defs_under_discussion()}</span
								>{/if}
						</td>
						<td class="text-fg-muted text-meta py-2.5" data-tabular>
							{time.date(row.lastChangedAt)}
							{#if row.lastChangedBy}<span class="block">{row.lastChangedBy}</span>{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</main>
