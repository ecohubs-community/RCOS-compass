<script lang="ts">
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages';
	import { links } from '$lib/links';
	import IconAdjustments from '~icons/tabler/adjustments';
	import IconArrowsSort from '~icons/tabler/arrows-sort';
	import IconDownload from '~icons/tabler/download';
	import IconEyeOff from '~icons/tabler/eye-off';
	import IconGitBranch from '~icons/tabler/git-branch';
	import IconLanguage from '~icons/tabler/language';
	import IconSparkles from '~icons/tabler/sparkles';
	import IconWorld from '~icons/tabler/world';

	let { data, children } = $props();

	/**
	 * The settings panels, listed beside the one being edited.
	 *
	 * Inside the content area rather than in place of the sidebar: these eight
	 * screens were mixed into the Reference group, which grew to eleven entries
	 * and stopped being a list anybody read. Putting them here empties that group
	 * without taking the community's own nav away — a person changing a setting is
	 * usually on their way somewhere else.
	 *
	 * Members and Reports stay in the sidebar. They are things a community reads
	 * about itself, not switches it sets, and moving them would change their
	 * addresses for the sake of a menu.
	 */
	const slug = $derived(data.community.slug);

	const panels = $derived([
		{ href: links.interview(slug), label: m.nav_interview(), icon: IconAdjustments },
		{ href: links.pathSettings(slug), label: m.nav_path_settings(), icon: IconArrowsSort },
		{ href: links.language(slug), label: m.nav_language(), icon: IconLanguage },
		{ href: links.aiSettings(slug), label: m.nav_ai_settings(), icon: IconSparkles },
		{ href: links.transparency(slug), label: m.nav_transparency(), icon: IconEyeOff },
		{ href: links.publishing(slug), label: m.nav_publishing(), icon: IconWorld },
		{ href: links.exportSettings(slug), label: m.nav_export(), icon: IconDownload },
		{ href: links.mirror(slug), label: m.nav_mirror(), icon: IconGitBranch }
	]);
</script>

<div class="flex min-w-0 flex-1 flex-col lg:flex-row">
	<!--
		eslint-disable svelte/no-navigation-without-resolve --
		Every href is `links.*`, which is `resolve`; the rule reads the attribute
		rather than where the value came from.
	-->
	<!--
		Below 1024px this becomes a strip above the panel, the same way the
		community sidebar does — a phone still has to reach every setting.
	-->
	<nav
		class="border-border flex-none border-b p-3 lg:w-56 lg:border-r lg:border-b-0"
		aria-label={m.settings_nav_label()}
	>
		<h2 class="text-fg-muted mb-2 hidden px-2.5 text-[10.5px] tracking-wider uppercase lg:block">
			{m.nav_settings()}
		</h2>
		<ul class="flex gap-1 overflow-x-auto lg:flex-col">
			{#each panels as panel (panel.href)}
				{@const PanelIcon = panel.icon}
				<li>
					<a
						href={panel.href}
						aria-current={page.url.pathname === panel.href ? 'page' : undefined}
						class="aria-[current=page]:bg-raised aria-[current=page]:text-fg text-fg-secondary hover:text-fg flex items-center gap-2 rounded-(--radius-control) px-2.5 py-1.5 whitespace-nowrap"
					>
						<PanelIcon class="h-4 w-4 flex-none" aria-hidden="true" />
						{panel.label}
					</a>
				</li>
			{/each}
		</ul>
	</nav>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->

	<div class="min-w-0 flex-1">
		{@render children()}
	</div>
</div>
