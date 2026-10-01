<script lang="ts" module>
	/** The shape `guideFor` returns, restated: components never import `$lib/server`. */
	export type GuideData = {
		prompts: string[];
		examples: { text: string; source: 'compass' | 'template' }[];
	};
</script>

<script lang="ts">
	import * as m from '$lib/paraglide/messages';

	/**
	 * What a proposal for this question should cover, and what an answer can
	 * look like.
	 *
	 * Compass's guidance, not the standard's text — which is why it is its own
	 * component beside `<Requirement>`, and why every example is called an
	 * example, never a recommendation, and says where it came from. The product
	 * never decides for a community; an example presented as the answer would.
	 *
	 * Sub-questions are prompts for one discussion, never Path items of their
	 * own: the section stays one decision.
	 */
	type Props = { guide: GuideData; headingLevel?: 'h2' | 'h3' };

	let { guide, headingLevel = 'h3' }: Props = $props();
</script>

{#if guide.prompts.length > 0}
	<p class="text-fg-secondary">{m.guide_prompts_intro()}</p>
	<ul class="text-fg mt-2 flex list-disc flex-col gap-1.5 pl-5">
		{#each guide.prompts as prompt (prompt)}
			<li>{prompt}</li>
		{/each}
	</ul>
{/if}

{#if guide.examples.length > 0}
	<details class="mt-3">
		<summary class="min-h-11 cursor-pointer py-2 font-medium">
			<svelte:element this={headingLevel} class="inline">{m.guide_examples()}</svelte:element>
		</summary>
		<p class="text-fg-muted text-meta">{m.guide_examples_note()}</p>
		<ul class="mt-2 flex flex-col gap-3">
			{#each guide.examples as example (example.text)}
				<li class="border-border border-l-2 pl-3">
					<p class="text-fg-muted text-meta">
						{example.source === 'compass' ? m.guide_source_compass() : m.guide_source_template()}
					</p>
					<p class="text-fg-secondary mt-0.5">{example.text}</p>
				</li>
			{/each}
		</ul>
	</details>
{/if}
