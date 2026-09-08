import type { Db } from '../../db/index.js';
import { feedbackAsMarkdown } from '../feedback.js';

/**
 * The pilot's open reports, as something a proposal starts from.
 * `docs/08-roadmap-mvp.md` P7, `docs/05-admin-console.md` §2.
 *
 * An admin service because the boundary test forbids a route reaching past
 * `services/admin` — and because what the console does here is narrow on
 * purpose: it exports, and it cannot edit, reply to, or delete a report. A
 * community's own screen is where a report is handled.
 */
export const openFeedbackAsMarkdown = (db: Db, now: number): string => feedbackAsMarkdown(db, now);
