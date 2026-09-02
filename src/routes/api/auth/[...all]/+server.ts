import type { RequestHandler } from './$types';
import { getAuth } from '$lib/server/auth/auth';

/**
 * better-auth's own endpoints. docs/01-server-client-contract.md §2 allows this
 * as one of the few legitimate `+server.ts` surfaces.
 */
const handler: RequestHandler = ({ request }) => getAuth().handler(request);

export const GET = handler;
export const POST = handler;
