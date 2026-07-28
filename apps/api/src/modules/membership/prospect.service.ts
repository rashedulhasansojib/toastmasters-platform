import { Injectable } from '@nestjs/common';
import type {
  CreateProspectRequest,
  Prospect,
  UpdateProspectRequest,
} from '@toastmasters/contracts';
import { ProspectRepository } from './prospect.repository';

/** CLAUDE.md §2 decision 4 (2026-07-29): prospect PII retention is 180 days from creation. */
export const PROSPECT_RETENTION_DAYS = 180;

export function computeDeleteAfter(from: Date): Date {
  const result = new Date(from);
  result.setUTCDate(result.getUTCDate() + PROSPECT_RETENTION_DAYS);
  return result;
}

@Injectable()
export class ProspectService {
  constructor(private readonly prospects: ProspectRepository) {}

  create(
    input: { orgUnitId: string; createdBy: string } & CreateProspectRequest,
  ): Promise<Prospect> {
    return this.prospects.create({
      ...input,
      deleteAfter: computeDeleteAfter(new Date()),
    });
  }

  list(orgUnitId: string): Promise<Prospect[]> {
    return this.prospects.findByClub(orgUnitId);
  }

  findById(id: string): Promise<Prospect | null> {
    return this.prospects.findById(id);
  }

  update(id: string, patch: UpdateProspectRequest): Promise<Prospect> {
    return this.prospects.update(id, patch);
  }
}
