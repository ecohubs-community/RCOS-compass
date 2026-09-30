<script lang="ts">
	import { cn } from '$lib/components/ui/cn.js';
	import * as m from '$lib/paraglide/messages';

	/**
	 * Marks something on the roadmap that is not in the product yet. The page
	 * says what Compass does today; anything planned says so, in words.
	 */
	let { tone = 'light' }: { tone?: 'light' | 'dark' } = $props();
</script>

<span
	class={cn(
		'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
		tone === 'light'
			? 'border-site-amber-bar/50 bg-site-amber-tint text-site-amber'
			: 'border-forest-sand/40 text-forest-sand'
	)}>{m.landing_later()}</span
>
