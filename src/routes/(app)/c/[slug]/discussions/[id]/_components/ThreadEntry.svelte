<script lang="ts">
	import InlineText from '$lib/components/ui/InlineText.svelte';
	import Markdown from '$lib/components/ui/Markdown.svelte';
	import { useTime } from '$lib/time/use-time';
	import IconArrowBackUp from '~icons/tabler/arrow-back-up';
	import type { PageData } from '../$types';
	import MeetingNote from './MeetingNote.svelte';
	import Replies from './Replies.svelte';

	/**
	 * One thing said in a thread, drawn as what it is (design 06).
	 *
	 * A reply is a person talking, so it gets the avatar. A meeting with no
	 * proposal is a card of its own; moving the question is one grey status
	 * line. Proposal versions — and the answers and meetings that belong to
	 * them — are not drawn here at all: each is a `ProposalCard`. What remains
	 * of `response` is a reason whose version is unknown, which reads as an event
	 * line with a mark in the avatar's column. The mark is never the only
	 * signal: every line says in words what happened.
	 */
	interface Props {
		entry: PageData['posts'][number];
		/** Replies filed under this post, when it is a message. */
		replies?: PageData['posts'][number][];
		/** Where "Reply" goes, or null when this member may not reply. */
		replyHref?: string | null;
	}
	let { entry, replies = [], replyHref = null }: Props = $props();

	const clock = useTime();
	const time = (ms: number) => clock.moment(ms, 'dateTimeShort');

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

{#if entry.kind === 'message'}
	<div id="post-{entry.id}" class="flex scroll-mt-4 gap-3">
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
			<Replies {replies} {replyHref} />
		</div>
	</div>
{:else if entry.kind === 'offline_summary'}
	<!--
		A meeting that produced no proposal. One card, header and summary
		together, so it reads as the record of a meeting rather than as a reply.
		A meeting that did produce one is drawn inside that version's card.
	-->
	<div class="border-border bg-surface rounded-(--radius-card) border px-4 py-4">
		<MeetingNote {entry} produced={false} />
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
	<!--
		`event`: the thread recording an act on the question itself. One grey line
		with the name and the time, because it is a status, not a contribution —
		it should be findable without competing with what people said.
	-->
	<p class="text-fg-muted text-meta flex gap-3">
		<span class="text-info-fg flex w-7 flex-none justify-center pt-px" aria-hidden="true">
			<IconArrowBackUp class="h-3.5 w-3.5" />
		</span>
		<span class="min-w-0 flex-1">
			<span class="text-fg-secondary">{entry.author.label}</span>
			·
			{#each entry.body as node, i (i)}
				{#if node.type === 'paragraph'}<span><InlineText nodes={node.children} /></span>{/if}
			{/each}
			· <span class="whitespace-nowrap">{time(entry.createdAt)}</span>
		</span>
	</p>
{/if}
