<script lang="ts" module>
	export type TourNav = 'path' | 'discussions' | 'definitions' | 'decisions' | 'documents';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/components/ui/cn.js';
	import * as m from '$lib/paraglide/messages';
	import { demo } from '../demo.js';

	/**
	 * A browser window with Compass in it, drawn in the app's own dark tokens so
	 * the miniature looks like the product it advertises.
	 *
	 * The sidebar needs the room of a desktop; below that the screens have the
	 * whole window. A container query rather than a media query, because what
	 * matters is how wide the window is, not the page.
	 */
	let { nav, readiness, children }: { nav: TourNav; readiness: number; children: Snippet } =
		$props();

	const items = $derived([
		{ key: 'path', label: m.nav_path() },
		{ key: 'discussions', label: m.nav_discussions(), count: 3 },
		{ key: 'definitions', label: m.landing_tour_nav_definitions() },
		{ key: 'decisions', label: m.nav_decisions() },
		{ key: 'documents', label: m.nav_documents() },
		{ key: 'glossary', label: m.nav_glossary() }
	]);
</script>

<div
	class="bg-bg border-border-strong/60 text-fg @container flex flex-col overflow-hidden rounded-[14px] border text-left text-[13px] shadow-[0_40px_80px_-30px_rgb(0_0_0/0.6)]"
>
	<div
		class="border-border bg-surface/60 flex h-9.5 flex-none items-center gap-1.75 border-b px-3.5"
	>
		<span class="bg-border-strong size-2.5 rounded-full"></span>
		<span class="bg-border-strong size-2.5 rounded-full"></span>
		<span class="bg-border-strong size-2.5 rounded-full"></span>
		<span class="font-code text-fg-muted flex-1 truncate text-center text-[11px]"
			>{demo.address}</span
		>
		<span class="w-11"></span>
	</div>
	<div class="flex min-h-0 flex-1">
		<div
			class="bg-surface border-border hidden w-49 flex-none flex-col border-r px-2.5 py-3.5 @4xl:flex"
		>
			<div class="flex items-center gap-2.25 px-1.5 pb-3.5">
				<span
					class="bg-accent-deep text-mint flex size-6 items-center justify-center rounded-md text-[10px] font-semibold"
					>{demo.initials}</span
				>
				<span class="font-semibold">{demo.community}</span>
			</div>
			<ul class="flex flex-col gap-0.5">
				{#each items as item (item.key)}
					<li
						class={cn(
							'flex rounded-md px-2.5 py-1.75 transition-colors duration-300',
							item.key === nav ? 'bg-raised text-fg' : 'text-fg-secondary'
						)}
					>
						{item.label}
						{#if item.count}
							<span
								class="bg-attention-subtle text-attention-fg ml-auto rounded-full px-1.5 text-[10.5px]"
								>{item.count}</span
							>
						{/if}
					</li>
				{/each}
			</ul>
			<div class="flex-1"></div>
			<div class="border-border flex flex-col gap-1.75 border-t px-1.5 pt-3 pb-0.5">
				<div class="flex justify-between text-xs">
					<span class="text-fg-secondary">{m.landing_tour_readiness()}</span>
					<span class="tabular-nums">{readiness}%</span>
				</div>
				<div class="bg-border h-1 overflow-hidden rounded-sm">
					<div
						class="bg-accent-fg h-full transition-[width] duration-1000"
						style:width="{readiness}%"
					></div>
				</div>
			</div>
		</div>
		<div class="grid min-w-0 flex-1 @4xl:min-h-[580px]">
			{@render children()}
		</div>
	</div>
</div>
