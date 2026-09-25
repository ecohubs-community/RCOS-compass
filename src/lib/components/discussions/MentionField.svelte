<script lang="ts">
	import * as m from '$lib/paraglide/messages';

	/**
	 * A post's text box that can mention a member. `openspec/changes/notifications-page`.
	 *
	 * A member writes a name — `@Lena Vogt` — with or without JavaScript. The
	 * server keeps it as her number when the text is saved (`$lib/shared/mentions`),
	 * because a number stays right through a rename, a shared name and an erasure;
	 * nobody has to type one. With JavaScript, typing `@` offers the community's
	 * members and inserts the chosen name.
	 *
	 * A listbox beside the field rather than Bits UI's combobox: that one owns its
	 * own single-line input, and the thing being completed here is a word in the
	 * middle of a paragraph. The field keeps focus throughout and points at the
	 * highlighted option with `aria-activedescendant`.
	 *
	 * The list is placed against the window, above the field — below it only when
	 * there is no room above. Placed inside the field's own box it was clipped by
	 * the composer, which scrolls, and opening it scrolled the composer instead of
	 * showing the names.
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
	/** Where the list sits, in window coordinates. */
	let place = $state({
		left: 0,
		width: 0,
		top: null as number | null,
		bottom: null as number | null
	});

	const ROOM = 240;
	function position() {
		if (!field) return;
		const box = field.getBoundingClientRect();
		const width = Math.min(box.width, 384);
		place =
			box.top > ROOM
				? { left: box.left, width, top: null, bottom: window.innerHeight - box.top + 4 }
				: { left: box.left, width, top: box.bottom + 4, bottom: null };
	}

	const matches = $derived.by(() => {
		if (query === null) return [];
		const wanted = query.toLocaleLowerCase().replace(/\s+/g, ' ');
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

	// Follow the field while the list is open: the thread pane and the page both
	// scroll, and a list left where the field used to be points at nothing.
	$effect(() => {
		if (!open) return;
		position();
		window.addEventListener('scroll', position, true);
		window.addEventListener('resize', position);
		return () => {
			window.removeEventListener('scroll', position, true);
			window.removeEventListener('resize', position);
		};
	});

	function track() {
		if (!field) return;
		const before = field.value.slice(0, field.selectionStart);
		// Names have spaces in them, so the words after `@` may too — "@Lena V".
		// The list stays open only while something still matches, which is what
		// ends a mention once the sentence moves on.
		const found = /(?:^|\s)@([^\s@][^\n@]{0,39}|)$/u.exec(before);
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
		const written = `@${member.label}`;
		field.value = `${field.value.slice(0, start)}${written} ${field.value.slice(end)}`;
		const caret = start + written.length + 1;
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
			class="border-border bg-surface fixed z-50 rounded-(--radius-card) border p-1 shadow-lg"
			style="left: {place.left}px; width: {place.width}px; {place.top !== null
				? `top: ${place.top}px`
				: `bottom: ${place.bottom}px`}"
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
