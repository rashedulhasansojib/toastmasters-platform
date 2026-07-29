import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { SupportRequest, SupportInvitee, MeetingRoleKey } from '@toastmasters/contracts';
import { MeetingRoleAssignmentRepository } from '../meeting/meeting-role-assignment.repository';
import { ClubMembershipRepository } from '../identity/club-membership.repository';
import { SupportProfileRepository } from './support-profile.repository';
import { SupportRequestRepository } from './support-request.repository';

/**
 * M8 Slice 5: system-design.md §17, FR-SUP-3. An accepted invite creates a
 * `cross_club` MeetingRoleAssignment (M3) — function-scoped for that
 * meeting only. No EducationRecord write ever happens from this path, so
 * the external member earns no education credit (TI credit is club-scoped).
 */
@Injectable()
export class SupportRequestService {
  constructor(
    private readonly requests: SupportRequestRepository,
    private readonly profiles: SupportProfileRepository,
    private readonly meetingRoleAssignments: MeetingRoleAssignmentRepository,
    private readonly clubMemberships: ClubMembershipRepository,
  ) {}

  async create(input: {
    requestingUnitId: string;
    meetingId: string;
    roleKey: string;
    neededBy: Date;
  }): Promise<SupportRequest> {
    const candidates = await this.profiles.findDiscoverableByRole(input.roleKey);
    const invitees: SupportInvitee[] = candidates.map((c) => ({
      personId: c.personId,
      invitedAt: new Date().toISOString(),
      response: 'pending',
      respondedAt: null,
    }));
    return this.requests.create({ ...input, invitees });
  }

  list(requestingUnitId: string): Promise<SupportRequest[]> {
    return this.requests.findByClub(requestingUnitId);
  }

  async respond(
    id: string,
    personId: string,
    response: 'accepted' | 'declined',
  ): Promise<SupportRequest> {
    const request = await this.requests.findById(id);
    if (!request) throw new NotFoundException('Support request not found');
    const invitee = request.invitees.find((i) => i.personId === personId);
    if (!invitee) throw new BadRequestException('Not an invitee on this request');

    const invitees = request.invitees.map((i) =>
      i.personId === personId ? { ...i, response, respondedAt: new Date().toISOString() } : i,
    );
    const updated = await this.requests.updateInvitees(id, invitees);

    if (response === 'accepted') {
      const memberships = await this.clubMemberships.findByPerson(personId);
      const homeClub = memberships.find((m) => m.isPrimary) ?? memberships[0];
      if (!homeClub)
        throw new BadRequestException('Volunteer has no club membership to attribute as home club');

      await this.meetingRoleAssignments.create({
        meetingId: request.meetingId,
        roleKey: request.roleKey as MeetingRoleKey,
        assignee: { kind: 'cross_club', personId, homeClubUnitId: homeClub.clubUnitId },
      });
      return this.requests.setStatus(id, 'filled');
    }
    return updated;
  }
}
