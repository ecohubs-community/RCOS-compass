import * as v from 'valibot';
import * as m from '$lib/paraglide/messages';

/**
 * Shapes for the authentication forms. docs/01-server-client-contract.md §1:
 * one schema per intent, shared between the action that enforces it and the
 * tests that probe it, so the two cannot disagree.
 *
 * These describe *form* input only. Whether the credentials are correct is
 * better-auth's question, not this file's — and the answer it gives is
 * deliberately the same for a wrong password and an address with no account.
 *
 * Messages are functions, as in `invitations.ts`: Valibot calls them while
 * parsing, inside the request, so they come out in the language the request is
 * answered in — the browser's on the sign-in screens, the community's elsewhere.
 */

const email = v.pipe(
	v.string(() => m.auth_error_email_missing()),
	v.trim(),
	v.toLowerCase(),
	v.email(() => m.auth_error_email_invalid()),
	v.maxLength(320, () => m.auth_error_email_long())
);

export const signInSchema = v.object({
	email,
	// No length rule on sign-in: the minimum belongs to sign-up, and applying it
	// here would tell an attacker which passwords are too short to be real.
	password: v.pipe(
		v.string(() => m.auth_error_password_missing()),
		v.minLength(1, () => m.auth_error_password_missing())
	)
});

/**
 * A six-digit TOTP code. Authenticator apps display it grouped ("123 456") and
 * people paste it that way, so spaces and hyphens are removed before the shape
 * is checked rather than being rejected as a typo.
 */
export const totpCodeSchema = v.pipe(
	v.string(() => m.auth_error_code_missing()),
	v.transform((value) => value.replace(/[\s-]/g, '')),
	v.regex(/^\d{6}$/, () => m.auth_error_code_shape())
);

/**
 * A recovery code. Longer and alphanumeric; the only way back in when the phone
 * is gone, so it is worth accepting in whatever case and spacing it was written
 * down in.
 */
export const backupCodeSchema = v.pipe(
	v.string(() => m.auth_error_recovery_missing()),
	v.trim(),
	v.minLength(6, () => m.auth_error_recovery_invalid()),
	v.maxLength(64, () => m.auth_error_recovery_invalid())
);

/** Re-authentication before a change to the second factor. */
export const passwordSchema = v.pipe(
	v.string(() => m.auth_error_password_missing()),
	v.minLength(1, () => m.auth_error_password_missing()),
	v.maxLength(200)
);

export type SignIn = v.InferOutput<typeof signInSchema>;

/**
 * The first message for a failed parse, keyed by field, in the shape the actions
 * return and the pages render.
 */
export function fieldErrors(issues: readonly v.BaseIssue<unknown>[]): Record<string, string> {
	const errors: Record<string, string> = {};
	for (const issue of issues) {
		const key = issue.path?.map((p) => String(p.key)).join('.') ?? 'form';
		errors[key] ??= issue.message;
	}
	return errors;
}
