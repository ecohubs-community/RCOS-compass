<script lang="ts" module>
	export type ClauseOption = {
		key: string;
		ref: string;
		title: string;
		question: string | null;
		layer: number;
	};

	/** Matches a clause by its reference, its name or its question — words a member might remember. */
	export function matchClauses(options: readonly ClauseOption[], typed: string): ClauseOption[] {
		const needle = typed.trim().toLowerCase().replace(/^§/, '');
		if (needle === '') return options.slice(0, 50);
		return options
			.filter(
				(option) =>
					option.ref.startsWith(needle) ||
					option.title.toLowerCase().includes(needle) ||
					(option.question?.toLowerCase().includes(needle) ?? false)
			)
			.slice(0, 50);
	}
</script>

<script lang="ts">
	import { Combobox } from 'bits-ui';
	import { onMount } from 'svelte';
	import * as m from '$lib/paraglide/messages';

	/**
	 * Choose a clause by typing. Design 05's *Change clause*; the change's
	 * `mapping-workspace` spec.
	 *
	 * Before JavaScript it is a text field with a `datalist` of references, and
	 * the server resolves whatever was typed — a reference or a key. Once the page
	 * has hydrated it becomes a combobox that also searches names and questions.
	 * Either way the form posts one field, `clause`: the chosen reference, or the
	 * words typed if nothing was chosen, so the server's answer is the same.
	 */
	type Props = {
		id: string;
		options: readonly ClauseOption[];
		name?: string;
		label?: string;
	};

	let { id, options, name = 'clause', label = m.workspace_clause_label() }: Props = $props();

	let mounted = $state(false);
	let typed = $state('');
	let chosen = $state('');
	let open = $state(false);
	onMount(() => (mounted = true));

	const matches = $derived(matchClauses(options, typed));
</script>

<div class="flex min-w-0 flex-col gap-1">
	<label for={id} id="{id}-label" class="text-fg-secondary text-meta">{label}</label>
	{#if mounted}
		<Combobox.Root
			type="single"
			bind:value={chosen}
			bind:open
			onValueChange={(value) => {
				typed = options.find((option) => option.key === value)?.ref ?? typed;
			}}
		>
			<Combobox.Input
				{id}
				aria-labelledby="{id}-label"
				class="border-border-strong bg-bg text-fg h-9 w-full min-w-0 rounded-(--radius-control) border px-2.5"
				placeholder="3.6.2"
				aria-describedby="{id}-hint"
				oninput={(event) => {
					typed = event.currentTarget.value;
					chosen = '';
					open = typed.trim() !== '';
				}}
			/>
			<Combobox.Portal>
				<Combobox.Content
					class="border-border-strong bg-surface z-50 max-h-72 w-(--bits-combobox-anchor-width) min-w-72 overflow-y-auto rounded-(--radius-control) border p-1 shadow-lg"
					sideOffset={4}
				>
					{#each matches as option (option.key)}
						<Combobox.Item
							value={option.key}
							label={option.ref}
							class="data-highlighted:bg-raised flex cursor-pointer flex-col rounded-[5px] px-2.5 py-1.5"
						>
							<span class="text-fg font-mono text-[12px]">§{option.ref}</span>
							<span class="text-fg-secondary text-meta">{option.title}</span>
						</Combobox.Item>
					{:else}
						<p class="text-fg-muted text-meta px-2.5 py-1.5">{m.workspace_clause_none()}</p>
					{/each}
				</Combobox.Content>
			</Combobox.Portal>
		</Combobox.Root>
		<input type="hidden" {name} value={chosen || typed} />
	{:else}
		<input
			{id}
			{name}
			list="{id}-refs"
			autocomplete="off"
			placeholder="3.6.2"
			aria-describedby="{id}-hint"
			class="border-border-strong bg-bg text-fg h-9 w-full min-w-0 rounded-(--radius-control) border px-2.5"
		/>
		<datalist id="{id}-refs">
			{#each options as option (option.key)}
				<option value={option.ref}>{option.title}</option>
			{/each}
		</datalist>
	{/if}
	<p id="{id}-hint" class="text-fg-muted text-meta">{m.workspace_clause_hint()}</p>
</div>
