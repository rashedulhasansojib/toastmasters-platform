/**
 * Fields Pino redacts from every log line. Sensitive data (credentials,
 * tokens, cookies) must never reach the logs. Extend this list as new
 * sensitive fields are introduced.
 */
export const redactPaths: string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.sessionToken',
  '*.secret',
];
