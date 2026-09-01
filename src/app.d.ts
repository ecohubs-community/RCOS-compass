import type { Logger } from 'pino';

declare global {
	namespace App {
		interface Locals {
			/** Correlates every log line for this request. Safe to show a user. */
			requestId: string;
			/** Request-scoped logger, already carrying requestId. */
			log: Logger;
		}
		interface Error {
			message: string;
			requestId?: string;
		}
	}
}

export {};
