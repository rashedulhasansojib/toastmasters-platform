/**
 * Fields Pino redacts from every log line. `restricted` resources
 * (finance.ledger, education.evaluation, membership.health_signal,
 * platform.audit) MUST NOT appear in log payloads — CLAUDE.md §6.
 *
 * Wildcards match one level deep (Pino syntax): `*.foo` matches
 * `{ x: { foo: … } }` but not `{ x: { y: { foo: … } } }`. Where a
 * sensitive value can be nested arbitrarily (audit payloads, request
 * bodies), keep it inside a scalar Json field like `metadata` so a
 * single path catches it.
 *
 * Extend this list in the same commit as any new sensitive field.
 */
export const redactPaths: string[] = [
  // Transport-layer credentials
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',

  // Credentials / tokens
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.sessionToken',
  '*.secret',
  // Capability-token hashes / TI numbers are identifying — treat as PII
  '*.tokenHash',
  '*.tiMemberNumber',

  // Guest / Person PII (CLAUDE.md §2 decision 4 lists these six)
  '*.fullName',
  '*.phone',
  '*.whatsapp',
  '*.bio',
  '*.photoUrl',
  // `email` deliberately not redacted — used as the login identifier and
  // appears in structured logs for support triage. Reconsider if it starts
  // showing up in restricted-resource payloads.

  // finance.ledger — restricted resource
  '*.amount',
  '*.counterpartyRef',
  '*.counterpartyLabel',
  '*.receiptUrl',

  // education.evaluation — restricted resource (free-text feedback + media)
  '*.formExcelledAt',
  '*.formWorkOn',
  '*.formChallengeYourself',
  '*.formScales',
  '*.audioUrl',
  '*.scanUrl',
  '*.metricsSnapshot',

  // Ballots / votes — voter↔candidate linkage (system-design.md §9.4)
  '*.voterHash',
  '*.candidatePersonId',
  '*.tallyResult',

  // platform.audit — arbitrary JSON payloads land here
  '*.metadata',
];
