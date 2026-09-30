<script lang="ts">
	import type { Component } from 'svelte';
	import { cn } from '$lib/components/ui/cn.js';
	import * as m from '$lib/paraglide/messages';
	import Eyebrow from '../Eyebrow.svelte';
	import SectionHeading from '../SectionHeading.svelte';
	import { placeOf } from '../reveal.js';
	import StoryConsent from './StoryConsent.svelte';
	import StoryConversation from './StoryConversation.svelte';
	import StoryFreeze from './StoryFreeze.svelte';
	import StoryGlossary from './StoryGlossary.svelte';
	import StoryImport from './StoryImport.svelte';
	import StoryLint from './StoryLint.svelte';
	import StoryLookup from './StoryLookup.svelte';
	import StoryMapping from './StoryMapping.svelte';
	import StoryPath from './StoryPath.svelte';
	import StoryQuestions from './StoryQuestions.svelte';
	import StoryReadiness from './StoryReadiness.svelte';
	import StoryRevise from './StoryRevise.svelte';
	import StoryRegister from './StoryRegister.svelte';
	import StoryShare from './StoryShare.svelte';
	import StoryStep from './StoryStep.svelte';

	/**
	 * A year in Valle Verde, told in fourteen steps beside a picture that
	 * follows the reader down the page.
	 *
	 * The step being read is the last one whose top has passed 55% of the
	 * viewport. The pictures are drawn on a 540×500 stage and scaled to the
	 * column — a computed transform, the one kind of inline style the rules
	 * allow. Without JavaScript every step reads in full and the first picture
	 * stays up, which is the whole story minus the choreography.
	 */
	const STAGE_W = 540;
	const STAGE_H = 500;

	let active = $state(0);
	let hydrated = $state(false);
	let stageWidth = $state(STAGE_W);
	let list: HTMLElement;

	const I = $derived(m.landing_story_ch1());
	const II = $derived(m.landing_story_ch2());
	const III = $derived(m.landing_story_ch3());
	const IV = $derived(m.landing_story_ch4());

	const steps: { chapter: string; title: string; text: string; visual: Component }[] = $derived([
		{
			chapter: I,
			title: m.landing_story_s1_title(),
			text: m.landing_story_s1(),
			visual: StoryQuestions
		},
		{
			chapter: I,
			title: m.landing_story_s2_title(),
			text: m.landing_story_s2(),
			visual: StoryImport
		},
		{
			chapter: I,
			title: m.landing_story_s3_title(),
			text: m.landing_story_s3(),
			visual: StoryMapping
		},
		{
			chapter: II,
			title: m.landing_story_s4_title(),
			text: m.landing_story_s4(),
			visual: StoryPath
		},
		{
			chapter: II,
			title: m.landing_story_s5_title(),
			text: m.landing_story_s5(),
			visual: StoryConversation
		},
		{
			chapter: II,
			title: m.landing_story_s6_title(),
			text: m.landing_story_s6(),
			visual: StoryLint
		},
		{
			chapter: II,
			title: m.landing_story_s7_title(),
			text: m.landing_story_s7(),
			visual: StoryConsent
		},
		{
			chapter: II,
			title: m.landing_story_s8_title(),
			text: m.landing_story_s8(),
			visual: StoryFreeze
		},
		{
			chapter: III,
			title: m.landing_story_s9_title(),
			text: m.landing_story_s9(),
			visual: StoryRegister
		},
		{
			chapter: III,
			title: m.landing_story_s10_title(),
			text: m.landing_story_s10(),
			visual: StoryLookup
		},
		{
			chapter: III,
			title: m.landing_story_s11_title(),
			text: m.landing_story_s11(),
			visual: StoryRevise
		},
		{
			chapter: III,
			title: m.landing_story_s12_title(),
			text: m.landing_story_s12(),
			visual: StoryShare
		},
		{
			chapter: IV,
			title: m.landing_story_s13_title(),
			text: m.landing_story_s13(),
			visual: StoryReadiness
		},
		{
			chapter: IV,
			title: m.landing_story_s14_title(),
			text: m.landing_story_s14(),
			visual: StoryGlossary
		}
	]);

	const chapters = $derived([
		{ label: m.landing_story_chip1(), from: 0 },
		{ label: m.landing_story_chip2(), from: 3 },
		{ label: m.landing_story_chip3(), from: 8 },
		{ label: m.landing_story_chip4(), from: 12 }
	]);
	const chapter = $derived(chapters.findLastIndex((c) => active >= c.from));

	const scale = $derived(Math.min(1.12, stageWidth / STAGE_W));

	function follow() {
		const line = window.innerHeight * 0.55;
		let current = 0;
		list.querySelectorAll('[data-story-step]').forEach((el, i) => {
			if (el.getBoundingClientRect().top < line) current = i;
		});
		active = current;
	}

	$effect(() => {
		hydrated = true;
		let frame = 0;
		const onScroll = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(follow);
		};
		follow();
		window.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('resize', onScroll, { passive: true });
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener('scroll', onScroll);
			window.removeEventListener('resize', onScroll);
		};
	});
