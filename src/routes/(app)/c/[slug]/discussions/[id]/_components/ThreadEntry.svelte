<script lang="ts">
	import Markdown from '$lib/components/ui/Markdown.svelte';
	import { useTime } from '$lib/time/use-time';
	import IconArrowBackUp from '~icons/tabler/arrow-back-up';
	import IconArrowUp from '~icons/tabler/arrow-up';
	import IconCalendarEvent from '~icons/tabler/calendar-event';
	import IconFileText from '~icons/tabler/file-text';
	import type { PageData } from '../$types';

	/**
	 * One thing said in a thread, drawn as what it is (design 06).
	 *
	 * A reply is a person talking, so it gets the avatar. Everything else is
	 * something *happening* to the question — a version written, an answer
	 * given, a meeting written up, the question moved — and reads as an event
	 * line with a mark in the avatar's column, so a reader scanning the thread can
	 * tell the conversation from the record without reading every post. The mark
	 * is never the only signal: every event line says in words what happened.
	 */
	interface Props {
		entry: PageData['posts'][number];
	}
	let { entry }: Props = $props();

	const clock = useTime();
	const time = (ms: number) => clock.moment(ms, 'dateTimeShort');
	const day = (ms: number) => clock.dateShort(ms);

	/** "to v3" when the version is known; a backfilled reason may not know it. */
	const onVersion = (prefix: string) =>
		entry.subjectVersion ? ` ${prefix} v${entry.subjectVersion}` : '';

	type Look = { verb: string; prep: string; dot: string; rule: string };
	const CONSENT: Look = {
		verb: 'consented',
		prep: 'to',
		dot: 'bg-accent-fg',
		rule: 'border-accent/50'
	};
	const RESPONSE: Record<string, Look> = {
		consent: CONSENT,
		abstain: {
			verb: 'abstained',
			prep: 'on',
			dot: 'border-2 border-fg-muted',
			rule: 'border-border-strong'
		},
		objection: { verb: 'objected', prep: 'to', dot: 'bg-danger', rule: 'border-danger/50' }
	};
	const response = $derived(RESPONSE[entry.responseValue ?? ''] ?? CONSENT);
</script>

<!--
	eslint-disable svelte/no-navigation-without-resolve --
	`?v=` and `&compare=1` are this same page with a different version on the
	rail — bare queries, as on the page itself.
-->

