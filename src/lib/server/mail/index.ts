import { getConfig } from '../config.js';
import { smtpTransport } from './smtp.js';
import { unconfiguredTransport, type MailTransport } from './transport.js';

export * from './transport.js';
export * from './messages.js';

let override: MailTransport | null = null;
let resolved: MailTransport | null = null;

/** Test seam. Application code never calls this. */
export function setMailTransportForTests(transport: MailTransport | null): void {
	override = transport;
	resolved = null;
}

/**
 * The configured transport, or one that refuses loudly.
 *
 * An unset `SMTP_URL` is not treated as "mail is off": invitations and
 * verification links are the only way into the application, so a silent no-op
 * would leave a steward watching an invitation that was never sent. The
 * unconfigured transport throws, and the caller says so.
 */
export function getMailTransport(): MailTransport {
	if (override) return override;
	if (resolved) return resolved;

	const config = getConfig();
	resolved =
		config.SMTP_URL.length > 0
			? smtpTransport({ url: config.SMTP_URL, from: config.MAIL_FROM })
			: unconfiguredTransport;
	return resolved;
}

/** Test seam, for a suite that changes the environment. */
export function resetMailTransportForTests(): void {
	override = null;
	resolved = null;
}
