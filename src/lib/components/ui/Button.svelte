<script lang="ts" module>
	export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
	export type ButtonSize = 'sm' | 'md';

	const VARIANTS: Record<ButtonVariant, string> = {
		primary: 'bg-accent-solid text-white hover:bg-accent-solid-hover border-transparent',
		secondary: 'bg-raised text-fg border-border hover:border-border-strong',
		ghost: 'bg-transparent text-fg-secondary border-transparent hover:text-fg hover:bg-raised',
		danger: 'bg-transparent text-danger border-danger/40 hover:bg-danger/10'
	};

	const SIZES: Record<ButtonSize, string> = {
		sm: 'h-7 px-2.5 text-meta gap-1.5',
		md: 'h-8 px-3 text-body gap-2'
	};
</script>

<script lang="ts">
	import type { Component } from 'svelte';
	import type { HTMLButtonAttributes, SvelteHTMLElements } from 'svelte/elements';
	import { cn } from './cn.js';

	type Props = HTMLButtonAttributes & {
		variant?: ButtonVariant;
		size?: ButtonSize;
		/** Shows a busy state and blocks repeat submits. */
		pending?: boolean;
		/**
		 * A tabler glyph before the label — decorative, never the meaning.
		 *
		 * It occupies the same slot as the busy spinner, so a button does not
		 * change width the moment it is pressed.
		 */
		icon?: Component<SvelteHTMLElements['svg']>;
		class?: string;
		children: import('svelte').Snippet;
	};

	let {
		variant = 'secondary',
		size = 'md',
		pending = false,
		icon: Icon = undefined,
		disabled = false,
		class: className = '',
		children,
		...rest
	}: Props = $props();
</script>

<button
	class={cn(
		'inline-flex cursor-pointer items-center justify-center rounded-(--radius-control) border font-medium',
		'transition-colors disabled:cursor-not-allowed disabled:opacity-50',
		VARIANTS[variant],
		SIZES[size],
		className
	)}
	disabled={disabled || pending}
	aria-busy={pending || undefined}
	{...rest}
>
	{#if pending}
		<!-- Never disable a control without saying why: guidelines §3. -->
		<span
			class="border-fg-muted border-t-fg h-3 w-3 animate-spin rounded-full border-[1.5px]"
			aria-hidden="true"
		></span>
	{:else if Icon}
		<Icon class="h-4 w-4 flex-none" aria-hidden="true" />
	{/if}
	{@render children()}
</button>
