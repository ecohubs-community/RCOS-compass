/**
 * Which suggestion the phone queue shows. Design 16b.
 *
 * The queue walks open *suggestions*, not passages: a passage carrying two is
 * asked about twice, and answering one leaves the other in the queue. `?passage=`
 * picks the first open suggestion on that passage, falling back to the first
 * open one anywhere — so after an answer the member lands on whatever is next.
 */
export type QueueCard = { evidenceId: string; passageId: string; state: string };

export function openSuggestions<T extends QueueCard>(cards: readonly T[]): T[] {
	return cards.filter((card) => card.state === 'suggested');
}

export function currentSuggestion<T extends QueueCard>(
	cards: readonly T[],
	passage: string | null
): T | null {
	const open = openSuggestions(cards);
	return open.find((card) => card.passageId === passage) ?? open[0] ?? null;
}
