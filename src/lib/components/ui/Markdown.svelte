<script lang="ts">
	import type { BlockNode } from '$lib/shared/markdown';
	import InlineText from './InlineText.svelte';
	import Self from './Markdown.svelte';

	/**
	 * Governance text, as a tree rather than as a string.
	 *
	 * The parser (`$lib/server/markdown`) produces only the node types below, so
	 * this component is the allowlist made visible: an HTML block, an image, an
	 * `onerror` attribute or a `javascript:` URL never became a node, and so
	 * cannot be rendered. Nothing here takes an HTML string.
	 */
	let { blocks, class: className = '' }: { blocks: BlockNode[]; class?: string } = $props();
</script>

<div class={className}>
	{#each blocks as node, i (i)}
		{#if node.type === 'paragraph'}
			<p class="mt-3 first:mt-0"><InlineText nodes={node.children} /></p>
		{:else if node.type === 'heading'}
			{#if node.level === 2}
				<h2 class="text-section mt-5 font-medium first:mt-0">
					<InlineText nodes={node.children} />
				</h2>
			{:else if node.level === 3}
				<h3 class="text-title mt-4 font-medium first:mt-0"><InlineText nodes={node.children} /></h3>
			{:else}
				<h4 class="mt-4 font-medium first:mt-0"><InlineText nodes={node.children} /></h4>
			{/if}
		{:else if node.type === 'list'}
			{#if node.ordered}
				<ol class="mt-3 list-decimal pl-5">
					{#each node.items as item, n (n)}
						<li class="mt-1"><Self blocks={item} /></li>
					{/each}
				</ol>
			{:else}
				<ul class="mt-3 list-disc pl-5">
					{#each node.items as item, n (n)}
						<li class="mt-1"><Self blocks={item} /></li>
					{/each}
				</ul>
			{/if}
		{:else if node.type === 'quote'}
			<blockquote class="border-border text-fg-secondary mt-3 border-l-2 pl-3">
				<Self blocks={node.children} />
			</blockquote>
		{:else if node.type === 'code'}
			<pre
				class="border-border bg-raised mt-3 overflow-x-auto rounded-(--radius-control) border p-3"><code
					>{node.value}</code
				></pre>
		{:else if node.type === 'rule'}
			<hr class="border-border mt-4" />
		{/if}
	{/each}
</div>
