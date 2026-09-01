/**
 * Mail. docs/00-architecture.md §1 and UI spec §4.11.
 *
 * The rule that shapes this interface: **email carries a link and a subject,
 * never content.** Member-visible does not mean inbox-visible, and an inbox is
 * outside every visibility control the app has.
 */
export type Message = {
	to: string;
	subject: string;
	/** A short line plus a link. Not a definition body, not a discussion post. */
	text: string;
	url?: string;
};

export interface MailTransport {
	readonly id: string;
	send(message: Message): Promise<void>;
}

/** Captures messages in memory. The only transport any test uses. */
export function memoryTransport(): MailTransport & { sent: Message[] } {
	const sent: Message[] = [];
	return {
		id: 'memory',
		sent,
		send(message) {
			sent.push(message);
			return Promise.resolve();
		}
	};
}

/** Refuses to send, loudly, rather than pretending. Default when SMTP is unset. */
export const unconfiguredTransport: MailTransport = {
	id: 'unconfigured',
	send(message) {
		return Promise.reject(
			new Error(
				`No mail transport configured, so "${message.subject}" cannot be sent. ` +
					'Set SMTP_URL — invitations and digests depend on it.'
			)
		);
	}
};
