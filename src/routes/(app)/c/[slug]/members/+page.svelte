<script lang="ts">
	import { useTime } from '$lib/time/use-time';
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import * as m from '$lib/paraglide/messages';
	import { INVITE_BATCH_MAX } from '$lib/shared/addresses';
	import type { PageData } from './$types';
	import IconCopy from '~icons/tabler/copy';
	import IconLink from '~icons/tabler/link';
	import IconLinkOff from '~icons/tabler/link-off';
	import IconMailForward from '~icons/tabler/mail-forward';
	import IconRefresh from '~icons/tabler/refresh';
	import IconUserCheck from '~icons/tabler/user-check';
	import IconUserCog from '~icons/tabler/user-cog';
	import IconUserMinus from '~icons/tabler/user-minus';
	import IconUserX from '~icons/tabler/user-x';
	import IconX from '~icons/tabler/x';

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
	const time = useTime();
	const day = (ms: number) => time.date(ms);

	/** What became of each pasted address, worded once. */
	const OUTCOME: Record<string, (limit: number) => string> = {
		invited: () => m.members_invite_outcome_invited(),
		mail_failed: () => m.members_invite_outcome_mail_failed(),
		already_member: () => m.members_invite_outcome_already_member(),
		not_an_address: () => m.members_invite_outcome_not_an_address(),
		limited: (limit) => m.members_invite_outcome_limited({ limit })
	};

	/**
	 * Copying needs a script; the link itself does not. Without one, the field is
	 * there to select, and the button is not offered.
	 */
	let hydrated = $state(false);
	onMount(() => (hydrated = true));
	let copied = $state(false);
	const copy = async () => {
		if (!data.joinLink) return;
		await navigator.clipboard?.writeText(data.joinLink);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	};
	const fieldClass =
		'border-border bg-raised text-fg w-full rounded-(--radius-control) border px-2 py-1.5';
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

	{#if data.can.invite && data.requests.length > 0}
		<!--
			First, because these people are waiting at the door. Only those whose
			address is proven are here; the service leaves the rest out.
		-->
		<section class="mt-8" aria-labelledby="requests">
			<h2 id="requests" class="text-section font-medium">{m.members_requests_heading()}</h2>
			<p class="text-fg-secondary mt-1">{m.members_requests_intro()}</p>
			<ul class="mt-3 flex flex-col gap-3">
				{#each data.requests as request (request.id)}
					<li class="border-border bg-surface rounded-(--radius-card) border p-4">
						<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
							<span class="text-fg font-medium">{request.name}</span>
							<span class="text-fg-secondary text-meta break-all">{request.email}</span>
							<span class="text-fg-muted text-meta"
								>{m.members_requests_asked_on({ date: day(request.askedAt) })}</span
							>
						</div>
						<div class="mt-3 flex flex-wrap gap-2">
							<form method="POST" action="?/admit" use:enhance>
								<input type="hidden" name="id" value={request.id} />
								<Button
									type="submit"
									variant="primary"
									class="min-h-11"
									size="sm"
									icon={IconUserCheck}
									aria-label={m.members_admit_label({ person: request.name })}
									>{m.members_admit()}</Button
								>
							</form>
							<form method="POST" action="?/decline" use:enhance>
								<input type="hidden" name="id" value={request.id} />
								<Button
									type="submit"
									variant="danger"
									class="min-h-11"
									size="sm"
									icon={IconUserX}
									aria-label={m.members_decline_label({ person: request.name })}
									>{m.members_decline()}</Button
								>
							</form>
						</div>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if form?.admitted}
		<p role="status" class="text-fg-secondary mt-4">
			{m.members_admitted({ person: form.admitted })}
		</p>
	{/if}
	{#if form?.alreadyMember}
		<p role="status" class="text-fg-secondary mt-4">
			{m.members_admit_already({ person: form.alreadyMember })}
		</p>
	{/if}
	{#if form?.declined}
		<p role="status" class="text-fg-secondary mt-4">{m.members_declined()}</p>
	{/if}
	{#if form?.requestGone}
		<p role="alert" class="text-attention mt-4">{m.members_request_gone()}</p>
	{/if}

	{#if data.can.invite}
		<section class="mt-8" aria-labelledby="bring-in">
			<h2 id="bring-in" class="text-section font-medium">{m.members_bring_in_heading()}</h2>
			<div class="mt-3 grid gap-4 lg:grid-cols-2">
				<div class="border-border bg-surface rounded-(--radius-card) border p-4">
					<h3 class="text-fg font-medium">{m.members_invite_heading()}</h3>
					<p class="text-fg-secondary text-meta mt-1">
						{m.members_invite_intro({ max: INVITE_BATCH_MAX })}
					</p>
					<form method="POST" action="?/invite" use:enhance class="mt-3 flex flex-col gap-3">
						<label for="invite-addresses" class="text-fg font-medium"
							>{m.members_invite_addresses_label()}</label
						>
						<textarea
							id="invite-addresses"
							name="addresses"
							rows="4"
							required
							autocomplete="off"
							class={fieldClass}
							value={form?.step === 'invite' && form.error ? (form.addresses ?? '') : ''}
						></textarea>
						<label for="invite-role" class="text-fg font-medium"
							>{m.members_invite_role_label()}</label
						>
						<select id="invite-role" name="role" class="{fieldClass} h-11 sm:w-56">
							{#each ROLES as role (role)}
								<option value={role}>{ROLE_LABELS[role]()}</option>
							{/each}
						</select>
						<div>
							<Button type="submit" variant="primary" icon={IconMailForward}
								>{m.members_invite_send()}</Button
							>
						</div>
					</form>
					{#if form?.step === 'invite' && form.error}
						<p role="alert" class="text-attention mt-3">{form.error}</p>
					{/if}
					{#if form?.step === 'invite' && form.results}
						<section class="mt-4" aria-labelledby="invite-results">
							<h4 id="invite-results" class="text-fg font-medium">
								{m.members_invite_results_heading()}
							</h4>
							<ul role="status" class="mt-2 flex flex-col gap-1">
								{#each form.results as result (result.address)}
									<li class="text-meta flex flex-wrap gap-x-2">
										<span class="text-fg break-all">{result.address}</span>
										<span
											class={result.outcome === 'invited' ? 'text-fg-secondary' : 'text-attention'}
											>— {OUTCOME[result.outcome]?.(form.limit ?? 0) ?? result.outcome}</span
										>
									</li>
								{/each}
							</ul>
						</section>
					{/if}
				</div>

				<div class="border-border bg-surface rounded-(--radius-card) border p-4">
					<h3 class="text-fg font-medium">{m.members_link_heading()}</h3>
					<p class="text-fg-secondary text-meta mt-1">{m.members_link_intro()}</p>
					{#if data.joinLink}
						<label for="join-link" class="text-fg mt-3 block font-medium"
							>{m.members_link_label()}</label
						>
						<div class="mt-1 flex flex-wrap gap-2">
							<input
								id="join-link"
								type="text"
								readonly
								value={data.joinLink}
								class="{fieldClass} min-w-0 flex-1 font-mono text-meta"
								onfocus={(event) => event.currentTarget.select()}
							/>
							{#if hydrated}
								<Button type="button" icon={IconCopy} onclick={copy}
									>{copied ? m.members_link_copied() : m.members_link_copy()}</Button
								>
							{/if}
						</div>
						<p class="text-fg-muted text-meta mt-2">{m.members_link_replace_hint()}</p>
						<div class="mt-3 flex flex-wrap gap-2">
							<form method="POST" action="?/linkReplace" use:enhance>
								<Button type="submit" class="min-h-11" size="sm" icon={IconRefresh}
									>{m.members_link_replace()}</Button
								>
							</form>
							<form method="POST" action="?/linkOff" use:enhance>
								<Button type="submit" variant="danger" class="min-h-11" size="sm" icon={IconLinkOff}
									>{m.members_link_turn_off()}</Button
								>
							</form>
						</div>
					{:else}
						<p class="text-fg-muted text-meta mt-3">{m.members_link_none()}</p>
						<form method="POST" action="?/linkOn" use:enhance class="mt-3">
							<Button type="submit" variant="primary" icon={IconLink}
								>{m.members_link_turn_on()}</Button
							>
						</form>
					{/if}
					{#if form?.link}
						<p role="status" class="text-fg-secondary text-meta mt-3">
							{form.link === 'on'
								? m.members_link_on_done()
								: form.link === 'replaced'
									? m.members_link_replaced()
									: m.members_link_off_done()}
						</p>
					{/if}
				</div>
			</div>
		</section>
	{/if}

	{#if data.can.manage}
		<section class="mt-8" aria-labelledby="pending">
			<h2 id="pending" class="text-section font-medium">{m.members_pending_heading()}</h2>
			{#if form?.resent}
				<p role="status" class="text-fg-secondary mt-2">{m.members_resent()}</p>
			{/if}
			{#if form?.resendFailed}
				<p role="alert" class="text-attention mt-2">{m.members_resend_failed()}</p>
			{/if}
			{#if form?.withdrawn}
				<p role="status" class="text-fg-secondary mt-2">{m.members_withdrawn()}</p>
			{/if}
			{#if data.invitations.length === 0}
				<p class="text-fg-muted text-meta mt-2">{m.members_pending_none()}</p>
			{:else}
				<ul class="mt-3 flex flex-col gap-2">
					{#each data.invitations as invite (invite.id)}
						<li class="border-border flex flex-wrap items-center gap-x-3 gap-y-2 border-b pb-2">
							<span class="text-fg break-all">{invite.email}</span>
							<span class="text-fg-secondary text-meta">{ROLE_LABELS[invite.role]()}</span>
							<span class="text-fg-muted text-meta"
								>{m.members_pending_sent_on({ date: day(invite.sentAt) })}</span
							>
							{#if invite.expired}
								<span
									class="border-border-strong text-fg-secondary text-meta rounded-full border px-2 py-0.5 leading-none"
									>{m.members_pending_expired()}</span
								>
							{/if}
							<span class="flex flex-wrap gap-2 sm:ml-auto">
								<form method="POST" action="?/resend" use:enhance>
									<input type="hidden" name="id" value={invite.id} />
									<Button
										type="submit"
										class="min-h-11"
										size="sm"
										icon={IconMailForward}
										aria-label={m.members_resend_label({ email: invite.email })}
										>{m.members_resend()}</Button
									>
								</form>
								<form method="POST" action="?/withdraw" use:enhance>
									<input type="hidden" name="id" value={invite.id} />
									<Button
										type="submit"
										variant="ghost"
										class="min-h-11"
										size="sm"
										icon={IconX}
										aria-label={m.members_withdraw_label({ email: invite.email })}
										>{m.members_withdraw()}</Button
									>
								</form>
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}

	<h2 class="text-section mt-10 font-medium">{m.members_list_heading()}</h2>
	<ul class="mt-3 flex flex-col gap-3">
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
