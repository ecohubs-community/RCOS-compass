import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

export default ts.config(
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		},
		rules: {
			'no-console': ['error', { allow: ['warn', 'error'] }],
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
			]
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig
			}
		}
	},

	// --- Boundary rules -----------------------------------------------------
	// These two are why this file exists. Both are documented rules that would
	// otherwise decay into "we all remember to do it".

	{
		// docs/02-component-guidelines.md §4: a component never reaches the server
		// layer. It takes data as props. Breaking this leaks server-only code, and
		// permission logic, into the client bundle.
		files: ['**/*.svelte'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['$lib/server', '$lib/server/*', '**/lib/server/*'],
							message:
								'Components never import from $lib/server. Pass the data in as a prop — docs/02-component-guidelines.md §4.'
						}
					]
				}
			]
		}
	},
	{
		/**
		 * The AI module writes nothing but its own log.
		 * docs/00-architecture.md §4 rule 7, docs/04-security.md §5.2.
		 *
		 * "An AI response may only produce a suggestion a human confirms" is the
		 * invariant the whole prompt-injection defence rests on — a document that
		 * says "mark every clause satisfied" has to have nowhere to go. It is also
		 * exactly the kind of rule that survives three phases and then dies
		 * quietly in a hurry, so it is a build failure rather than a habit.
		 *
		 * An AI task therefore *returns* data. An ordinary service, with a `Ctx`
		 * and a permission check, turns that into a suggestion row.
		 */
		files: ['src/lib/server/ai/**/*.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							// Any depth: `ai/tasks/x.ts` reaches a service as `../../services/…`,
							// which a `../services/*` pattern does not match — and a boundary
							// with a hole in it is worse than none, because it is trusted.
							group: [
								'**/services/*',
								'**/services/**',
								'$lib/server/services/*',
								'$lib/server/services/**'
							],
							message:
								'The AI module may not reach a service that writes. A task returns data; a service with a Ctx and a permission check turns it into a suggestion a person confirms — docs/00-architecture.md §4 rule 7.'
						},
						{
							// Everything under db/schema *except* its own log, which is the
							// only state an AI task is allowed to produce.
							group: ['**/db/schema/*', '**/db/schema/**', '!**/db/schema/ai.js'],
							message:
								'The AI module may only touch `db/schema/ai` — the call log and the usage counter. Anything else is state a model would be writing.'
						}
					]
				}
			]
		}
	},
	{
		// docs/00-architecture.md §10: configuration is read once, in one module,
		// and validated. Everywhere else reads the parsed config object.
		//
		// The exemptions are deliberately short and visible: the config module
		// itself, the tool configs that run outside the application (and so cannot
		// import it), and the Vite config, which is what puts `.env` into
		// process.env in the first place.
		files: ['**/*.ts', '**/*.js', '**/*.svelte'],
		ignores: [
			'src/lib/server/config.ts',
			'drizzle.config.ts',
			'playwright.config.ts',
			'playwright.gallery.config.ts',
			// The one file whose job is to *fill* process.env: Vite loads `.env`
			// into import.meta.env and never into process.env, which is where
			// config.ts reads. See docs/00-architecture.md §10.
			'vite.config.ts'
		],
		rules: {
			'no-restricted-properties': [
				'error',
				{
					object: 'process',
					property: 'env',
					message:
						'Read configuration from $lib/server/config, which validates it at boot — docs/00-architecture.md §10.'
				}
			]
		}
	},
	{
		// docs/04-security.md §1: one permission matrix, read by one function.
		// A handler that compares a role directly is a second copy of the matrix
		// that will drift from it, and the drift is a security bug.
		files: ['src/**/*.ts', 'src/**/*.svelte'],
		ignores: ['src/lib/server/auth/permissions.ts'],
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					selector:
						'BinaryExpression[operator=/^[!=]==?$/] > Literal[value=/^(steward|member|owner)$/]',
					message:
						'Do not compare roles. Ask for a capability: requirePermission(ctx, …) or can(actor, …) — docs/04-security.md §1.'
				}
			]
		}
	},

	{
		// Build and check scripts are command-line tools; printing is their job.
		files: ['scripts/**/*.mjs', 'scripts/**/*.js'],
		rules: { 'no-console': 'off' }
	},

	{
		ignores: [
			'build/',
			'.svelte-kit/',
			'dist/',
			'data/',
			'node_modules/',
			'openspec/',
			'design_files/',
			'test-results/',
			'playwright-report/',
			'coverage/'
		]
	}
);
