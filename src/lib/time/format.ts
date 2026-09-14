/**
 * Dates and times, as a person reads them. `openspec/changes/local-time`.
 *
 * The one place a moment becomes text. Every call names its zone and its
 * locale, so the server rendering a page and the browser hydrating it write the
 * same characters — the ad-hoc `toLocaleDateString('en-GB')` calls this
 * replaced formatted in the server's zone first and the browser's second.
 *
 * Three rules (design.md "Three rules"):
 * 1. a **moment** is shown in the viewer's zone — `formatMoment`;
 * 2. a **calendar date** a community set is shown in the community's zone, so
 *    it is the same date for everybody — `formatCalendarDate`;
 * 3. a community's own periods stay in its zone (`decisionYear`, budget days).
 */

export type MomentStyle =
	/** 1 Mar 2026 */
	| 'date'
	/** 1 March 2026 */
	| 'dateLong'
	/** 1 Mar */
	| 'dateShort'
	/** 1 Mar 2026, 18:00 */
	| 'dateTime'
	/** 1 Mar, 18:00 */
	| 'dateTimeShort'
	/** 18:00 */
	| 'time'
	/** 1 Mar 2026, 18:00 WEST — a time somebody must act before names its zone. */
	| 'deadline';

const OPTIONS: Record<MomentStyle, Intl.DateTimeFormatOptions> = {
	date: { day: 'numeric', month: 'short', year: 'numeric' },
	dateLong: { day: 'numeric', month: 'long', year: 'numeric' },
	dateShort: { day: 'numeric', month: 'short' },
	dateTime: { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' },
	dateTimeShort: { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' },
	time: { hour: '2-digit', minute: '2-digit' },
	deadline: {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		timeZoneName: 'short'
	}
};

export type TimeContext = { timeZone: string; locale: string };

/**
 * The interface's `en` is British English in its dates — day before month, as
 * every screen wrote them before this module existed. The other locales are
 * already regional enough.
 */
const intlLocale = (locale: string) => (locale === 'en' ? 'en-GB' : locale);

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(style: MomentStyle, { timeZone, locale }: TimeContext): Intl.DateTimeFormat {
	const key = `${locale}|${timeZone}|${style}`;
	let found = formatters.get(key);
	if (!found) {
		found = new Intl.DateTimeFormat(intlLocale(locale), {
			...OPTIONS[style],
			timeZone,
			hourCycle: 'h23'
		});
		formatters.set(key, found);
	}
	return found;
}

/** A moment in the viewer's zone. */
export function formatMoment(
	ms: number,
	context: TimeContext,
	style: MomentStyle = 'date'
): string {
	return formatter(style, context).format(new Date(ms));
}

/**
 * A calendar date a community set, shown in the community's zone. The same
 * function as `formatMoment`, named apart so a call site says which rule it
 * follows — and so passing the viewer's zone here reads as the mistake it is.
 */
export function formatCalendarDate(
	ms: number,
	community: TimeContext,
	style: Extract<MomentStyle, 'date' | 'dateLong' | 'dateShort'> = 'date'
): string {
	return formatter(style, community).format(new Date(ms));
}

const relative = new Map<string, Intl.RelativeTimeFormat>();

/**
 * "2 hours ago", from a `now` the caller passes — the load's server time, so
 * the server and the browser agree on the words.
 */
export function formatRelative(ms: number, now: number, locale: string): string {
	let found = relative.get(locale);
	if (!found) {
		found = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: 'auto' });
		relative.set(locale, found);
	}
	const seconds = Math.round((ms - now) / 1000);
	const steps: [Intl.RelativeTimeFormatUnit, number][] = [
		['second', 60],
		['minute', 60],
		['hour', 24],
		['day', 7],
		['week', 4.35],
		['month', 12],
		['year', Infinity]
	];
	let value = seconds;
	for (const [unit, size] of steps) {
		if (Math.abs(value) < size) return found.format(Math.round(value), unit);
		value /= size;
	}
	return found.format(Math.round(value), 'year');
}

/**
 * The UTC instant of midnight at the start of a calendar day in a zone —
 * `2026-03-01` in `Europe/Lisbon`. A review date is stored this way (rule 2).
 *
 * Found by guessing UTC midnight, asking `Intl` what wall-clock time that is in
 * the zone, and correcting by the difference; a second pass settles the rare
 * day whose offset changes between the guess and the answer (a DST change).
 */
export function localMidnight(isoDate: string, timeZone: string): number | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
	if (!match) return null;
	const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
	const target = Date.UTC(year, month - 1, day);
	if (new Date(target).getUTCDate() !== day) return null;

	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hourCycle: 'h23'
	});
	const wallClock = (at: number) => {
		const got = Object.fromEntries(parts.formatToParts(new Date(at)).map((p) => [p.type, p.value]));
		return Date.UTC(
			Number(got.year),
			Number(got.month) - 1,
			Number(got.day),
			Number(got.hour),
			Number(got.minute),
			Number(got.second)
		);
	};

	let guess = target - (wallClock(target) - target);
	guess = guess - (wallClock(guess) - target);
	return guess;
}

/**
 * `YYYY-MM-DD` for the day a moment falls on in a zone — the archival form an
 * export writes, computed on the community's calendar rather than on UTC's, so
 * a decision recorded late on 1 March in Lisbon is not filed under 2 March.
 */
export function isoDateIn(ms: number, timeZone: string): string {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat('en-CA', {
			timeZone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		})
			.formatToParts(new Date(ms))
			.map((part) => [part.type, part.value])
	);
	return `${parts.year}-${parts.month}-${parts.day}`;
}
