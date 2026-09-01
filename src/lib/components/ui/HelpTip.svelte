<script lang="ts">
	import { Popover } from 'bits-ui';
	import { resolve } from '$app/paths';
	import { HELP, type HelpId } from '$lib/help/registry';
	import { cn } from './cn.js';

	/**
	 * docs/02-component-guidelines.md §5a. Takes an id, never inline prose, so the
	 * same term is explained the same way everywhere.
	 *
	 * A button, not a hover: the whole app works on a phone (§7), where hover does
	 * not exist. Bits UI owns focus handling and dismissal.
	 */
	type Props = { id: HelpId; class?: string };

	let { id, class: className = '' }: Props = $props();
	const entry = $derived(HELP[id]);
</script>

{#if entry}
	<Popover.Root>
		<Popover.Trigger
			class={cn(
				'text-fg-muted hover:text-fg-secondary inline-flex h-4 w-4 shrink-0 cursor-pointer',
				'items-center justify-center rounded-full border border-current text-[10px] leading-none',
				className
			)}
			aria-label="What is {entry.title}?"
		>
			?
		</Popover.Trigger>
		<Popover.Portal>
			<Popover.Content
				class="border-border bg-raised text-body z-50 max-w-xs rounded-[--radius-card] border p-3 shadow-lg"
				sideOffset={6}
			>
				<p class="text-fg font-medium">{entry.title}</p>
				<p class="text-fg-secondary mt-1.5">{entry.what}</p>
				<p class="text-fg-muted mt-1.5">{entry.why}</p>
				{#if entry.link}
					<!-- Help links point at in-app reference pages; resolve() keeps them base-path safe. -->
					<a
						class="text-accent-fg mt-2 inline-block underline underline-offset-2"
						href={resolve(entry.link.href as Parameters<typeof resolve>[0])}
					>
						{entry.link.label}
					</a>
				{/if}
			</Popover.Content>
		</Popover.Portal>
	</Popover.Root>
{/if}
