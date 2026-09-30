<script lang="ts" module>
	/**
	 * The shape `services/requirement.ts` returns, restated here because a
	 * component never imports from `$lib/server`.
	 */
	export type RequirementData = {
		standard: string;
		title: string;
		artifactTitle: string | null;
		clauses: {
			key: string;
			ref: string;
			owned: boolean;
			normativity: string;
			body: string;
		}[];
		whyItMatters: string | null;
		whatToDefine: string | null;
		notHere: { sectionKey: string; title: string; question: string; refs: string[] }[];
	};
</script>

<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import ClauseRef from '$lib/components/ui/ClauseRef.svelte';
	import HelpTip from '$lib/components/ui/HelpTip.svelte';

	/**
	 * "The requirement" — design artboard 03's left column, and the sheet a
	 * discussion opens from a clause reference. One component for both, so the
	 * thread and the definition cannot quote the standard differently.
	 *
	 * Every word in it is the standard's: its clause text, its "why it matters"
	 * and "what to define", and — under "What NOT to define here" — the sections
	 * the standard itself assigns the neighbouring work to. Nothing is written by
	 * the tool.
	 */
	type Props = {
		requirement: RequirementData;
		/** The clause the reader opened this from, marked by more than colour. */
		selectedRef?: string | null;
		/** `id` prefix, so two instances on one page do not share anchors. */
		idPrefix?: string;
		headingLevel?: 'h2' | 'h3';
	};

	let {
		requirement,
		selectedRef = null,
		idPrefix = 'requirement',
		headingLevel = 'h2'
	}: Props = $props();

	const ownsNone = $derived(requirement.clauses.every((clause) => !clause.owned));
</script>

<div class="flex items-center gap-2">
	<svelte:element this={headingLevel} class="text-title font-medium"
		>{m.requirement_heading()}</svelte:element
	>
	<HelpTip id="requirement" />
</div>
<p class="text-fg-muted text-meta mt-1">
	{requirement.title}{#if requirement.artifactTitle}
		<span aria-hidden="true" class="px-1">·</span>{requirement.artifactTitle}{/if}
</p>

{#if ownsNone && requirement.clauses.length > 0}
	<p class="text-fg-secondary text-meta mt-3">{m.requirement_owned_none()}</p>
{/if}

{#each requirement.clauses as clause (clause.key)}
	{@const selected = clause.ref === selectedRef}
	<blockquote
		id="{idPrefix}-{clause.ref}"
		class="mt-3 scroll-mt-4 border-l-2 pl-3 {selected
			? 'border-accent bg-accent-subtle -ml-px py-1'
			: 'border-border'}"
		aria-current={selected ? 'true' : undefined}
	>
		<!-- Secondary, not muted, on the marked clause: muted on the accent wash is under 4.5:1. -->
		<p
			class="text-meta flex flex-wrap items-center gap-x-2 font-mono {selected
				? 'text-fg-secondary'
				: 'text-fg-muted'}"
		>
			<span
				>{requirement.standard} · <ClauseRef
					ref={clause.ref}
					related={!clause.owned}
					{selected}
				/></span
			>
			<span class="border-border rounded-full border px-1.5 text-[11px] leading-4"
				>{clause.normativity}</span
			>
			{#if !clause.owned}<span>{m.clause_refs_related()}</span>{/if}
			{#if selected}<span class="text-accent-fg">· {m.requirement_opened()}</span>{/if}
		</p>
		<p class="text-fg-secondary mt-1 whitespace-pre-line">{clause.body}</p>
	</blockquote>
{/each}

{#if requirement.whyItMatters}
	<details class="mt-4">
		<summary class="min-h-11 cursor-pointer py-2 font-medium">{m.requirement_why()}</summary>
		<p class="text-fg-secondary mt-1">{requirement.whyItMatters}</p>
	</details>
{/if}
{#if requirement.whatToDefine}
	<details class="mt-1">
		<summary class="min-h-11 cursor-pointer py-2 font-medium">{m.requirement_what()}</summary>
		<p class="text-fg-secondary mt-1">{requirement.whatToDefine}</p>
	</details>
{/if}
{#if requirement.notHere.length > 0}
	<details class="mt-1">
		<summary class="min-h-11 cursor-pointer py-2 font-medium">{m.requirement_not_here()}</summary>
		<p class="text-fg-secondary mt-1">{m.requirement_not_here_intro()}</p>
		<ul class="mt-2 flex flex-col gap-2">
			{#each requirement.notHere as other (other.sectionKey)}
				<li class="text-fg-secondary">
					<span class="text-fg">{other.title}</span>
					{#each other.refs as ref (ref)}
						<span aria-hidden="true" class="px-1">·</span><ClauseRef {ref} />
					{/each}
					<span class="text-fg-muted text-meta block">{other.question}</span>
				</li>
			{/each}
		</ul>
	</details>
{/if}
