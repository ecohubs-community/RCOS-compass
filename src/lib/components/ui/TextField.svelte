<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { cn } from './cn.js';

	/**
	 * A labelled text input. docs/02-component-guidelines.md §3.
	 *
	 * The label is always rendered and always associated — never a placeholder
	 * standing in for one, which disappears the moment someone starts typing and
	 * is the most common way a form becomes unusable for anyone who needs to
	 * check what they entered.
	 *
	 * An error is announced rather than merely coloured: `aria-invalid` plus a
	 * `role="alert"` message, tied to the input by `aria-describedby`.
	 */
	type Props = Omit<HTMLInputAttributes, 'class'> & {
		id: string;
		label: string;
		/** Shown under the field; also the description a screen reader reads. */
		hint?: string;
		error?: string;
		class?: string;
	};

	let {
		id,
		label,
		hint = '',
		error = '',
		class: className = '',
		type = 'text',
		...rest
	}: Props = $props();

	let hintId = $derived(`${id}-hint`);
	let errorId = $derived(`${id}-error`);
	let describedBy = $derived(
		[hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
	);
</script>

<div class={cn('flex flex-col gap-1.5', className)}>
	<label for={id} class="text-fg font-medium">{label}</label>
	<input
		{id}
		{type}
		class={cn(
			'border-border bg-raised text-fg h-9 rounded-(--radius-control) border px-2.5',
			'placeholder:text-fg-muted focus:border-border-strong focus:outline-accent focus:outline-2',
			error && 'border-danger'
		)}
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={describedBy}
		{...rest}
	/>
	{#if hint}
		<p id={hintId} class="text-fg-muted text-meta">{hint}</p>
	{/if}
	{#if error}
		<p id={errorId} role="alert" class="text-danger text-meta">{error}</p>
	{/if}
</div>
