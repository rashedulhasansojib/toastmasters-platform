import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateGuestRequest, Guest, UpdateGuestRequest } from '@toastmasters/contracts';
import { GuestRepository } from './guest.repository';

/** CLAUDE.md §2 decision 4 (2026-07-29): guest PII retention is 180 days from creation. */
export const GUEST_RETENTION_DAYS = 180;

export function computeDeleteAfter(from: Date): Date {
  const result = new Date(from);
  result.setUTCDate(result.getUTCDate() + GUEST_RETENTION_DAYS);
  return result;
}

@Injectable()
export class GuestService {
  constructor(private readonly guests: GuestRepository) {}

  create(input: { orgUnitId: string; createdBy: string } & CreateGuestRequest): Promise<Guest> {
    return this.guests.create({
      ...input,
      deleteAfter: computeDeleteAfter(new Date()),
    });
  }

  list(orgUnitId: string): Promise<Guest[]> {
    return this.guests.findByClub(orgUnitId);
  }

  findById(id: string): Promise<Guest | null> {
    return this.guests.findById(id);
  }

  update(id: string, patch: UpdateGuestRequest): Promise<Guest> {
    return this.guests.update(id, patch);
  }

  /**
   * Manual counterpart to the nightly retention job — lets a VPM remove a
   * guest they added by mistake (or on request) before the 180-day timer
   * fires. Refuses once a guest has been converted: their identity now lives
   * on a Person, and person deletion is a separate flow.
   */
  async remove(id: string): Promise<void> {
    const guest = await this.guests.findById(id);
    if (!guest) throw new NotFoundException('Guest not found');
    if (guest.convertedToPersonId) {
      throw new ConflictException(
        'This guest has already been converted to a member — remove the member from the Users admin instead.',
      );
    }
    await this.guests.remove(id);
  }
}
