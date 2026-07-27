import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

// Integration suite: real Postgres via Testcontainers. Long timeouts cover
// container pull + migrate on first run.
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
    include: ['test/**/*.int-spec.ts'],
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 180_000,
    fileParallelism: false, // one container at a time keeps CI memory predictable
  },
});
