import { systemClock } from '../clock.js';
import { getConfig } from '../config.js';
import { getDb } from '../db/index.js';
import { recordMailFailure } from '../services/errors.js';
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
	if (resolved) return resolved;
	// A test's transport is wrapped like the real one, so a suite can see a
	// failed send reach the record an operator reads.
	if (override) return (resolved = recordingFailures(override));

	const config = getConfig();
	resolved = recordingFailures(
		config.SMTP_URL.length > 0
			? smtpTransport({ url: config.SMTP_URL, from: config.MAIL_FROM })
			: unconfiguredTransport
	);
	return resolved;
}

/**
 * Every send, wrapped once, so a failure reaches the status page.
 *
 * At the transport rather than at each call site: there are three today and
 * there will be more, and a rule kept by whoever writes the fourth remembering
 * is not a rule. The message is rethrown unchanged — the caller still decides
 * what to tell the person waiting.
 */
function recordingFailures(transport: MailTransport): MailTransport {
	return {
		id: transport.id,
		async send(message) {
			try {
				await transport.send(message);
			} catch (problem) {
				try {
					recordMailFailure(getDb(), {
						kind: message.kind ?? 'unknown',
						communityId: message.communityId ?? null,
						subject: message.ref ?? null,
						error: problem,
						now: systemClock.now()
					});
				} catch {
					// Recording a failure must not become one. The throw below is what
					// the caller is waiting for.
				}
				throw problem;
			}
		}
	};
}

/** Test seam, for a suite that changes the environment. */
export function resetMailTransportForTests(): void {
	override = null;
	resolved = null;
}
