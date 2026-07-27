import { describe, it, expect } from 'vitest';
import { paginationQuerySchema, idParamSchema, healthResponseSchema } from './common';

describe('paginationQuerySchema', () => {
  it('defaults page and pageSize', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  });

  it('coerces string query values', () => {
    expect(paginationQuerySchema.parse({ page: '3', pageSize: '50' })).toEqual({
      page: 3,
      pageSize: 50,
    });
  });

  it('rejects a pageSize above the ceiling', () => {
    expect(paginationQuerySchema.safeParse({ pageSize: 500 }).success).toBe(false);
  });
});

describe('idParamSchema', () => {
  it('accepts a UUID', () => {
    const id = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    expect(idParamSchema.parse({ id })).toEqual({ id });
  });

  it('rejects a non-UUID', () => {
    expect(idParamSchema.safeParse({ id: 'nope' }).success).toBe(false);
  });
});

describe('healthResponseSchema', () => {
  it('accepts a well-formed payload', () => {
    const payload = { status: 'ok', uptime: 12.3, timestamp: new Date().toISOString() };
    expect(healthResponseSchema.parse(payload)).toEqual(payload);
  });

  it('rejects a bad status literal', () => {
    expect(
      healthResponseSchema.safeParse({
        status: 'down',
        uptime: 1,
        timestamp: new Date().toISOString(),
      }).success,
    ).toBe(false);
  });
});