</script>

<section
	id="story"
	aria-labelledby="story-title"
	class="mx-auto max-w-[1240px] scroll-mt-10 px-4 pt-28 sm:px-7 sm:pt-37.5"
>
	<div class="max-w-195">
		<Eyebrow>{m.landing_story_eyebrow()}</Eyebrow>
		<SectionHeading id="story-title" class="mt-4">{m.landing_story_title()}</SectionHeading>
		<p class="text-site-ink-2 mt-5.5 max-w-160 text-[19px] text-pretty">{m.landing_story_lede()}</p>
	</div>

	<div class="mt-10 grid items-start gap-14 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
		<div bind:this={list} class="flex flex-col">
			{#each steps as step, i (i)}
				<StoryStep
					chapter={step.chapter}
					title={step.title}
					text={step.text}
					active={!hydrated || active === i}
				/>
			{/each}
		</div>

		<div
			class="bg-site-bg sticky top-17 z-2 -order-1 flex flex-col justify-center gap-4.5 pb-4 lg:top-21 lg:order-none lg:h-[calc(100vh-110px)] lg:pb-0"
			aria-hidden="true"
		>
			<div class="flex flex-wrap items-center gap-1.5">
				{#each chapters as item, c (c)}
					<span
						class={cn(
							'rounded-full px-2.5 py-1.25 text-[13px] whitespace-nowrap transition-colors duration-300',
							c === chapter ? 'bg-site-ink text-white' : 'text-site-muted max-sm:hidden'
						)}>{item.label}</span
					>
				{/each}
				<span class="flex-1"></span>
				<span class="font-code text-site-muted text-xs"
					>{String(active + 1).padStart(2, '0')} / {steps.length}</span
				>
			</div>
			<div
				bind:clientWidth={stageWidth}
				class="relative w-full overflow-hidden"
				style:height="{STAGE_H * scale}px"
			>
				<div
					class="text-site-ink absolute top-0 origin-top-left"
					style:width="{STAGE_W}px"
					style:height="{STAGE_H}px"
					style:left="{Math.max(0, (stageWidth - STAGE_W * scale) / 2)}px"
					style:transform="scale({scale})"
				>
					{#each steps as step, i (i)}
						{@const Visual = step.visual}
						{@const place = placeOf(i, active)}
						<div
							class={cn(
								'absolute inset-0 flex items-center transition-[opacity,translate,scale] duration-600',
								place === 'current' && 'translate-y-0 scale-100 opacity-100',
								place === 'before' && '-translate-y-7 scale-97 opacity-0',
								place === 'after' && 'translate-y-7 scale-97 opacity-0'
							)}
						>
							<Visual />
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>
</section>
