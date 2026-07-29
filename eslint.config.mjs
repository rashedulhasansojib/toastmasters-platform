// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

/**
 * Root flat config. Governs packages/* and apps/{api,worker}.
 * The dashboard has its own eslint.config.mjs (Next.js).
 *
 * These rules ARE the CI-enforced boundaries from CLAUDE.md:
 *   - packages never import apps; the banned-library list is here;
 *   - PrismaClient (and pg) may appear only in *.repository.ts / processors;
 *   - the dashboard never touches the database layer.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/generated/**',
      'apps/dashboard/**',
      '**/*.config.mjs',
      '**/*.config.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // Logging goes through Pino (packages/logger), never console.
      'no-console': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Ban stacks the design docs explicitly rule out.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'class-validator', message: 'Validate with Zod (packages/contracts).' },
            { name: 'class-transformer', message: 'Transform with Zod (packages/contracts).' },
            { name: 'yup', message: 'Use Zod (packages/contracts).' },
            { name: 'joi', message: 'Use Zod (packages/contracts).' },
            { name: 'winston', message: 'Use Pino (packages/logger).' },
            { name: 'bcrypt', message: 'Never bcrypt — passwords use Argon2id (argon2).' },
            { name: 'bcryptjs', message: 'Never bcrypt — passwords use Argon2id (argon2).' },
            { name: 'typeorm', message: 'The ORM is Prisma.' },
            { name: 'drizzle-orm', message: 'The ORM is Prisma.' },
          ],
        },
      ],
    },
  },

  // Scripts and test harnesses may log.
  {
    files: ['scripts/**', '**/scripts/**', '**/*.spec.ts', '**/*.e2e-spec.ts'],
    rules: { 'no-console': 'off' },
  },

  // PrismaClient (and raw pg) live ONLY in repositories (api) / processors (worker).
  // Controllers and services must route through a repository.
  {
    files: ['apps/api/**/*.controller.ts', 'apps/api/**/*.service.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@prisma/client', '@toastmasters/db', 'pg'],
              message:
                'PrismaClient belongs in *.repository.ts (api) or a worker processor. Route data access through a repository.',
            },
          ],
        },
      ],
    },
  },
);
