<script lang="ts">
	import { resolve } from '$app/paths';
	import Footer from '$lib/components/legal/Footer.svelte';

	let { data } = $props();
</script>

<svelte:head><title>RCOS Compass</title></svelte:head>

<div class="flex min-h-screen flex-col">
	<main class="mx-auto w-full max-w-2xl flex-1 px-4 py-16 sm:px-6 sm:py-24">
		<h1 class="text-page font-medium">RCOS Compass</h1>
		<p class="text-fg-secondary mt-3 max-w-prose">
			The decisions your community still has to make under the RCOS governance standard, in the
			order that makes sense for you — and a record of what you decided, who decided it, and why. It
			never decides for you.
		</p>

		{#if !data.signedIn}
			<p class="mt-8">
				<a
					href={resolve('/(account)/sign-in')}
					class="bg-accent-solid hover:bg-accent-solid-hover inline-flex items-center rounded-(--radius-control) px-4 py-2 font-medium text-white"
					>Sign in</a
				>
			</p>
			<p class="text-fg-muted text-meta mt-4">
				Accounts come with an invitation from a community’s steward.
			</p>
		{:else if data.communities.length === 0}
			<p class="border-border bg-surface mt-8 rounded-(--radius-card) border p-4">
				You are not a member of any community yet. Ask a steward to invite you — the link in their
				email brings you straight in.
			</p>
			<!-- Somewhere to go from a page with nowhere else to go. -->
			<form method="POST" action="/sign-out" class="mt-4">
				<button
					type="submit"
					class="text-accent-fg text-meta cursor-pointer underline underline-offset-2"
					>Sign out</button
				>
			</form>
		{:else}
			<h2 class="text-section mt-10 font-medium">Your communities</h2>
			<ul class="border-border bg-surface mt-3 divide-y rounded-(--radius-card) border">
				{#each data.communities as community (community.slug)}
					<li class="border-border">
						<a
							href={resolve('/(app)/c/[slug]', { slug: community.slug })}
							class="hover:bg-raised flex items-center justify-between gap-3 px-4 py-3"
						>
							<span class="font-medium">{community.name}</span>
							{#if community.suspended}
								<span class="text-fg-muted text-meta">Suspended · read only</span>
							{/if}
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</main>

	<Footer />
</div>
