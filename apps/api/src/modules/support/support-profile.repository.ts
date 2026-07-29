import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { SupportProfile, SupportLocation } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type SupportProfileRow = Awaited<ReturnType<PrismaClient['supportProfile']['upsert']>>;

function toSupportProfile(row: SupportProfileRow): SupportProfile {
  return {
    id: row.id,
    personId: row.personId,
    isDiscoverable: row.isDiscoverable,
    consentAt: row.consentAt?.toISOString() ?? null,
    consentVersion: row.consentVersion,
    locations: row.locations as unknown as SupportLocation[],
    availableRoles: row.availableRoles,
    mentorFor: row.mentorFor,
    maxTravelKm: row.maxTravelKm,
    blackoutDates: (row.blackoutDates as unknown as string[]).map((d) => d.slice(0, 10)),
  };
}

/** M8 Slice 5: system-design.md §17, FR-SUP-1. Opt-in, default false — set explicitly, never inferred. */
@Injectable()
export class SupportProfileRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async upsert(input: {
    personId: string;
    isDiscoverable: boolean;
    consentVersion?: string;
    locations: SupportLocation[];
    availableRoles: string[];
    mentorFor: string[];
    maxTravelKm?: number;
    blackoutDates: string[];
  }): Promise<SupportProfile> {
    const data = {
      personId: input.personId,
      isDiscoverable: input.isDiscoverable,
      consentAt: input.isDiscoverable ? new Date() : null,
      consentVersion: input.consentVersion,
      locations: input.locations,
      availableRoles: input.availableRoles,
      mentorFor: input.mentorFor,
      maxTravelKm: input.maxTravelKm,
      blackoutDates: input.blackoutDates,
    };
    const row = await this.db.supportProfile.upsert({
      where: { personId: input.personId },
      create: data,
      update: data,
    });
    return toSupportProfile(row);
  }

  async findByPerson(personId: string): Promise<SupportProfile | null> {
    const row = await this.db.supportProfile.findUnique({ where: { personId } });
    return row ? toSupportProfile(row) : null;
  }

  /**
   * `OrgUnit` carries no location of its own to match a requesting club
   * against (system-design.md never models club geolocation), so this
   * returns every discoverable volunteer for the role rather than a
   * distance-banded subset — a further scope cut beyond the plan doc's
   * geohash-prefix simplification, since there's no reference point to
   * band against at all. `SupportProfile.locations` still stores only
   * coarse geohashes (FR-SUP-2); nothing here exposes a precise location.
   */
  async findDiscoverableByRole(roleKey: string): Promise<SupportProfile[]> {
    const rows = await this.db.supportProfile.findMany({
      where: { isDiscoverable: true, availableRoles: { has: roleKey } },
    });
    return rows.map(toSupportProfile);
  }
}
