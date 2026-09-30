<script lang="ts" module>
	export type SiteAccount = {
		email: string;
		communities: { slug: string; name: string; suspended: boolean }[];
	};
</script>

<script lang="ts">
	import { DropdownMenu } from 'bits-ui';
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { cn } from '$lib/components/ui/cn.js';
	import * as m from '$lib/paraglide/messages';
	import IconChevronDown from '~icons/tabler/chevron-down';
	import IconLogout from '~icons/tabler/logout';

	/**
	 * The signed-in person's menu on the landing page: who they are signed in
	 * as, the communities they belong to, and sign-out.
	 *
	 * The same pattern as the app's `AccountMenu`: until the page has hydrated it
	 * is a native disclosure, so somebody without JavaScript can still reach
	 * their communities and sign out; after mount it is a Bits UI menu, which
	 * owns focus and keyboard. Sign out is a POST either way — the menu item
	 * submits the same form.
	 */
	let { account }: { account: SiteAccount } = $props();

	let mounted = $state(false);
	let signOut = $state<HTMLFormElement>();
	onMount(() => {
		mounted = true;
	});

	const community = (slug: string) => resolve('/(app)/c/[slug]', { slug });

	const trigger =
		'border-site-line-strong bg-site-card text-site-ink hover:border-site-ink inline-flex min-h-11 max-w-60 cursor-pointer items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-[15px]';
	const panel =
		'border-site-line bg-site-card text-site-ink z-60 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border p-2 font-grotesk shadow-[0_24px_50px_-20px_rgb(20_30_25/0.35)]';
	const item =
		'data-highlighted:bg-site-green-tint hover:bg-site-green-tint flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 text-left text-[15px] outline-none';
</script>

{#snippet avatar()}
	<span
		class="bg-forest text-forest-fg flex size-8 flex-none items-center justify-center rounded-full text-sm font-semibold uppercase"
		aria-hidden="true">{account.email.slice(0, 1)}</span
	>
{/snippet}

{#snippet face()}
	{@render avatar()}
	<span class="sr-only">{m.landing_account_menu()}</span>
	<span class="hidden truncate sm:inline">{account.email}</span>
	<IconChevronDown class="text-site-muted size-4 flex-none" aria-hidden="true" />
{/snippet}

{#snippet signedInAs()}
	<p class="px-3 pt-2 pb-2.5">
		<span class="text-site-muted block text-xs">{m.landing_account_signed_in_as()}</span>
		<span class="block truncate font-semibold">{account.email}</span>
	</p>
{/snippet}

{#snippet suspended(isSuspended: boolean)}
	{#if isSuspended}
		<span class="text-site-muted ml-auto text-xs">{m.landing_account_suspended()}</span>
	{/if}
{/snippet}

<!-- The form the menu item submits, and the whole of Sign out without JavaScript. -->
<form method="POST" action="/sign-out" bind:this={signOut} class="hidden"></form>

{#if !mounted}
	<details class="relative">
		<summary class={cn(trigger, 'list-none [&::-webkit-details-marker]:hidden')}>
			{@render face()}
		</summary>
		<div class={cn(panel, 'absolute top-full right-0 mt-2')}>
			{@render signedInAs()}
			<div class="bg-site-line my-1 h-px"></div>
			<p class="text-site-muted px-3 pt-2 pb-1 text-xs">{m.landing_account_communities()}</p>
			{#if account.communities.length === 0}
				<p class="text-site-ink-2 px-3 py-2 text-sm">{m.landing_account_none()}</p>
			{:else}
				<ul>
					{#each account.communities as c (c.slug)}
						<li>
							<a href={community(c.slug)} class={item}>{c.name}{@render suspended(c.suspended)}</a>
						</li>
					{/each}
				</ul>
			{/if}
			<div class="bg-site-line my-1 h-px"></div>
			<form method="POST" action="/sign-out">
				<button type="submit" class={item}>
					<IconLogout class="size-4 flex-none" aria-hidden="true" />{m.nav_sign_out()}
				</button>
			</form>
		</div>
	</details>
{:else}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger class={cn(trigger, 'data-[state=open]:border-site-ink')}>
			{@render face()}
		</DropdownMenu.Trigger>
		<DropdownMenu.Portal>
			<DropdownMenu.Content align="end" sideOffset={8} class={panel}>
				{@render signedInAs()}
				<DropdownMenu.Separator class="bg-site-line my-1 h-px" />
				<DropdownMenu.Group>
					<DropdownMenu.GroupHeading class="text-site-muted px-3 pt-2 pb-1 text-xs">
						{m.landing_account_communities()}
					</DropdownMenu.GroupHeading>
					{#if account.communities.length === 0}
						<p class="text-site-ink-2 px-3 py-2 text-sm">{m.landing_account_none()}</p>
					{:else}
						{#each account.communities as c (c.slug)}
							<DropdownMenu.Item class={item}>
								{#snippet child({ props })}
									<a {...props} href={community(c.slug)}>{c.name}{@render suspended(c.suspended)}</a
									>
								{/snippet}
							</DropdownMenu.Item>
						{/each}
					{/if}
				</DropdownMenu.Group>
				<DropdownMenu.Separator class="bg-site-line my-1 h-px" />
				<DropdownMenu.Item class={item} onSelect={() => signOut?.requestSubmit()}>
					<IconLogout class="size-4 flex-none" aria-hidden="true" />{m.nav_sign_out()}
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Portal>
	</DropdownMenu.Root>
{/if}
