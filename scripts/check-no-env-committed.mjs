#!/usr/bin/env node
/**
 * Guard: never commit a real .env (only .env.example is allowed).
 * Runs in the pre-commit hook.
 */
import { execSync } from 'node:child_process';

let staged = '';
try {
  staged = execSync('git diff --cached --name-only', { encoding: 'utf8' });
} catch {
  process.exit(0);
}

const offenders = staged
  .split('\n')
  .map((f) => f.trim())
  .filter(Boolean)
  .filter((f) => {
    const base = f.split('/').pop() ?? f;
    return /^\.env(\.|$)/.test(base) && base !== '.env.example';
  });

if (offenders.length > 0) {
  console.error('\n✖ Refusing to commit environment files:');
  for (const f of offenders) console.error(`    ${f}`);
  console.error('\nSecrets belong in your local .env (gitignored), not in git.\n');
  process.exit(1);
}
process.exit(0);
