import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

// SWC transforms the TS so NestJS decorator metadata (design:paramtypes) is
// emitted — Vitest's default esbuild transform drops it and breaks DI.
export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: 'es2022',
      },
    }),
  ],
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // The 80% gate (CLAUDE.md §7) covers every domain module and cross-
      // cutting concern that currently has a spec. New modules join this
      // list in the same commit as their first spec — never later. Modules
      // still missing tests (M3 slices 8–12 and M4 slices 2–10 per their
      // plan docs) are deliberately absent so the gate stays honest until
      // those suites land.
      include: [
        'src/common/auth/**/*.ts',
        'src/common/authz/**/*.ts',
        'src/common/pipes/**/*.ts',
        'src/health/**/*.ts',
        'src/modules/access/unit-policy.service.ts',
        'src/modules/identity/invitation.service.ts',
        'src/modules/identity/invitation-rate-limiter.service.ts',
        'src/modules/membership/prospect.service.ts',
        'src/modules/org/org.service.ts',
      ],
      exclude: [
        '**/*.spec.ts',
        '**/*.e2e-spec.ts',
        '**/*.module.ts',
        '**/*.decorator.ts',
        '**/*.token.ts',
        '**/*.types.ts',
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
