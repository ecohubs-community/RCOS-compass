<script lang="ts" module>
	export type PillVariant = 'primary' | 'secondary';
	export type PillSize = 'md' | 'lg';

	const VARIANTS: Record<PillVariant, string> = {
		primary: 'bg-site-green font-semibold text-white hover:bg-site-green-deep',
		secondary:
			'border border-site-line-strong bg-site-card font-medium text-site-ink hover:border-site-ink'
	};

	const SIZES: Record<PillSize, string> = {
		md: 'min-h-11 px-4 text-[15px]',
		lg: 'min-h-13 px-6 text-base'
	};
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes } from 'svelte/elements';
	import { cn } from '$lib/components/ui/cn.js';

	/**
	 * The site's rounded link-button. Always a link: everything the landing page
	 * offers is a place to go, never an action taken on this page.
	 */
	let {
		variant = 'primary',
		size = 'md',
		class: className,
		children,
		...rest
	}: HTMLAnchorAttributes & {
		variant?: PillVariant;
		size?: PillSize;
		class?: string;
		children: Snippet;
	} = $props();
</script>

<a
	class={cn(
		'inline-flex items-center justify-center rounded-full whitespace-nowrap transition-colors',
		VARIANTS[variant],
		SIZES[size],
		className
	)}
	{...rest}
>
	{@render children()}
</a>
