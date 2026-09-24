<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import AccountMenu from '$lib/components/AccountMenu.svelte';

	let { data, children } = $props();

	const NAV = [
		{ href: resolve('/(admin)/admin/communities'), label: 'Communities' },
		{ href: resolve('/(admin)/admin/audit'), label: 'Audit log' },
		{ href: resolve('/(admin)/admin/status'), label: 'Status' }
	];

	let current = $derived(page.url.pathname);
</script>

<div class="border-border flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3">
	<div class="flex items-center gap-5">
		<span class="text-title font-medium">Instance administration</span>
		<nav aria-label="Administration">
			<ul class="flex items-center gap-1">
				{#each NAV as item (item.href)}
					<li>
						<a
							href={item.href}
							aria-current={current.startsWith(new URL(item.href, page.url).pathname)
								? 'page'
								: undefined}
							class="rounded-(--radius-control) px-2.5 py-1 aria-[current=page]:bg-raised aria-[current=page]:text-fg text-fg-secondary hover:text-fg"
						>
							{item.label}
						</a>
					</li>
				{/each}
			</ul>
		</nav>
	</div>
	<div class="flex items-center gap-4">
		<span class="text-fg-muted text-meta">{data.adminEmail}</span>
		<AccountMenu preferences={resolve('/(admin)/admin/settings/account')} side="bottom" />
	</div>
</div>

{@render children()}
