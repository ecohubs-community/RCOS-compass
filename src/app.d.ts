import type { Logger } from 'pino';
import type { User } from '$lib/server/db/schema/auth';
import type { Community, Membership } from '$lib/server/db/schema/tenancy';
import type { Ctx } from '$lib/server/auth/guard';

declare global {
	namespace App {
		interface Locals {
			/** Correlates every log line for this request. Safe to show a user. */
			requestId: string;
			/** Request-scoped logger, already carrying requestId. */
			log: Logger;
			/** Who is making the request, or null. Never carries a community. */
			user: User | null;
			sessionId: string | null;
			/**
			 * Set by the tenant-scoped layout, from the URL slug. Absent outside
			 * `/c/[slug]`, which is why it is optional rather than nullable.
			 */
			community?: Community;
			membership?: Membership;
			/**
			 * The context every service takes, built once by the tenant layout so a
			 * page never assembles one from parts and never invents a community id.
			 */
			ctx?: Ctx;
		}
		interface Error {
			message: string;
			requestId?: string;
		}
	}
}

export {};
