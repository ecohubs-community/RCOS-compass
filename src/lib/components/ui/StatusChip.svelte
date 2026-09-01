<script lang="ts" module>
	/**
	 * The status vocabulary, defined exactly once.
	 * docs/02-component-guidelines.md §5 — if a new status appears in a mockup it
	 * is added here, never approximated at a call site.
	 */
	export type Status =
		'not_started' | 'drafting' | 'in_discussion' | 'in_vote' | 'adopted' | 'needs_review';

	/** Orthogonal to status: these sit alongside it, they are not statuses. */
	export type Modifier = 'provisional' | 'ai_drafted' | 'local';

	export const STATUS_LABELS: Record<Status, string> = {
		not_started: 'Not started',
		drafting: 'Drafting',
		in_discussion: 'In discussion',
		in_vote: 'In vote',
		adopted: 'Adopted',
		needs_review: 'Needs review'
	};

	const STATUS_CLASSES: Record<Status, string> = {
		not_started: 'bg-fg-muted/12 text-fg-secondary border-transparent',
		drafting: 'bg-fg-secondary/10 text-fg-secondary border-transparent',
		in_discussion: 'bg-attention-subtle text-attention border-transparent',
		in_vote: 'bg-info-subtle text-info border-transparent',
		adopted: 'bg-accent-subtle text-accent-fg border-transparent',
		// Outlined rather than filled: it is a call to act, not a state of rest.
		needs_review: 'bg-transparent text-attention border-attention/50'
	};

	export const MODIFIER_LABELS: Record<Modifier, string> = {
		provisional: 'Provisional',
		ai_drafted: 'AI-drafted',
		local: 'Local'
	};

	const MODIFIER_CLASSES: Record<Modifier, string> = {
		provisional: 'border-dashed border-border-strong text-fg-secondary',
		ai_drafted: 'border-transparent text-fg-muted',
		local: 'border-border-strong text-fg-secondary'
	};
</script>

<script lang="ts">
	import { cn } from './cn.js';

	type Props = {
		status?: Status;
		modifier?: Modifier;
		class?: string;
	};

	let { status, modifier, class: className = '' }: Props = $props();
</script>

<!--
	Colour is never the only signal (guidelines §6): every chip carries its label,
	and the AI modifier carries a mark as well as a colour.
-->
{#if status}
	<span
		class={cn(
			'text-meta inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 leading-none',
			STATUS_CLASSES[status],
			className
		)}
	>
		<span class="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true"></span>
		{STATUS_LABELS[status]}
	</span>
{/if}

{#if modifier}
	<span
		class={cn(
			'text-meta inline-flex items-center gap-1 rounded-full border px-2 py-0.5 leading-none',
			MODIFIER_CLASSES[modifier],
			className
		)}
	>
		{#if modifier === 'ai_drafted'}<span aria-hidden="true">✦</span>{/if}
		{MODIFIER_LABELS[modifier]}
	</span>
{/if}
