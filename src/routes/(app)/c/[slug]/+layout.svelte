<script lang="ts">
	import { page } from '$app/state';
	import Footer from '$lib/components/legal/Footer.svelte';
	import TopBar from '$lib/components/TopBar.svelte';
	import GlossaryPanel from '$lib/components/GlossaryPanel.svelte';
	import * as m from '$lib/paraglide/messages';
	import { links } from '$lib/links';
	import IconBook from '~icons/tabler/book';
	import IconClipboardCheck from '~icons/tabler/clipboard-check';
	import IconDiamond from '~icons/tabler/diamond';
	import IconFiles from '~icons/tabler/files';
	import IconGavel from '~icons/tabler/gavel';
	import IconLayoutDashboard from '~icons/tabler/layout-dashboard';
	import IconLogout from '~icons/tabler/logout';
	import IconMessageReport from '~icons/tabler/message-report';
	import IconMessages from '~icons/tabler/messages';
	import IconRoute from '~icons/tabler/route';
	import IconSettings from '~icons/tabler/settings';
	import IconUsers from '~icons/tabler/users';
	import IconVocabulary from '~icons/tabler/vocabulary';

	let { data, children } = $props();

	/**
	 * A page that manages its own height, rather than scrolling as one column.
	 *
	 * The discussion detail is two panes that scroll independently under a
	 * composer pinned to the bottom of one of them, which the shell's single
	 * scrolling box cannot express. A page asks for this by returning
	 * `fullHeight` from its load, so the next screen that needs it uses the same
	 * mechanism instead of inventing a second one — and the footer goes with it,
	 * because a footer below a pane that never ends is a footer nobody reaches.
	 */
	const fullHeight = $derived(page.data.fullHeight === true);

	/**
	 * The shell. Design: `design_files/platform/Sidebar.dc.html` and `TopBar.dc.html`.
	 *
	 * The nav is grouped rather than flat, because the flat list in the first
	 * mockup made "Definitions" and "Decisions" look like the same kind of thing
	 * (UI spec §4.0). The groups say what each one is *for*: what we are working
	 * on, what we have agreed, and what we are answering to.
	 */
	const slug = $derived(data.community.slug);

	type NavItem = {
		href: string;
		label: string;
		/** A tabler glyph, compiled in at build time — see vite.config.ts. */
		icon: typeof IconRoute;
		exact?: boolean;
		badge?: number;
	};
	/**
	 * `id` rather than keying on the label: two groups have no heading — the
	 * dashboard at the top and the pair at the bottom — and keying both on the
	 * same fallback string gave Svelte a duplicate key, which stops hydration
	 * dead and takes every form on the page with it.
	 */
	type NavGroup = { id: string; label: string | null; items: NavItem[] };

	const groups = $derived<NavGroup[]>([
		{
			id: 'top',
			label: null,
			items: [
				{
					href: links.dashboard(slug),
					label: m.nav_dashboard(),
					icon: IconLayoutDashboard,
					exact: true
				}
			]
		},
		{
			id: 'working-on',
			label: m.nav_group_working_on(),
			items: [
				{ href: links.path(slug), label: m.nav_path(), icon: IconRoute },
				{
					href: links.discussions(slug),
					label: m.nav_discussions(),
					icon: IconMessages,
					badge: data.unread || undefined
				},
				{ href: links.documents(slug), label: m.nav_documents(), icon: IconFiles }
			]
		},
		{
			id: 'agreed',
			label: m.nav_group_agreed(),
			items: [
				{ href: links.decisions(slug), label: m.nav_decisions(), icon: IconGavel },
				{ href: links.artifacts(slug), label: m.nav_artifacts(), icon: IconDiamond },
				{ href: links.audit(slug), label: m.nav_audit(), icon: IconClipboardCheck }
			]
		},
		{
			/**
			 * Three entries, not eleven.
			 *
			 * The eight settings panels used to sit here, which made a group called
			 * "Reference" the longest list on the screen and the least like one —
			 * they live under Settings now, in a list beside the panel they change.
			 * "Definitions" and "Standard" remain one entry for the older reason:
			 * both pointed at this page, so both lit up at once and a screen reader
			 * announced two destinations that were the same screen.
			 */
			id: 'reference',
			label: m.nav_group_reference(),
			items: [
				{ href: links.standard(slug), label: m.nav_standard(), icon: IconBook },
				{ href: links.glossary(slug), label: m.nav_glossary(), icon: IconVocabulary },
				{ href: links.members(slug), label: m.nav_members(), icon: IconUsers }
			]
		},
		{
			id: 'community',
			label: null,
			items: [
				{ href: links.settings(slug), label: m.nav_settings(), icon: IconSettings },
				{ href: links.feedback(slug), label: m.nav_feedback(), icon: IconMessageReport }
			]
		}
	]);

	/**
	 * The path an href points at, whatever shape it arrives in.
	 *
	 * `resolve` returns links *relative* to the current page — `../../c/x/path`
	 * from a settings screen — because `paths.relative` defaults to true and that
	 * is what makes a build portable. Comparing one of those to
	 * `page.url.pathname` is comparing a relative path to an absolute one, so it
	 * was false on every item on every screen: the sidebar has never marked the
	 * page you are on, in dev or in production, and neither the a11y suite nor
	 * anybody reading the code noticed, because the code reads as though it does.
	 */
	const pathOf = (href: string) => new URL(href, page.url).pathname;

	const isCurrent = (href: string, exact = false) =>
		exact ? pathOf(href) === page.url.pathname : page.url.pathname.startsWith(pathOf(href));

	/**
	 * Where the reader is, in the nav's own words, for the breadcrumb.
	 *
	 * Longest matching prefix wins, so `/settings/language` says Settings rather
	 * than stopping at the dashboard. The three additions are the screens the nav
	 * does not list but does own: a definition belongs under the standard, a
	 * decision under the register, and search has been a field rather than a
	 * destination since the box moved into the shell.
	 */
	const crumbs = $derived([
		...groups.flatMap((group) =>
			group.items.map((item) => ({ href: item.href, label: item.label }))
		),
		{ href: links.search(slug), label: m.nav_search() },
		{ href: `${links.dashboard(slug)}/definitions`, label: m.nav_standard() },
		{ href: `${links.dashboard(slug)}/d`, label: m.nav_decisions() }
	]);

	const crumb = $derived(
		crumbs
			.map((entry) => ({ path: pathOf(entry.href), label: entry.label }))
			.filter((entry) => page.url.pathname.startsWith(entry.path))
			.sort((a, b) => b.path.length - a.path.length)[0]?.label ?? m.nav_dashboard()
	);

	/**
	 * The role in the community's own vocabulary, from the same map the member
	 * list uses — the raw column value is `steward`, and a sidebar that prints a
	 * database value is a sidebar that will print `member` in a German community.
	 */
	const ROLE_LABELS: Record<string, () => string> = {
		member: m.members_role_member,
		steward: m.members_role_steward
	};

	const personInitials = $derived(
		String(data.membership.name ?? '')
			.split(/\s+/)
			.slice(0, 2)
			.map((word: string) => word[0]?.toUpperCase() ?? '')
			.join('')
	);

	const initials = $derived(
		data.community.name
			.split(/\s+/)
			.slice(0, 2)
			.map((word: string) => word[0]?.toUpperCase() ?? '')
			.join('')
	);
