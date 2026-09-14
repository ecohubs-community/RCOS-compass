<script lang="ts">
	import * as m from '$lib/paraglide/messages';

	/**
	 * A post's text box that can mention a member. `openspec/changes/notifications-page`.
	 *
	 * Without JavaScript it is the textarea it replaces: a member types `@M-0142`,
	 * the number the members page shows. With it, typing `@` offers the community's
	 * members by name and inserts the number — the number, because a name is not
	 * unique, changes, and is blanked by erasure, while the number stays right
	 * through all three.
	 *
	 * A listbox under the field rather than Bits UI's combobox: that one owns its
	 * own single-line input, and the thing being completed here is a word in the
	 * middle of a paragraph. The field keeps focus throughout and points at the
	 * highlighted option with `aria-activedescendant`.
	 */
	type Member = { token: string; label: string };
	type Props = {
		id: string;
		name: string;
		rows?: number;
		required?: boolean;
		value?: string;
		placeholder?: string;
		class?: string;
		members: readonly Member[];
	};

	let {
		id,
		name,
		rows = 3,
		required = false,
		value = '',
		placeholder,
		class: className = '',
		members
	}: Props = $props();

	let field = $state<HTMLTextAreaElement | null>(null);
	/** The words typed after `@`, or null while no mention is being written. */
	let query = $state<string | null>(null);
	let active = $state(0);
	let start = 0;

	const matches = $derived.by(() => {
		if (query === null) return [];
		const wanted = query.toLocaleLowerCase();
		return members
			.filter(
				(member) =>
					member.label.toLocaleLowerCase().includes(wanted) ||
					member.token.toLocaleLowerCase().includes(wanted)
			)
			.slice(0, 6);
	});
	const listId = $derived(`${id}-mentions`);
	const open = $derived(query !== null && matches.length > 0);

	function track() {
		if (!field) return;
		const before = field.value.slice(0, field.selectionStart);
		const found = /(?:^|\s)@([\p{L}\p{N}-]{0,30})$/u.exec(before);
		if (!found) {
			query = null;
			return;
		}
		query = found[1]!;
		start = before.length - found[1]!.length - 1;
		active = 0;
	}

	function choose(member: Member) {
		if (!field) return;
		const end = field.selectionStart;
		field.value = `${field.value.slice(0, start)}${member.token} ${field.value.slice(end)}`;
		const caret = start + member.token.length + 1;
		field.setSelectionRange(caret, caret);
		field.focus();
		query = null;
	}

	function keydown(event: KeyboardEvent) {
		if (!open) return;
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			const step = event.key === 'ArrowDown' ? 1 : -1;
			active = (active + step + matches.length) % matches.length;
		} else if (event.key === 'Enter' || event.key === 'Tab') {
			event.preventDefault();
			choose(matches[active]!);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			query = null;
		}
	}
</script>

<div class="relative flex flex-col gap-1">
	<textarea
		bind:this={field}
		{id}
		{name}
		{rows}
		{required}
		{placeholder}
		{value}
		class={className}
		aria-describedby="{id}-mention-hint"
		aria-autocomplete="list"
		aria-controls={open ? listId : undefined}
		aria-activedescendant={open ? `${listId}-${active}` : undefined}
		oninput={track}
		onclick={track}
		onkeydown={keydown}
		onblur={() => (query = null)}></textarea>
	<p id="{id}-mention-hint" class="text-fg-muted text-meta">{m.mention_hint()}</p>
	{#if open}
		<ul
			id={listId}
			role="listbox"
			aria-label={m.mention_list_label()}
			class="border-border bg-surface absolute top-full left-0 z-20 mt-1 w-full max-w-sm rounded-(--radius-card) border p-1 shadow-lg"
		>
			{#each matches as member, i (member.token)}
				<li
					id="{listId}-{i}"
					role="option"
					aria-selected={i === active}
					class="flex cursor-pointer items-baseline gap-2 rounded-(--radius-control) px-2 py-1.5 {i ===
					active
						? 'bg-raised text-fg'
						: 'text-fg-secondary'}"
					onmousedown={(event) => {
						// Before the field's blur closes the list.
						event.preventDefault();
						choose(member);
					}}
				>
					<span class="min-w-0 flex-1 truncate">{member.label}</span>
					<span class="text-fg-muted text-meta" data-tabular>{member.token}</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>
