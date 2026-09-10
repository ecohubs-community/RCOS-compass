<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { links } from '$lib/links';
	import IconCircleCheck from '~icons/tabler/circle-check';
	import IconCircleDashed from '~icons/tabler/circle-dashed';
	import IconProgress from '~icons/tabler/progress';
	import IconWorld from '~icons/tabler/world';

	let { data } = $props();

	const slug = $derived(data.community.slug);

	/**
	 * Three states, and no fourth. An artifact is finished, started, or not — a
	 * percentage per artifact would invite reading 80% as nearly compliant, and
	 * compliance does not work that way (`services/claim.ts`).
	 */
	const state = (artifact: { complete: boolean; answered: number }) =>
		artifact.complete ? 'complete' : artifact.answered > 0 ? 'in_progress' : 'not_started';

	const STATE_LABELS = {
		complete: m.artifacts_status_complete,
		in_progress: m.artifacts_status_in_progress,
		not_started: m.artifacts_status_not_started
	};

	const STATE_ICONS = {
		complete: IconCircleCheck,
		in_progress: IconProgress,
		not_started: IconCircleDashed
	};

	const STATE_CLASSES = {
		complete: 'bg-accent-subtle text-accent-fg border-transparent',
		in_progress: 'bg-attention-subtle text-attention border-transparent',
		not_started: 'bg-fg-muted/12 text-fg-secondary border-transparent'
	};
</script>

<svelte:head><title>{m.artifacts_title()} · {data.community.name}</title></svelte:head>

<main class="mx-auto w-full max-w-6xl px-6 py-8">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div class="min-w-0">
			<h1 class="text-page font-medium">{m.artifacts_title()}</h1>
			<p class="text-fg-secondary mt-2 max-w-2xl">{m.artifacts_intro()}</p>
		</div>
		<div class="flex flex-none flex-wrap gap-2">
			<a
				href={links.publishing(slug)}
				class="border-border hover:border-border-strong text-fg rounded-(--radius-control) border px-2.5 py-1"
				>{m.artifacts_public_index()}</a
			>
			<a
				href={links.audit(slug)}
				class="border-border hover:border-border-strong text-fg rounded-(--radius-control) border px-2.5 py-1"
				>{m.artifacts_self_audit()}</a
			>
		</div>
	</div>

	{#if !data.counts}
		<p class="text-fg-secondary mt-8">{m.artifacts_none()}</p>
	{:else}
		<dl class="mt-6 flex flex-wrap gap-x-8 gap-y-3">
			<div>
				<dt class="text-fg-muted text-meta">{m.artifacts_title()}</dt>
				<dd class="text-title" data-tabular>
					{m.artifacts_complete_of({ complete: data.counts.complete, total: data.counts.total })}
				</dd>
			</div>
			<div>
				<dt class="text-fg-muted text-meta">{m.artifacts_status_not_started()}</dt>
				<dd class="text-title" data-tabular>
					{m.artifacts_not_started_count({ count: data.counts.notStarted })}
				</dd>
			</div>
			<div>
				<dt class="text-fg-muted text-meta">{m.artifacts_public()}</dt>
				<dd class="text-title" data-tabular>
					{m.artifacts_published_count({ count: data.counts.published })}
				</dd>
			</div>
		</dl>

		{#if data.counts.mandatoryIncomplete > 0}
			<!--
				The sentence the mockup puts under the counts, and the one thing this
				page must not let a reader misunderstand: there is no partial credit.
			-->
			<p
				class="border-attention/40 bg-attention-subtle text-fg mt-5 rounded-(--radius-card) border p-3"
			>
				{m.artifacts_compliance_note({ community: data.community.name })}
			</p>
		{/if}

		<ul class="border-border mt-6 divide-y divide-(--color-border) rounded-(--radius-card) border">
			{#each data.artifacts as artifact (artifact.key)}
				{@const key = state(artifact)}
				{@const StateIcon = STATE_ICONS[key]}
				<li class="flex flex-wrap items-start gap-x-4 gap-y-2 p-4">
					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-2">
							<h2 class="text-fg font-medium">{artifact.title}</h2>
							<span
								class="text-meta inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 leading-none {STATE_CLASSES[
									key
								]}"
							>
								<StateIcon class="h-3 w-3 flex-none" aria-hidden="true" />
								{STATE_LABELS[key]()}
							</span>
							{#if artifact.mandatory}
								<span class="border-border text-fg-muted text-meta rounded-full border px-2 py-0.5"
									>{m.artifacts_required()}</span
								>
							{/if}
							{#if artifact.published}
								<span
									class="text-fg-muted text-meta inline-flex items-center gap-1"
									title={m.artifacts_public()}
								>
									<IconWorld class="h-3.5 w-3.5 flex-none" aria-hidden="true" />
									{m.artifacts_public()}
								</span>
							{/if}
						</div>
						<p class="text-fg-muted text-meta mt-1">
							{#if artifact.layer !== null}{m.artifacts_layer({ layer: artifact.layer })} ·
							{/if}{m.artifacts_sections({
								answered: artifact.answered,
								authored: artifact.authored
							})}
						</p>
						{#if artifact.summary}
							<p class="text-fg-secondary mt-1">{artifact.summary}</p>
						{/if}
					</div>

					<!--
						eslint-disable svelte/no-navigation-without-resolve --
						`links.standard` is a `resolve`; the rule reads the attribute rather
						than the value, so it cannot see through an appended fragment.
					-->
					<a
						href={`${links.standard(slug)}#${artifact.key}`}
						class="border-border hover:border-border-strong text-fg flex-none rounded-(--radius-control) border px-2.5 py-1"
					>
						{artifact.answered > 0 ? m.artifacts_open() : m.artifacts_start()}
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				</li>
			{/each}
		</ul>
	{/if}
</main>
