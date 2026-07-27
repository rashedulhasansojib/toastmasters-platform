/**
 * Conventional Commits, with the type/scope taxonomy from CLAUDE.md.
 * Enforced by the commit-msg hook and CI.
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'refactor', 'perf', 'test', 'docs', 'chore', 'build', 'ci'],
    ],
    'scope-enum': [
      2,
      'always',
      [
        'api',
        'worker',
        'dashboard',
        'contracts',
        'db',
        'logger',
        'config',
        'org',
        'identity',
        'access',
        'meeting',
        'education',
        'membership',
        'finance',
        'governance',
        'operations',
        'library',
        'quality',
        'support',
        'infra',
      ],
    ],
    'scope-empty': [2, 'never'],
  },
};
