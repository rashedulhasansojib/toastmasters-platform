import type { LoggerOptions } from 'pino';
import { redactPaths } from './redact';

export interface LoggerConfig {
  level?: string;
  /** Pretty-print (dev only). In prod we emit structured JSON. */
  pretty?: boolean;
}

/**
 * Build the shared Pino options used by both apps (via nestjs-pino).
 * Central place for redaction and transport policy.
 */
export function buildLoggerOptions(config: LoggerConfig = {}): LoggerOptions {
  const { level = 'info', pretty = false } = config;
  const options: LoggerOptions = {
    level,
    redact: { paths: redactPaths, censor: '[redacted]' },
  };
  if (pretty) {
    options.transport = {
      target: 'pino-pretty',
      options: { singleLine: true, colorize: true, translateTime: 'SYS:HH:MM:ss' },
    };
  }
  return options;
}

export { redactPaths } from './redact';
