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
      // Gate the domain logic; DI wiring (modules, guards, filters, adapters)
      // is exercised by the e2e suite instead.
      include: [
        'src/common/authz/evaluate.ts',
        'src/common/authz/authz.service.ts',
        'src/common/auth/password.service.ts',
        'src/common/pipes/zod-validation.pipe.ts',
        'src/health/health.service.ts',
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
