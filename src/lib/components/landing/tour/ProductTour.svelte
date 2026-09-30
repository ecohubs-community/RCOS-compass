<script lang="ts">
	import { cn } from '$lib/components/ui/cn.js';
	import * as m from '$lib/paraglide/messages';
	import { placeOf } from '../reveal.js';
	import TourConsent from './TourConsent.svelte';
	import TourDefinition from './TourDefinition.svelte';
	import TourDiscussion from './TourDiscussion.svelte';
	import TourDocuments from './TourDocuments.svelte';
	import TourPath from './TourPath.svelte';
	import TourScreen from './TourScreen.svelte';
	import TourWindow, { type TourNav } from './TourWindow.svelte';

	/**
	 * The thirty-second tour: five stages, five beats each, one beat every
	 * 1.5 seconds.
	 *
	 * It only plays while it is on screen, and never by itself for somebody who
	 * asked their system for less motion — they get the first stage and the
	 * controls. The window is a picture of the app, not the app: it is hidden
	 * from assistive technology, and each stage's caption says in words what the
	 * picture shows.
	 */
	const BEAT_MS = 1500;
	const BEATS = 5;

	let stage = $state(0);
	let beat = $state(0);
	let playing = $state(true);
	let onScreen = $state(false);
	/** Bumped when somebody picks a stage, so its first beat gets the full 1.5 s. */
	let restart = $state(0);
	let root: HTMLElement;

	const stages = $derived([
		{
			label: m.landing_tour_step_path(),
			title: m.landing_tour_cap_path_title(),
			text: m.landing_tour_cap_path()
		},
		{
			label: m.landing_tour_step_discussion(),
			title: m.landing_tour_cap_discussion_title(),
			text: m.landing_tour_cap_discussion()
		},
		{
			label: m.landing_tour_step_consent(),
			title: m.landing_tour_cap_consent_title(),
			text: m.landing_tour_cap_consent()
		},
		{
			label: m.landing_tour_step_definition(),
			title: m.landing_tour_cap_definition_title(),
			text: m.landing_tour_cap_definition()
		},
		{
			label: m.landing_tour_step_documents(),
			title: m.landing_tour_cap_documents_title(),
			text: m.landing_tour_cap_documents()
		}
	]);

	const NAV: TourNav[] = ['path', 'discussions', 'discussions', 'definitions', 'documents'];

	/** Where stage `s` is up to: -1 not reached, 0–4 its beats, 9 finished. */
	const level = (s: number) => (stage === s ? beat : stage > s ? 9 : -1);

	function go(s: number) {
		stage = s;
		beat = 0;
		restart += 1;
	}

	$effect(() => {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) playing = false;
		const observer = new IntersectionObserver(
			([entry]) => (onScreen = entry?.isIntersecting ?? false),
			{
				threshold: 0.25
			}
		);
		observer.observe(root);
		return () => observer.disconnect();
	});

	$effect(() => {
		void restart;
		if (!playing || !onScreen) return;
		const timer = setInterval(() => {
			if (beat >= BEATS - 1) {
				stage = (stage + 1) % stages.length;
				beat = 0;
			} else {
				beat += 1;
			}
		}, BEAT_MS);
		return () => clearInterval(timer);
	});
</script>

<section
	id="how"
	bind:this={root}
	aria-labelledby="tour-title"
	class="mx-auto max-w-[1280px] scroll-mt-16 px-2 pt-18 sm:px-5"
>
	<h2 id="tour-title" class="sr-only">{m.landing_tour_heading()}</h2>
	<div class="bg-forest flex flex-col gap-5.5 rounded-[24px] p-3 sm:rounded-[32px] sm:p-6.5">
		<ol class="grid grid-cols-5 gap-2">
			{#each stages as item, s (s)}
				<li>
					<button
						type="button"
						onclick={() => go(s)}
						aria-current={stage === s ? 'step' : undefined}
						class="flex min-h-11 w-full cursor-pointer flex-col gap-2.5 rounded-md px-1 py-1.5 text-left"
					>
						<span
							class={cn(
								'flex items-baseline gap-2 text-[15px] transition-colors duration-300',
								stage === s ? 'text-forest-fg' : 'text-forest-sage'
							)}
						>
							<span class="font-code text-xs">{String(s + 1).padStart(2, '0')}</span>
							<span class="max-sm:sr-only">{item.label}</span>
						</span>
						<span class="bg-forest-fg/12 h-0.5 overflow-hidden rounded-xs">
							<span
								class={cn(
									'bg-mint block h-full',
									stage === s && beat > 0 && 'transition-[width] duration-1500 ease-linear'
								)}
								style:width="{stage === s ? ((beat + 1) / BEATS) * 100 : stage > s ? 100 : 0}%"
							></span>
						</span>
					</button>
				</li>
			{/each}
		</ol>

		<div aria-hidden="true">
			<TourWindow nav={NAV[stage]!} readiness={level(4) >= 1 ? 45 : 41}>
				<TourScreen place={placeOf(0, stage)}><TourPath level={level(0)} /></TourScreen>
				<TourScreen place={placeOf(1, stage)}><TourDiscussion level={level(1)} /></TourScreen>
				<TourScreen place={placeOf(2, stage)}><TourConsent level={level(2)} /></TourScreen>
				<TourScreen place={placeOf(3, stage)}><TourDefinition level={level(3)} /></TourScreen>
				<TourScreen place={placeOf(4, stage)}><TourDocuments level={level(4)} /></TourScreen>
			</TourWindow>
		</div>

		<div class="flex flex-wrap items-center gap-5 px-1.5 pt-0.5">
			<p class="flex min-w-65 flex-1 flex-wrap items-baseline gap-x-3.5 gap-y-1">
				<span class="font-display text-forest-fg text-[26px] tracking-[-.01em]"
					>{stages[stage]!.title}</span
				>
				<span class="text-forest-muted max-w-155 text-base text-pretty">{stages[stage]!.text}</span>
			</p>
			<button
				type="button"
				onclick={() => (playing = !playing)}
				class="border-forest-fg/22 text-forest-fg hover:bg-forest-fg/8 min-h-11 cursor-pointer rounded-full border px-4 text-sm"
				>{playing ? m.landing_tour_pause() : m.landing_tour_play()}</button
			>
		</div>
	</div>
</section>
