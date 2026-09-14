import { page } from '$app/state';
import { formatCalendarDate, formatMoment, formatRelative, type MomentStyle } from './format.js';

/**
 * The formatter, bound to the page: the viewer's zone and the page's language
 * for moments, the community's zone for its calendar dates. Every value is read
 * when a function is called, so a component that calls it in markup re-renders
 * when the page's data changes.
 *
 * `timeZone`, `communityTimeZone` and `locale` come from the layouts
 * (`+layout.server.ts` at the root, per community and on public pages).
 */
export function useTime() {
	const context = () => ({
		timeZone: (page.data.timeZone as string | undefined) ?? 'UTC',
		locale: (page.data.locale as string | undefined) ?? 'en'
	});
	const community = () => ({
		timeZone:
			(page.data.communityTimeZone as string | undefined) ??
			(page.data.timeZone as string | undefined) ??
			'UTC',
		locale: context().locale
	});
	return {
		moment: (ms: number, style: MomentStyle = 'date') => formatMoment(ms, context(), style),
		date: (ms: number) => formatMoment(ms, context(), 'date'),
		dateShort: (ms: number) => formatMoment(ms, context(), 'dateShort'),
		dateLong: (ms: number) => formatMoment(ms, context(), 'dateLong'),
		dateTime: (ms: number) => formatMoment(ms, context(), 'dateTime'),
		deadline: (ms: number) => formatMoment(ms, context(), 'deadline'),
		calendarDate: (ms: number) => formatCalendarDate(ms, community()),
		relative: (ms: number, now: number) => formatRelative(ms, now, context().locale),
		/** The zone moments are shown in, for a sentence that says so. */
		zone: () => context().timeZone
	};
}
