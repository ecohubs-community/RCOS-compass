<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import * as m from '$lib/paraglide/messages';
	import type { PageData } from './$types';
	import IconUserCog from '~icons/tabler/user-cog';
	import IconUserMinus from '~icons/tabler/user-minus';

	let { data, form } = $props();

	/**
	 * The two roles, named once, the way `StatusChip` names the statuses: a role
	 * spelled at a call site is a second copy of the vocabulary, and this screen
	 * would be where the two of them first disagreed. The type comes from the
	 * service's own row rather than from the schema, which a component may not
	 * reach into (guidelines §4).
	 */
	type Role = PageData['members'][number]['role'];

	const ROLE_LABELS: Record<Role, () => string> = {
		member: m.members_role_member,
		steward: m.members_role_steward
	};
	const ROLES: Role[] = ['member', 'steward'];

	// In the community's own language, like every other date on a member's
	// screen: the sentence around it is translated, and a date in another
	// convention inside a translated sentence reads as a bug.
	const day = (ms: number) =>
		new Date(ms).toLocaleDateString(data.community.locale, {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
</script>

<svelte:head><title>{m.members_title()} · {data.community.name}</title></svelte:head>

<main class="mx-auto w-full max-w-6xl px-6 py-8">
	<h1 class="text-page font-medium">{m.members_title()}</h1>
	<p class="text-fg-secondary mt-2">{m.members_intro()}</p>
	{#if !data.can.manage}
		<p class="text-fg-muted text-meta mt-2">{m.members_steward_only()}</p>
	{/if}

	{#if form?.error}
		<p role="alert" class="text-attention mt-4">{form.error}</p>
	{/if}
	{#if form?.saved}
		<p role="status" class="text-fg-secondary mt-4">{m.members_role_saved()}</p>
	{/if}
	{#if form?.ended}
		<p role="status" class="text-fg-secondary mt-4">{m.members_ended()}</p>
	{/if}

	<ul class="mt-6 flex flex-col gap-3">
		{#each data.members as member (member.membershipId)}
			<li class="border-border bg-surface rounded-(--radius-card) border p-4">
				<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
					<!--
						The name comes from `personLabel` on the server and is never
						assembled here: an erased member reads as `Former member (M-0142)`
						because the service said so, not because this screen remembered to
						ask.
					-->
					<span class="text-fg font-medium">{member.name}</span>
					<span class="text-fg-muted text-meta" data-tabular>{member.number}</span>
					<span class="text-fg-secondary text-meta">{ROLE_LABELS[member.role]()}</span>
					{#if member.isOwner}
						<span
							class="border-border-strong text-fg-secondary text-meta rounded-full border px-2 py-0.5 leading-none"
							>{m.members_owner()}</span
						>
					{/if}
					{#if member.membershipId === data.you}
						<span class="text-fg-muted text-meta">{m.members_you()}</span>
					{/if}
				</div>

				{#if data.can.manage}
					{#if member.isOwner}
						<!--
							Rather than a select that can only fail: `setMemberRole` refuses to
							demote the owner and `endMembership` refuses to remove them, and a
							control offering something the service will not do is a worse
							answer than the sentence explaining why.
						-->
						<p class="text-fg-muted text-meta mt-3">{m.members_owner_note()}</p>
					{:else if member.membershipId === data.you}
						<!--
							And the same for your own row. Both services refuse it — this is the
							explanation, not the enforcement.
						-->
						<p class="text-fg-muted text-meta mt-3">{m.members_you_note()}</p>
					{:else}
						<div class="mt-3 flex flex-wrap items-center gap-2">
							<form method="POST" action="?/role" use:enhance class="flex items-center gap-2">
								<input type="hidden" name="id" value={member.membershipId} />
								<!--
									Labelled with the person's name, not just "Role": twenty-seven
									selects all announcing "Role" tell a screen reader nothing about
									which one is about to change.
								-->
								<select
									name="role"
									aria-label={m.members_role_label({ person: member.name })}
									class="border-border bg-raised text-fg h-8 rounded-(--radius-control) border px-2"
								>
									{#each ROLES as role (role)}
										<option value={role} selected={role === member.role}
											>{ROLE_LABELS[role]()}</option
										>
									{/each}
								</select>
								<Button type="submit" size="sm" icon={IconUserCog}>{m.members_role_save()}</Button>
							</form>

							<form method="POST" action="?/end" use:enhance>
								<input type="hidden" name="id" value={member.membershipId} />
								<Button
									type="submit"
									variant="danger"
									size="sm"
									icon={IconUserMinus}
									aria-label={m.members_end_label({ person: member.name })}
									>{m.members_end()}</Button
								>
							</form>
						</div>
					{/if}
				{/if}
			</li>
		{/each}
	</ul>

	<section class="mt-10" aria-labelledby="former">
		<h2 id="former" class="text-section font-medium">{m.members_former_heading()}</h2>
		<p class="text-fg-secondary mt-1">{m.members_former_intro()}</p>

		{#if data.former.length === 0}
			<p class="text-fg-muted text-meta mt-3">{m.members_former_none()}</p>
		{:else}
			<ul class="mt-3 flex flex-col gap-1">
				{#each data.former as member (member.membershipId)}
					<li class="border-border/60 flex flex-wrap items-baseline gap-x-3 border-b pb-1">
						<span class="text-fg-secondary">{member.name}</span>
						<span class="text-fg-muted text-meta" data-tabular>{member.number}</span>
						{#if member.endedAt !== null}
							<span class="text-fg-muted text-meta"
								>{m.members_left_on({ date: day(member.endedAt) })}</span
							>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>
