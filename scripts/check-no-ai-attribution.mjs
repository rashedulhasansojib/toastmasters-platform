#!/usr/bin/env node
/**
 * Guard: commits must never be attributed to an AI assistant.
 * (CLAUDE.md, Non-negotiable git identity rule.)
 *
 * Usage:
 *   node scripts/check-no-ai-attribution.mjs --msg <commit-msg-file>   # commit-msg hook
 *   node scripts/check-no-ai-attribution.mjs --staged                  # pre-commit hook
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const FORBIDDEN = [
  /co-authored-by:.*(claude|anthropic)/i,
  /generated\s+with\s+.*claude/i,
  /\bclaude\s+code\b/i,
  /\bany\s+ai\b/i,
  /🤖/,
  /authored\s+by\s+(claude|anthropic|an?\s*ai)/i,
];

function fail(where, line) {
  console.error(`\n✖ AI attribution is not allowed (${where}):`);
  console.error(`    ${line.trim()}`);
  console.error('\nRemove the attribution. Commits use the human author only.\n');
  process.exit(1);
}

const mode = process.argv[2];

if (mode === '--msg') {
  const file = process.argv[3];
  if (!file) process.exit(0);
  const msg = readFileSync(file, 'utf8');
  for (const line of msg.split('\n')) {
    if (FORBIDDEN.some((re) => re.test(line))) fail('commit message', line);
  }
  process.exit(0);
}

if (mode === '--staged') {
  let diff = '';
  try {
    diff = execSync('git diff --cached --unified=0', { encoding: 'utf8' });
  } catch {
    process.exit(0);
  }
  for (const line of diff.split('\n')) {
    if (!line.startsWith('+')) continue;
    if (FORBIDDEN.some((re) => re.test(line))) fail('staged change', line.slice(1));
  }
  process.exit(0);
}

process.exit(0);
