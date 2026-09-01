import { getConfig } from '../config.js';
import { unconfiguredTransport, type MailTransport } from './transport.js';

export * from './transport.js';

let override: MailTransport | null = null;

/** Test seam. Application code never calls this. */
export function setMailTransportForTests(transport: MailTransport | null): void {
	override = transport;
}

export function getMailTransport(): MailTransport {
	if (override) return override;
	// The SMTP adapter lands in P2 with invitations. Until then every path
	// refuses, which is honest; a silent no-op would not be.
	void getConfig();
	return unconfiguredTransport;
}