</script>

<!--
	The sidebar and the bar stay; the page scrolls under them.
	
	One document scrolling took the nav off the top of the screen exactly when a
	long list made it most useful. Below 1024px the sidebar is a horizontal strip
	and the document scrolls normally, because a phone has no room to give a
	column of navigation permanently.
-->
<div class="flex min-h-screen flex-col lg:h-screen lg:min-h-0 lg:flex-row lg:overflow-hidden">
	<!--
		Below 1024px the sidebar becomes a horizontal strip rather than disappearing
		behind a button: mobile is a supported surface (docs/02 §7), and a community
		on a phone still needs to reach the register.
	-->
	<aside
		class="border-border bg-surface flex flex-none flex-col border-b lg:h-screen lg:w-64 lg:border-r lg:border-b-0"
	>
		<div class="border-border flex items-center gap-2 border-b px-3 py-3">
			<!--
				`text-fg` rather than the mockup's `#10B981` on `#064E3B`: that pairing
				is 2.6:1 and fails AA, which the a11y suite caught. Same finding as
				the accent button in review pass #32 — the mockups should adopt it.
			-->
			<span
				class="bg-accent-deep text-fg text-meta flex h-6 w-6 flex-none items-center justify-center rounded-md font-semibold"
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
		<!--
		`overflow-x-auto` is the horizontal strip's, below 1024px. Left on at every
		width it gave the column a scrollbar a few pixels wide, because the longest
		label is a hair wider than the column — a scroll nobody wants and everybody
		notices.
	-->
		<nav
			class="flex-1 overflow-x-auto p-2 lg:overflow-x-visible lg:overflow-y-auto"
			aria-label="Community"
		>
			<ul class="flex gap-1 lg:flex-col">
				{#each groups as group (group.id)}
					{#if group.label}
						<li
							class="text-fg-muted mt-3 hidden px-2.5 text-[10.5px] tracking-wider uppercase lg:block"
						>
							{group.label}
						</li>
					{/if}
					{#each group.items as item (item.href)}
						{@const ItemIcon = item.icon}
						<li>
							<a
								href={item.href}
								aria-current={isCurrent(item.href, item.exact) ? 'page' : undefined}
								class="aria-[current=page]:bg-raised aria-[current=page]:text-fg text-fg-secondary hover:text-fg flex items-center gap-2 rounded-(--radius-control) px-2.5 py-1.5 whitespace-nowrap lg:whitespace-normal"
							>
								<ItemIcon class="h-4 w-4 flex-none" aria-hidden="true" />
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

		<!--
			The reader, named. The mockup's sidebar ends with an avatar, a name and a
			role; this ended with a role and nothing else, so the one row on the
			screen that answers "who am I signed in as" did not answer it.
		-->
		<div class="border-border flex flex-none items-center gap-2 border-t px-3 py-2.5">
			<span
				class="bg-raised text-fg-secondary text-meta flex h-5.5 w-5.5 flex-none items-center justify-center rounded-full font-semibold"
				aria-hidden="true">{personInitials}</span
			>
			<span class="min-w-0 flex-1">
				<span class="text-fg block truncate">{data.membership.name}</span>
				<span class="text-fg-muted text-meta block truncate"
					>{(ROLE_LABELS[data.membership.role] ?? (() => data.membership.role))()}</span
				>
			</span>
			<form method="POST" action="/sign-out">
				<button
					type="submit"
					class="text-fg-muted hover:text-fg text-meta flex cursor-pointer items-center gap-1.5"
				>
					<IconLogout class="h-3.5 w-3.5" aria-hidden="true" />
					{m.nav_sign_out()}
				</button>
			</form>
		</div>
	</aside>

	<div
		class="flex min-w-0 flex-1 flex-col {fullHeight ? 'lg:overflow-hidden' : 'lg:overflow-y-auto'}"
	>
		<TopBar
			community={data.community.name}
			{slug}
			{crumb}
			sub={typeof page.data.subCrumb === 'string' ? page.data.subCrumb : null}
		/>
		{#if data.readOnly}
			<p
				role="status"
				class="border-attention/40 bg-attention-subtle text-fg text-meta border-b px-6 py-2"
			>
				{data.readOnly}
			</p>
		{/if}
		{@render children()}
		{#if !fullHeight}
			<!--
				`mt-auto` rather than a wrapper around the children: on a short page the
				footer was sitting halfway up the screen, under two lines of content,
				which reads as the end of the page arriving early. An auto margin in a
				flex column takes the slack without changing any page's own box.
			-->
			<div class="mt-auto">
				<Footer {slug} />
			</div>
		{/if}
	</div>
</div>

<!-- Mounted once for the whole community: a term can be hit on any screen. -->
<GlossaryPanel {slug} />
