<script lang="ts">
	import { enhance } from '$app/forms';
	import * as m from '$lib/paraglide/messages';
	import IconDeviceFloppy from '~icons/tabler/device-floppy';

	let { data, form } = $props();

	/**
	 * Named in their own language, not in the reader's.
	 *
	 * "Deutsch" is legible to somebody who reads no English; "German" is not
	 * legible to somebody who reads no English, which is exactly the person
	 * changing this setting.
	 */
	const NAMES: Record<string, string> = {
		en: 'English',
		de: 'Deutsch',
		es: 'Español',
		fr: 'Français',
		'pt-br': 'Português (Brasil)'
	};

	// Paraglide has three; the standard has five. The other two get their own
	// standard text with an English interface, and saying so beforehand is
	// better than a steward discovering it after every member's screen changed.
	const TRANSLATED = ['en', 'de', 'es'];
</script>

<svelte:head><title>{m.language_title()} · {data.community.name}</title></svelte:head>

<main class="mx-auto w-full max-w-3xl px-6 py-8">
	<h1 class="text-page font-medium">{m.language_heading()}</h1>
	<p class="text-fg-secondary mt-2">{m.language_intro()}</p>
	<p class="text-fg-muted text-meta mt-2">{m.language_unchanged()}</p>

	{#if form?.error}
		<p role="alert" class="text-attention mt-4">{form.error}</p>
	{/if}
	{#if form?.saved}
		<p role="status" class="text-fg-secondary mt-4">{m.language_saved()}</p>
	{/if}

	{#if data.can.manage}
		<form method="POST" use:enhance class="mt-6 flex flex-col gap-4">
			<div class="flex flex-col gap-1">
				<label for="locale" class="text-fg font-medium">{m.language_label()}</label>
				<select
					id="locale"
					name="locale"
					class="border-border bg-raised text-fg h-9 w-fit rounded-(--radius-control) border px-3"
				>
					{#each data.locales as locale (locale)}
						<option value={locale} selected={locale === data.current}>
							{NAMES[locale] ?? locale}{TRANSLATED.includes(locale)
								? ''
								: ` — ${m.language_interface_english()}`}
						</option>
					{/each}
				</select>
			</div>

			<button
				type="submit"
				class="bg-accent-deep text-fg inline-flex h-9 w-fit cursor-pointer items-center gap-2 rounded-(--radius-control) px-3 font-medium"
				><IconDeviceFloppy
					class="h-4 w-4 flex-none"
					aria-hidden="true"
				/>{m.language_save()}</button
			>
		</form>
	{:else}
		<p class="text-fg-secondary mt-6">
			{NAMES[data.current] ?? data.current} · {m.language_steward_only()}
		</p>
	{/if}
</main>
