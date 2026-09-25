import { describe, expect, it } from 'vitest';
import { mentionsToNames, namesToMentions } from '../../src/lib/shared/mentions.js';

const members = [
	{ token: '@M-0001', label: 'Ana Restrepo' },
	{ token: '@M-0002', label: 'Lena Vogt' },
	{ token: '@M-0003', label: 'Ana' },
	{ token: '@M-0004', label: 'Tomás Herrera' },
	{ token: '@M-0005', label: 'Sam' },
	{ token: '@M-0006', label: 'Sam' }
];

describe('a mention is written as a name and kept as a number', () => {
	it('turns a name into the number of the one member who carries it', () => {
		expect(namesToMentions('Over to you @Lena Vogt.', members)).toBe('Over to you @M-0002.');
	});

	it('reads the longest name, so "@Ana Restrepo" is not "@Ana" and some text', () => {
		expect(namesToMentions('@Ana Restrepo and @Ana', members)).toBe('@M-0001 and @M-0003');
	});

	it('matches regardless of case and keeps accents', () => {
		expect(namesToMentions('cc @tomás herrera', members)).toBe('cc @M-0004');
	});

	it('leaves a name two members share as text, rather than telling the wrong one', () => {
		expect(namesToMentions('@Sam, can you?', members)).toBe('@Sam, can you?');
	});

	it('leaves an address and a name run into a word alone', () => {
		expect(namesToMentions('mail ana@Lena Vogt.org or @Lena Vogtish', members)).toBe(
			'mail ana@Lena Vogt.org or @Lena Vogtish'
		);
	});

	it('leaves a number that was typed as a number', () => {
		expect(namesToMentions('@M-0002 said so', members)).toBe('@M-0002 said so');
	});

	it('turns numbers back into names for an edit box, and back again unchanged', () => {
		const stored = 'Ask @M-0002 and @M-0001, not @M-0099.';
		const shown = mentionsToNames(stored, members);
		expect(shown).toBe('Ask @Lena Vogt and @Ana Restrepo, not @M-0099.');
		expect(namesToMentions(shown, members)).toBe(stored);
	});

	it('keeps the number of a member whose name is shared, so saving keeps the mention', () => {
		expect(mentionsToNames('@M-0005', members)).toBe('@M-0005');
	});
});
