import * as v from 'valibot';

/**
 * Shapes for the authentication forms. docs/01-server-client-contract.md §1:
 * one schema per intent, shared between the action that enforces it and the
 * tests that probe it, so the two cannot disagree.
 *
 * These describe *form* input only. Whether the credentials are correct is
 * better-auth's question, not this file's — and the answer it gives is
 * deliberately the same for a wrong password and an address with no account.
 */

const email = v.pipe(
	v.string('Enter your email address.'),
	v.trim(),
	v.toLowerCase(),
	v.email('That does not look like an email address.'),
	v.maxLength(320, 'That address is too long.')
);

export const signInSchema = v.object({
	email,
	// No length rule on sign-in: the minimum belongs to sign-up, and applying it
	// here would tell an attacker which passwords are too short to be real.
	password: v.pipe(v.string('Enter your password.'), v.minLength(1, 'Enter your password.'))
});

/**
 * A six-digit TOTP code. Authenticator apps display it grouped ("123 456") and
 * people paste it that way, so spaces and hyphens are removed before the shape
 * is checked rather than being rejected as a typo.
 */
export const totpCodeSchema = v.pipe(
	v.string('Enter the six-digit code.'),
	v.transform((value) => value.replace(/[\s-]/g, '')),
	v.regex(/^\d{6}$/, 'Enter the six-digit code from your authenticator app.')
);

/**
 * A recovery code. Longer and alphanumeric; the only way back in when the phone
 * is gone, so it is worth accepting in whatever case and spacing it was written
 * down in.
 */
export const backupCodeSchema = v.pipe(
	v.string('Enter a recovery code.'),
	v.trim(),
	v.minLength(6, 'That is not a recovery code.'),
	v.maxLength(64, 'That is not a recovery code.')
);

/** Re-authentication before a change to the second factor. */
export const passwordSchema = v.pipe(
	v.string('Enter your password.'),
	v.minLength(1, 'Enter your password.'),
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
