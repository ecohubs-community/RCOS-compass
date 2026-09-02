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
		// docs/00-architecture.md §10: configuration is read once, in one module,
		// and validated. Everywhere else reads the parsed config object.
		//
		// The exemptions are deliberately short and visible: the config module
		// itself, and the two tool configs that run outside the application (and so
		// cannot import it).
		files: ['**/*.ts', '**/*.js', '**/*.svelte'],
		ignores: [
			'src/lib/server/config.ts',
			'drizzle.config.ts',
			'playwright.config.ts',
			'playwright.gallery.config.ts'
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
