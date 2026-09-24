<script lang="ts">
	import { DropdownMenu } from 'bits-ui';
	import { onMount } from 'svelte';
	import * as m from '$lib/paraglide/messages';
	import IconDots from '~icons/tabler/dots';
	import IconLogout from '~icons/tabler/logout';
	import IconSettings from '~icons/tabler/settings';

	/**
	 * The ⋯ beside the reader's name: Preferences, and Sign out.
	 *
	 * Until the page has hydrated both are simply there, a link and a one-button
	 * form, the way the bell is a plain link — a menu that needs JavaScript to
	 * open would leave somebody without it unable to sign out. After mount they
	 * fold into the menu.
	 *
	 * Sign out stays a POST either way: the menu item submits the same form the
	 * no-JavaScript button is.
	 */
	type Props = {
		/** Where Preferences goes: the account panel of the settings in scope. */
		preferences: string;
		/** Which way the menu opens. The sidebar's row sits at the bottom of the screen. */
		side?: 'top' | 'bottom';
	};

	let { preferences, side = 'top' }: Props = $props();

	let mounted = $state(false);
	let signOut = $state<HTMLFormElement>();
	onMount(() => {
		mounted = true;
	});

	const item =
		'text-fg-secondary data-highlighted:bg-raised data-highlighted:text-fg flex cursor-pointer items-center gap-2 rounded-(--radius-control) px-2.5 py-1.5 outline-none';
</script>

<div class="flex flex-none items-center gap-3">
	{#if !mounted}
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the caller passes a resolved href -->
		<a href={preferences} class="text-fg-muted hover:text-fg text-meta">{m.nav_preferences()}</a>
	{/if}
	<!-- The form the menu item submits, and the whole of Sign out without JavaScript. -->
	<form method="POST" action="/sign-out" bind:this={signOut} class:hidden={mounted}>
		<button
			type="submit"
			class="text-fg-muted hover:text-fg text-meta flex cursor-pointer items-center gap-1.5"
		>
			<IconLogout class="h-3.5 w-3.5" aria-hidden="true" />
			{m.nav_sign_out()}
		</button>
	</form>

	{#if mounted}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger
				class="text-fg-muted hover:text-fg hover:bg-raised data-[state=open]:bg-raised data-[state=open]:text-fg inline-flex h-7 w-7 flex-none cursor-pointer items-center justify-center rounded-(--radius-control)"
				aria-label={m.nav_account_menu()}
			>
				<IconDots class="h-4 w-4" aria-hidden="true" />
			</DropdownMenu.Trigger>
			<DropdownMenu.Portal>
				<DropdownMenu.Content
					{side}
					align="end"
					sideOffset={6}
					class="border-border bg-surface z-50 min-w-44 rounded-(--radius-card) border p-1 shadow-lg"
				>
					<DropdownMenu.Item class={item}>
						{#snippet child({ props })}
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved by the caller -->
							<a {...props} href={preferences}>
								<IconSettings class="h-4 w-4 flex-none" aria-hidden="true" />
								{m.nav_preferences()}
							</a>
						{/snippet}
					</DropdownMenu.Item>
					<DropdownMenu.Item class={item} onSelect={() => signOut?.requestSubmit()}>
						<IconLogout class="h-4 w-4 flex-none" aria-hidden="true" />
						{m.nav_sign_out()}
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Portal>
		</DropdownMenu.Root>
	{/if}
</div>
