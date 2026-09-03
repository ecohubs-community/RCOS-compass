<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Button from '$lib/components/ui/Button.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';

	let { data, form } = $props();

	let tenant = $derived(data.tenant);
	let mailFailed = $derived(page.url.searchParams.get('mail') === 'failed');
	/** Which panel a refusal belongs to, so an error appears where it happened. */
	const errorFor = (step: string) => (form?.step === step ? form.error : undefined);

	const dateOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
</script>

<svelte:head><title>{tenant.name} · RCOS Compass</title></svelte:head>

{#snippet panelError(step: string)}
	{#if errorFor(step)}
		<p
			role="alert"
			class="border-danger/40 bg-danger-subtle text-danger mt-3 rounded-(--radius-control) border px-3 py-2"
		>
			{errorFor(step)}
		</p>
	{/if}
{/snippet}

<main class="mx-auto max-w-3xl px-6 py-8">
	<p class="text-fg-muted text-meta">
		<a
			href={resolve('/(admin)/admin/communities')}
			class="hover:text-fg underline underline-offset-2">Communities</a
		>
		<span aria-hidden="true"> · </span>{tenant.slug}
	</p>
	<h1 class="text-page mt-1 font-medium">{tenant.name}</h1>

	{#if mailFailed}
		<p
			role="alert"
			class="border-attention/40 bg-attention-subtle text-fg mt-4 rounded-(--radius-control) border px-3 py-2"
		>
			The community was created, but the owner's invitation could not be emailed. Check
			<code>SMTP_URL</code>, then revoke and re-send the invitation.
		</p>
	{/if}

	{#if tenant.status === 'suspended'}
		<p
			class="border-attention/40 bg-attention-subtle text-fg mt-4 rounded-(--radius-control) border px-3 py-2"
		>
			Suspended. Members can read and export, and nothing has been deleted.
			{#if tenant.suspendedReason}<br />Reason given: {tenant.suspendedReason}{/if}
		</p>
	{:else if tenant.status === 'deleted'}
		<p
			class="border-danger/40 bg-danger-subtle text-fg mt-4 rounded-(--radius-control) border px-3 py-2"
		>
			Deleted{tenant.deletedAt ? ` on ${dateOf(tenant.deletedAt)}` : ''}. Recoverable until
			{tenant.purgeAfter ? dateOf(tenant.purgeAfter) : 'the end of the grace window'}, after which a
			purge job removes it.
		</p>
	{/if}

	<!-- Metadata. Counts and addresses only; no community content reaches here. -->
	<dl
		class="border-border mt-6 grid grid-cols-2 gap-x-6 gap-y-3 rounded-(--radius-card) border p-4 sm:grid-cols-3"
	>
		<div>
			<dt class="text-fg-muted text-meta">Status</dt>
			<dd>{tenant.status}</dd>
		</div>
		<div>
			<dt class="text-fg-muted text-meta">Members</dt>
			<dd data-tabular>{tenant.members}</dd>
		</div>
		<div>
			<dt class="text-fg-muted text-meta">Pending invitations</dt>
			<dd data-tabular>{tenant.pendingInvitations}</dd>
		</div>
		<div>
			<dt class="text-fg-muted text-meta">Created</dt>
			<dd>{dateOf(tenant.createdAt)}</dd>
		</div>
		<div>
			<dt class="text-fg-muted text-meta">Locale</dt>
			<dd>{tenant.locale}</dd>
		</div>
		<div>
			<dt class="text-fg-muted text-meta">Timezone</dt>
			<dd>{tenant.timezone}</dd>
		</div>
		<div class="col-span-2">
			<dt class="text-fg-muted text-meta">Owner</dt>
			<dd>{tenant.ownerEmail ?? 'pending owner'}</dd>
		</div>
	</dl>

	{#if tenant.retiredSlugs.length > 0}
		<p class="text-fg-muted text-meta mt-3">
			Old addresses still redirecting:
			{#each tenant.retiredSlugs as retired, i (retired.slug)}{i > 0 ? ', ' : ''}<code
					>{retired.slug}</code
				>
				until {dateOf(retired.expiresAt)}{/each}
		</p>
	{/if}

	<section class="mt-8" aria-labelledby="rename-heading">
		<h2 id="rename-heading" class="text-section font-medium">Name</h2>
		<form method="POST" action="?/rename" class="mt-3 flex flex-col gap-3 sm:max-w-md" use:enhance>
			<TextField id="name" name="name" label="Name" value={tenant.name} required />
			<Button type="submit" class="self-start">Rename</Button>
		</form>
		{@render panelError('rename')}
	</section>

	<section class="mt-10" aria-labelledby="slug-heading">
		<h2 id="slug-heading" class="text-section font-medium">Address</h2>
		<p class="text-fg-secondary mt-1">
			Changing this breaks links people have already pasted elsewhere. The old address keeps
			redirecting for {data.redirectDays} days.
		</p>
		<form method="POST" action="?/slug" class="mt-3 flex flex-col gap-3 sm:max-w-md" use:enhance>
			<TextField id="slug" name="slug" label="New address" value={tenant.slug} required />
			<TextField
				id="slug-confirm"
				name="confirm"
				label="Type the current address to confirm"
				hint={tenant.slug}
				required
			/>
			<Button type="submit" class="self-start">Change address</Button>
		</form>
		{@render panelError('slug')}
	</section>

	<section class="mt-10" aria-labelledby="limits-heading">
		<h2 id="limits-heading" class="text-section font-medium">Limits</h2>
		<p class="text-fg-secondary mt-1">
			Blank means the instance default, which is unlimited during the testing phase. Introducing or
			tightening a limit needs a reason, because a community can be over it the moment it applies.
		</p>
		<form method="POST" action="?/limits" class="mt-3 flex flex-col gap-3 sm:max-w-md" use:enhance>
			<TextField
				id="maxMembers"
				name="maxMembers"
				label="Members"
				inputmode="numeric"
				value={tenant.limits.maxMembers ?? ''}
			/>
			<TextField
				id="storageMb"
				name="storageMb"
				label="Storage (MB)"
				inputmode="numeric"
				value={tenant.limits.storageMb ?? ''}
			/>
			<TextField
				id="aiMonthlyTokens"
				name="aiMonthlyTokens"
				label="AI tokens per month"
				inputmode="numeric"
				value={tenant.limits.aiMonthlyTokens ?? ''}
			/>
			<TextField id="limits-reason" name="reason" label="Reason (if tightening)" />
			<Button type="submit" class="self-start">Save limits</Button>
		</form>
		{@render panelError('limits')}
	</section>

	<section class="mt-10" aria-labelledby="flags-heading">
		<h2 id="flags-heading" class="text-section font-medium">Features</h2>
		<form method="POST" action="?/flags" class="mt-3 flex flex-col gap-3" use:enhance>
			<label class="flex items-center gap-2">
				<input type="checkbox" name="aiEnabled" checked={tenant.flags.aiEnabled} />
				<span>AI assistance</span>
			</label>
			<label class="flex items-center gap-2">
				<input type="checkbox" name="gitMirrorEnabled" checked={tenant.flags.gitMirrorEnabled} />
				<span>Git mirror <span class="text-fg-muted">— sends adopted text to a remote</span></span>
			</label>
			<label class="flex items-center gap-2">
				<input
					type="checkbox"
					name="publicIndexEnabled"
					checked={tenant.flags.publicIndexEnabled}
				/>
				<span
					>Public artifact index <span class="text-fg-muted">— readable without signing in</span
					></span
				>
			</label>
			<Button type="submit" class="self-start">Save features</Button>
		</form>
		{@render panelError('flags')}
	</section>

	<section class="mt-10" aria-labelledby="owner-heading">
		<h2 id="owner-heading" class="text-section font-medium">Ownership</h2>
		{#if tenant.stewards.length < 2}
			<p class="text-fg-secondary mt-1">
				{tenant.stewards.length === 0
					? 'Nobody has accepted an invitation yet, so there is no owner to move.'
					: 'There is only one steward. A steward has to promote someone before the owner flag can move.'}
			</p>
		{:else}
			<form
				method="POST"
				action="?/transfer"
				class="mt-3 flex flex-col gap-3 sm:max-w-md"
				use:enhance
			>
				<label for="toUserId" class="text-fg font-medium">Move the owner flag to</label>
				<select
					id="toUserId"
					name="toUserId"
					class="border-border bg-raised text-fg h-9 rounded-(--radius-control) border px-2.5"
				>
					{#each tenant.stewards.filter((s) => !s.isOwner) as steward (steward.userId)}
						<option value={steward.userId}>{steward.email}</option>
					{/each}
				</select>
				<Button type="submit" class="self-start">Transfer ownership</Button>
			</form>
		{/if}
		{@render panelError('transfer')}
	</section>

	<section class="mt-10" aria-labelledby="lifecycle-heading">
		<h2 id="lifecycle-heading" class="text-section font-medium">Suspension</h2>
		{#if tenant.status === 'suspended'}
			<form method="POST" action="?/unsuspend" class="mt-3" use:enhance>
				<Button type="submit">Lift the suspension</Button>
			</form>
		{:else}
			<form
				method="POST"
				action="?/suspend"
				class="mt-3 flex flex-col gap-3 sm:max-w-md"
				use:enhance
			>
				<TextField
					id="suspend-reason"
					name="reason"
					label="Reason"
					hint="Shown to the community. Suspension never deletes anything."
					required
				/>
				<Button type="submit" variant="danger" class="self-start">Suspend</Button>
			</form>
		{/if}
		{@render panelError('suspend')}
	</section>

	<section class="mt-10" aria-labelledby="delete-heading">
		<h2 id="delete-heading" class="text-section font-medium">Deletion</h2>
		{#if tenant.status === 'deleted'}
			<form method="POST" action="?/restore" class="mt-3" use:enhance>
				<Button type="submit">Restore</Button>
			</form>
		{:else}
			<p class="text-fg-secondary mt-1">
				Hides the community everywhere and keeps its data for a 30-day grace window, after which a
				purge job removes it. Hard deletion is never a button.
			</p>
			<form
				method="POST"
				action="?/delete"
				class="mt-3 flex flex-col gap-3 sm:max-w-md"
				use:enhance
			>
				<TextField id="delete-reason" name="reason" label="Reason" required />
				<TextField
					id="delete-confirm"
					name="confirm"
					label="Type the address to confirm"
					hint={tenant.slug}
					required
				/>
				<Button type="submit" variant="danger" class="self-start">Delete</Button>
			</form>
		{/if}
		{@render panelError('delete')}
	</section>

	<section class="mt-10" aria-labelledby="history-heading">
		<h2 id="history-heading" class="text-section font-medium">Administrative history</h2>
		{#if data.events.length === 0}
			<p class="text-fg-muted mt-2">Nothing yet.</p>
		{:else}
			<ul class="mt-3 flex flex-col gap-2">
				{#each data.events as event (event.id)}
					<li class="border-border/60 border-b pb-2">
						<p>
							<span class="text-fg-muted text-meta" data-tabular
								>{new Date(event.at).toISOString().slice(0, 16).replace('T', ' ')}</span
							>
							<span class="ml-2">{event.action}</span>
							<span class="text-fg-secondary">· {event.actorEmail ?? 'system'}</span>
						</p>
						{#each event.changes as change (change.field)}
							<p class="text-fg-secondary text-meta">
								{change.field}: {change.from} → {change.to}
							</p>
						{/each}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>
