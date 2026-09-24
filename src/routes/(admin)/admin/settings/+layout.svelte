<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import IconClock from '~icons/tabler/clock';
	import IconShieldLock from '~icons/tabler/shield-lock';
	import IconUserCircle from '~icons/tabler/user-circle';

	let { children } = $props();

	/**
	 * The admin's own panels — the same three a member finds under a community's
	 * settings, for an admin who may belong to no community. Two-factor is also
	 * where an admin without a second factor is sent; see `ENROLMENT_PATH`.
	 */
	const panels = [
		{ href: resolve('/(admin)/admin/settings/account'), label: 'Account', icon: IconUserCircle },
		{
			href: resolve('/(admin)/admin/settings/two-factor'),
			label: 'Two-factor authentication',
			icon: IconShieldLock
		},
		{ href: resolve('/(admin)/admin/settings/time-zone'), label: 'Time zone', icon: IconClock }
	];
</script>

<div class="flex min-w-0 flex-1 flex-col lg:flex-row">
	<nav
		class="border-border flex-none border-b p-2 lg:w-56 lg:border-r lg:border-b-0"
		aria-label="Your account"
	>
		<h2 class="text-fg-muted mb-2 hidden px-2.5 text-[10.5px] tracking-wider uppercase lg:block">
			Your account
		</h2>
		<ul class="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-x-visible">
			{#each panels as panel (panel.href)}
				{@const PanelIcon = panel.icon}
				<li>
					<a
						href={panel.href}
						aria-current={new URL(panel.href, page.url).pathname === page.url.pathname
							? 'page'
							: undefined}
						class="aria-[current=page]:bg-raised aria-[current=page]:text-fg text-fg-secondary hover:text-fg flex items-center gap-2 rounded-(--radius-control) px-2.5 py-1.5 whitespace-nowrap lg:whitespace-normal"
					>
						<PanelIcon class="h-4 w-4 flex-none" aria-hidden="true" />
						{panel.label}
					</a>
				</li>
			{/each}
		</ul>
	</nav>

	<div class="min-w-0 flex-1">
		{@render children()}
	</div>
</div>
