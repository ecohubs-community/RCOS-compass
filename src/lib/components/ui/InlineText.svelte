<script lang="ts">
	import type { InlineNode } from '$lib/shared/markdown';
	import Self from './InlineText.svelte';
	import { mentionLabels } from './mentions.js';

	let { nodes }: { nodes: InlineNode[] } = $props();
	const labelOf = mentionLabels();
</script>

<!--
	Every branch renders through ordinary templating, so Svelte escapes the text.
	There is deliberately no `{@html}` here or anywhere below it: a payload has
	nowhere to go rather than being removed by a sanitiser that has to be right.
-->
{#each nodes as node, i (i)}
	{#if node.type === 'text'}{node.value}{:else if node.type === 'strong'}<strong
			><Self nodes={node.children} /></strong
		>{:else if node.type === 'em'}<em><Self nodes={node.children} /></em
		>{:else if node.type === 'code'}<code class="bg-raised rounded px-1 py-0.5">{node.value}</code
		>{:else if node.type === 'link'}<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- a member wrote this href; it is not a route id. isSafeHref has already refused anything but http, https, mailto and a same-site path --><a
			href={node.href}
			class="text-accent-fg underline underline-offset-2"
			rel="noreferrer nofollow"><Self nodes={node.children} /></a
		>{:else if node.type === 'break'}<br />{:else if node.type === 'mention'}{@const label =
			labelOf(node.seq)}{#if label}<span class="text-accent-fg font-medium" data-mention={node.raw}
				>@{label}</span
			>{:else}{node.raw}{/if}{/if}
{/each}
