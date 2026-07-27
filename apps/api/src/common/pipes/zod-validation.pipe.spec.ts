import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

const schema = z.object({ name: z.string().min(1), age: z.coerce.number().int() });

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(schema);

  it('returns parsed, coerced data for valid input', () => {
    expect(pipe.transform({ name: 'Ada', age: '36' })).toEqual({ name: 'Ada', age: 36 });
  });

  it('throws BadRequestException for invalid input', () => {
    expect(() => pipe.transform({ name: '', age: 'x' })).toThrow(BadRequestException);
  });

  it('reports the failing field paths', () => {
    try {
      pipe.transform({ age: 'x' });
      throw new Error('expected pipe to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as {
        issues: { path: string }[];
      };
      const paths = response.issues.map((i) => i.path);
      expect(paths).toContain('name');
      expect(paths).toContain('age');
    }
  });
});
