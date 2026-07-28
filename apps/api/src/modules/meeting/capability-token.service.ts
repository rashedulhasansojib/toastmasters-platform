import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { CapabilityTokenIssued, CapabilityTokenVerification } from '@toastmasters/contracts';
import { CapabilityTokenRepository } from './capability-token.repository';

const DEFAULT_TTL_MINUTES = 240; // one meeting's worth, roughly — a club meeting rarely runs past 4h
const MAX_TTL_MINUTES = 720;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** M3 Slice 6: roadmap.md's guest capability-token primitive — hashed, expiring, revocable. */
@Injectable()
export class CapabilityTokenService {
  constructor(private readonly tokens: CapabilityTokenRepository) {}

  async issue(input: {
    meetingId: string;
    purpose: string;
    ttlMinutes?: number;
    actorId: string;
  }): Promise<CapabilityTokenIssued> {
    const ttlMinutes = Math.min(input.ttlMinutes ?? DEFAULT_TTL_MINUTES, MAX_TTL_MINUTES);
    const rawToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    const row = await this.tokens.create({
      meetingId: input.meetingId,
      purpose: input.purpose,
      tokenHash: hashToken(rawToken),
      expiresAt,
      createdBy: input.actorId,
    });

    return {
      id: row.id,
      meetingId: row.meetingId,
      purpose: row.purpose,
      token: rawToken,
      expiresAt: row.expiresAt.toISOString(),
    };
  }

  async revoke(id: string): Promise<void> {
    await this.tokens.revoke(id);
  }

  async verify(rawToken: string): Promise<CapabilityTokenVerification> {
    const row = await this.tokens.findByHash(hashToken(rawToken));
    if (!row || row.revokedAt || row.expiresAt < new Date()) {
      return { valid: false, meetingId: null, purpose: null };
    }
    return { valid: true, meetingId: row.meetingId, purpose: row.purpose };
  }

  /**
   * M4 Slice 10: same validity check as `verify()`, but returns the full row
   * (notably `createdBy`, the issuing officer) for callers that need more
   * than the narrow public `CapabilityTokenVerification` contract shape —
   * e.g. attributing a publicly-submitted `Prospect.createdBy` to the
   * officer who opened that guest-registration channel.
   */
  async findValid(
    rawToken: string,
  ): Promise<{ id: string; meetingId: string; purpose: string; createdBy: string } | null> {
    const row = await this.tokens.findByHash(hashToken(rawToken));
    if (!row || row.revokedAt || row.expiresAt < new Date()) return null;
    return { id: row.id, meetingId: row.meetingId, purpose: row.purpose, createdBy: row.createdBy };
  }
}
