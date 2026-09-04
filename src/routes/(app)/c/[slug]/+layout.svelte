<script lang="ts">
	import { page } from '$app/state';
	import { links } from '$lib/links';

	let { data, children } = $props();

	/**
	 * The shell. Design: `design_files/platform/Sidebar.dc.html` and `TopBar.dc.html`.
	 *
	 * The nav is grouped rather than flat, because the flat list in the first
	 * mockup made "Definitions" and "Decisions" look like the same kind of thing
	 * (UI spec §4.0). The groups say what each one is *for*: what we are working
	 * on, what we have agreed, and what we are answering to.
	 */
	const slug = $derived(data.community.slug);

	type NavItem = { href: string; label: string; exact?: boolean; badge?: number };
	type NavGroup = { label: string | null; items: NavItem[] };

	const groups = $derived<NavGroup[]>([
		{ label: null, items: [{ href: links.dashboard(slug), label: 'Dashboard', exact: true }] },
		{
			label: 'Working on',
			items: [
				{ href: links.discussions(slug), label: 'Discussions', badge: data.unread || undefined },
				{ href: links.standard(slug), label: 'Definitions' }
			]
		},
		{
			label: "What we've agreed",
			items: [{ href: links.decisions(slug), label: 'Decisions' }]
		},
		{
			label: 'Reference',
			items: [{ href: links.standard(slug), label: 'Standard' }]
		}
	]);

	const isCurrent = (href: string, exact = false) =>
		exact ? page.url.pathname === href : page.url.pathname.startsWith(href);

	const initials = $derived(
		data.community.name
			.split(/\s+/)
			.slice(0, 2)
			.map((word: string) => word[0]?.toUpperCase() ?? '')
			.join('')
	);
</script>

<div class="flex min-h-screen flex-col lg:flex-row">
	<!--
		Below 1024px the sidebar becomes a horizontal strip rather than disappearing
		behind a button: mobile is a supported surface (docs/02 §7), and a community
		on a phone still needs to reach the register.
	-->
	<aside
		class="border-border bg-surface flex flex-none flex-col border-b lg:h-screen lg:w-60 lg:border-r lg:border-b-0"
	>
		<div class="border-border flex items-center gap-2 border-b px-3 py-3">
			<span
				class="bg-accent-deep text-accent-fg text-meta flex h-6 w-6 flex-none items-center justify-center rounded-md font-semibold"
				aria-hidden="true">{initials}</span
			>
			<span class="text-fg truncate font-medium">{data.community.name}</span>
		</div>

		<!--
			eslint-disable svelte/no-navigation-without-resolve --
			Every href in `groups` is built by `links.*`, which is `resolve`. The rule
			checks the attribute rather than the value's provenance, so it cannot see
			that through the array.
		-->
		<nav class="flex-1 overflow-x-auto p-2" aria-label="Community">
			<ul class="flex gap-1 lg:flex-col">
				{#each groups as group (group.label ?? 'top')}
					{#if group.label}
						<li
							class="text-fg-muted mt-3 hidden px-2.5 text-[10.5px] tracking-wider uppercase lg:block"
						>
							{group.label}
						</li>
					{/if}
					{#each group.items as item (item.href)}
						<li>
							<a
								href={item.href}
								aria-current={isCurrent(item.href, item.exact) ? 'page' : undefined}
								class="aria-[current=page]:bg-raised aria-[current=page]:text-fg text-fg-secondary hover:text-fg flex items-center gap-2 rounded-(--radius-control) px-2.5 py-1.5 whitespace-nowrap"
							>
								{item.label}
								{#if item.badge}
									<span
										class="text-attention bg-attention-subtle text-meta ml-auto rounded-full px-1.5"
										data-tabular>{item.badge}</span
									>
								{/if}
							</a>
						</li>
					{/each}
				{/each}
			</ul>
		</nav>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->

		{#if data.readiness}
			<div class="border-border hidden flex-none flex-col gap-1.5 border-t px-3 py-3 lg:flex">
				<div class="flex items-baseline justify-between">
					<span class="text-fg-secondary text-meta">Readiness</span>
					<span class="text-fg text-meta" data-tabular>{data.readiness.percent}%</span>
				</div>
				<div
					class="bg-border h-1 overflow-hidden rounded-full"
					role="progressbar"
					aria-valuenow={data.readiness.percent}
					aria-valuemin="0"
					aria-valuemax="100"
					aria-label="Readiness"
				>
					<div class="bg-accent h-full" style:width="{data.readiness.percent}%"></div>
				</div>
				<p class="text-fg-muted text-meta">
					{data.artifacts.complete} of {data.artifacts.total} artifacts complete
				</p>
			</div>
		{/if}

		<div class="border-border flex flex-none items-center gap-2 border-t px-3 py-2.5">
			<span class="text-fg-secondary text-meta truncate">{data.membership.role}</span>
			<form method="POST" action="/sign-out" class="ml-auto">
				<button
					type="submit"
					class="text-fg-muted hover:text-fg text-meta cursor-pointer underline underline-offset-2"
					>Sign out</button
				>
			</form>
		</div>
	</aside>

	<div class="flex min-w-0 flex-1 flex-col">
		{#if data.readOnly}
			<p
				role="status"
				class="border-attention/40 bg-attention-subtle text-fg text-meta border-b px-6 py-2"
			>
				{data.readOnly}
			</p>
		{/if}
		{@render children()}
	</div>
</div>
