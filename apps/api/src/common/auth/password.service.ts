import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Password hashing. Argon2id with OWASP-aligned parameters. Never bcrypt
 * (see CLAUDE.md). Login itself lands in M1; this service is the primitive it
 * builds on and is unit-tested here.
 */
@Injectable()
export class PasswordService {
  private readonly options: argon2.HashOptions = {
    type: argon2.argon2id,
    memoryCost: 19_456, // 19 MiB
    timeCost: 2,
    parallelism: 1,
  };

  hash(plain: string): Promise<string> {
    return argon2.hash(plain, this.options);
  }

  verify(hash: string, plain: string): Promise<boolean> {
    return argon2.verify(hash, plain);
  }
}
