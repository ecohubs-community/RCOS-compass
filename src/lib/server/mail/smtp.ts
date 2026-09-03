import { createTransport, type Transporter } from 'nodemailer';
import type { MailTransport, Message } from './transport.js';

/**
 * SMTP, behind the transport interface. docs/00-architecture.md §1.
 *
 * nodemailer rather than a hand-written client: SMTP over TLS with AUTH is
 * security-sensitive plumbing that is not this project's problem to solve, and
 * the library has no runtime dependencies of its own.
 *
 * Plain text only, deliberately. There is no HTML body to get wrong, no tracking
 * pixel to explain to a community that asked where its data goes, and nothing
 * for a mail client to render differently from what the sender intended.
 */

export type SmtpOptions = {
	/** A URL: `smtps://user:pass@host:465` or `smtp://host:1025` for a catcher. */
	url: string;
	/** The `From` header. */
	from: string;
};

/**
 * The transporter is created once and reused, so a burst of invitations shares
 * one connection pool rather than opening a socket per message.
 */
export function smtpTransport(options: SmtpOptions): MailTransport {
	let transporter: Transporter | null = null;

	const connect = (): Transporter => {
		transporter ??= createTransport(options.url, { from: options.from });
		return transporter;
	};

	return {
		id: 'smtp',
		async send(message: Message): Promise<void> {
			await connect().sendMail({
				from: options.from,
				to: message.to,
				subject: message.subject,
				text: message.text
			});
		}
	};
}
