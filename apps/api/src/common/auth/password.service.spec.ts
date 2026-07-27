import { describe, it, expect } from 'vitest';
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();
  const secret = 'correct horse battery staple';

  it('produces an argon2id hash and verifies the original password', async () => {
    const hash = await service.hash(secret);
    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(service.verify(hash, secret)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await service.hash(secret);
    await expect(service.verify(hash, 'Tr0ubadour&3')).resolves.toBe(false);
  });
});