{#if entry.kind === 'message'}
	<div class="flex gap-3">
		<span
			class="bg-raised text-fg-secondary text-meta flex h-7 w-7 flex-none items-center justify-center rounded-full font-medium"
			aria-hidden="true">{entry.author.initials}</span
		>
		<div class="min-w-0 flex-1">
			<p class="flex flex-wrap items-baseline gap-x-2">
				<span class="text-fg font-medium">{entry.author.label}</span>
				<span class="text-fg-muted text-meta">{time(entry.createdAt)}</span>
			</p>
			<Markdown blocks={entry.body} class="mt-1" />
		</div>
	</div>
{:else if entry.kind === 'proposal'}
	{@const revised = (entry.proposalVersion ?? 1) > 1}
	<div class="flex gap-3">
		<span class="text-accent-fg flex w-7 flex-none justify-center pt-0.5" aria-hidden="true">
			{#if revised}<IconArrowUp class="h-4 w-4" />{:else}<IconFileText class="h-4 w-4" />{/if}
		</span>
		<div class="min-w-0 flex-1">
			<p class="flex flex-wrap items-baseline gap-x-2">
				<span class="text-fg-secondary">
					<span class="text-fg font-medium">{entry.author.label}</span>
					{#if revised}
						revised the proposal to <span class="text-fg" data-tabular
							>v{entry.proposalVersion}</span
						>{#if entry.revisionNote}&nbsp;— {entry.revisionNote}{/if}
					{:else}
						proposed <span class="text-fg" data-tabular>v{entry.proposalVersion}</span>
					{/if}
				</span>
				<span class="text-fg-muted text-meta">{time(entry.createdAt)}</span>
				{#if entry.state === 'in_force'}
					<span
						class="border-accent/50 text-accent-fg text-meta rounded-(--radius-control) border px-1.5"
						data-tabular>recorded {entry.ref}</span
					>
				{:else if entry.state === 'superseded'}
					<span
						class="border-border-strong text-fg-muted text-meta rounded-(--radius-control) border px-1.5"
						data-tabular>{entry.ref}, since superseded</span
					>
				{/if}
			</p>
			<!--
				The text itself, set off as the thing a decision would adopt rather
				than one more opinion about it.
			-->
			<div class="border-border-strong mt-2 border-l-2 pl-3">
				<Markdown blocks={entry.body} class="text-fg-secondary" />
			</div>
			<p class="text-meta mt-1.5 flex flex-wrap gap-x-3">
				<a
					href="?v={entry.proposalVersion}"
					class="text-fg-secondary hover:text-fg underline underline-offset-2"
					>Open v{entry.proposalVersion} on the table</a
				>
				{#if revised}
					<a
						href="?v={entry.proposalVersion}&compare=1"
						class="text-fg-secondary hover:text-fg underline underline-offset-2">see the change</a
					>
				{/if}
			</p>
		</div>
	</div>
{:else if entry.kind === 'offline_summary'}
	<!-- A meeting is a change of room, so it gets a divider before it. -->
	<div class="flex flex-col gap-3">
		<p class="text-fg-secondary text-meta flex items-center gap-3">
			<span class="bg-border h-px flex-1" aria-hidden="true"></span>
			<span class="flex items-center gap-1.5">
				<IconCalendarEvent class="text-fg-muted h-3.5 w-3.5" aria-hidden="true" />
				Continued in a meeting · {day(entry.createdAt)}
			</span>
			<span class="bg-border h-px flex-1" aria-hidden="true"></span>
		</p>
		<div class="flex gap-3">
			<span class="flex w-7 flex-none justify-center pt-1.5" aria-hidden="true">
				<span class="border-border-strong h-2 w-2 rounded-full border-2"></span>
			</span>
			<div class="min-w-0 flex-1">
				<p class="flex flex-wrap items-baseline gap-x-2">
					<span class="text-fg-secondary"
						>Written up by <span class="text-fg">{entry.author.label}</span></span
					>
					<span class="text-fg-muted text-meta">{time(entry.createdAt)}</span>
				</p>
				<Markdown blocks={entry.body} class="mt-1.5 font-serif leading-relaxed" />
			</div>
		</div>
	</div>
{:else if entry.kind === 'response'}
	<div class="flex gap-3">
		<span class="flex w-7 flex-none justify-center pt-1.5" aria-hidden="true">
			<span class="h-2 w-2 rounded-full {response.dot}"></span>
		</span>
		<div class="min-w-0 flex-1">
			<p class="flex flex-wrap items-baseline gap-x-2">
				<span class="text-fg-secondary">
					<span class="text-fg font-medium">{entry.author.label}</span>
					{response.verb}{onVersion(response.prep)}
				</span>
				{#if entry.responseValue === 'objection' && entry.objectionState}
					<!--
						Where the objection stands now, beside the words that raised it.
						Open is loud on purpose: an unresolved objection is never something
						a reader should have to go looking for.
					-->
					<span
						class="text-meta rounded-(--radius-control) border px-1.5 {entry.objectionState ===
						'open'
							? 'border-danger/50 text-danger'
							: 'border-border-strong text-fg-muted'}">{entry.objectionState}</span
					>
				{/if}
				<span class="text-fg-muted text-meta">{time(entry.createdAt)}</span>
			</p>
			<div class="mt-1 border-l-2 pl-3 {response.rule}">
				<Markdown blocks={entry.body} />
			</div>
		</div>
	</div>
{:else}
	<!-- `event`: the thread recording an act on the question itself. -->
	<div class="flex gap-3">
		<span class="text-info-fg flex w-7 flex-none justify-center pt-0.5" aria-hidden="true">
			<IconArrowBackUp class="h-4 w-4" />
		</span>
		<div class="min-w-0 flex-1">
			<p class="flex flex-wrap items-baseline gap-x-2">
				<span class="text-fg font-medium">{entry.author.label}</span>
				<span class="text-fg-muted text-meta">{time(entry.createdAt)}</span>
			</p>
			<Markdown blocks={entry.body} class="text-fg-secondary mt-0.5" />
		</div>
	</div>
{/if}
