import { describe, expect, it } from 'vitest';
import { contactLinks } from '../../src/lib/components/landing/contact.js';

describe('the landing page contact links', () => {
	it('write to CONTACT_EMAIL, the request carrying its subject line', () => {
		const links = contactLinks('pilot@example.org', 'Pilot access for our community');
		expect(links.contactHref).toBe('mailto:pilot@example.org');
		expect(links.requestHref).toBe(
			'mailto:pilot@example.org?subject=Pilot%20access%20for%20our%20community'
		);
	});

	it('do not exist without an address, rather than opening a draft to nobody', () => {
		expect(contactLinks('', 'anything')).toEqual({ contactHref: null, requestHref: null });
		expect(contactLinks('   ', 'anything')).toEqual({ contactHref: null, requestHref: null });
	});

	it('cannot be turned into extra mail headers by the subject', () => {
		const { requestHref } = contactLinks('pilot@example.org', 'Hi&bcc=someone@example.org');
		expect(requestHref).toBe('mailto:pilot@example.org?subject=Hi%26bcc%3Dsomeone%40example.org');
	});
});
