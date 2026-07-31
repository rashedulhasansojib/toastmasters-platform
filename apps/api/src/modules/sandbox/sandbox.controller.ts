import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  createSandboxAgendaItemRequestSchema,
  createSandboxGuestRequestSchema,
  createSandboxMeetingRequestSchema,
  createSandboxMemberRequestSchema,
  createSandboxPlannerEntryRequestSchema,
  updateSandboxGuestRequestSchema,
  type CreateSandboxAgendaItemRequest,
  type CreateSandboxGuestRequest,
  type CreateSandboxMeetingRequest,
  type CreateSandboxMemberRequest,
  type CreateSandboxPlannerEntryRequest,
  type SandboxAgendaItem,
  type SandboxEducationRecord,
  type SandboxGuest,
  type SandboxMeeting,
  type SandboxMember,
  type SandboxPlannerEntry,
  type UpdateSandboxGuestRequest,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { SandboxGuard } from './sandbox.guard';
import { SandboxService } from './sandbox.service';

/**
 * The demo-signup sandbox (platform dashboard QR/link). Authentication-only
 * routes gated by SandboxGuard, not @ResourceScope/authorize() — there is no
 * org unit here to authorize against. Every read and write below is confined
 * to SandboxService's in-memory working copy; nothing reaches Prisma.
 */
@Controller('sandbox')
@UseGuards(SandboxGuard)
export class SandboxController {
  constructor(private readonly sandbox: SandboxService) {}

  @Get('members')
  listMembers(@CurrentUser() principal: Principal): SandboxMember[] {
    return this.sandbox.listMembers(principal.userId);
  }

  @Post('members')
  createMember(
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(createSandboxMemberRequestSchema)) body: CreateSandboxMemberRequest,
  ): SandboxMember {
    return this.sandbox.createMember(principal.userId, body);
  }

  @Get('meetings')
  listMeetings(@CurrentUser() principal: Principal): SandboxMeeting[] {
    return this.sandbox.listMeetings(principal.userId);
  }

  @Post('meetings')
  createMeeting(
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(createSandboxMeetingRequestSchema))
    body: CreateSandboxMeetingRequest,
  ): SandboxMeeting {
    return this.sandbox.createMeeting(principal.userId, body);
  }

  @Post('meetings/:meetingId/agenda-items')
  addAgendaItem(
    @CurrentUser() principal: Principal,
    @Param('meetingId') meetingId: string,
    @Body(new ZodValidationPipe(createSandboxAgendaItemRequestSchema))
    body: CreateSandboxAgendaItemRequest,
  ): SandboxAgendaItem {
    return this.sandbox.addAgendaItem(principal.userId, meetingId, body);
  }

  @Get('planner')
  listPlanner(@CurrentUser() principal: Principal): SandboxPlannerEntry[] {
    return this.sandbox.listPlanner(principal.userId);
  }

  @Post('planner')
  createPlannerEntry(
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(createSandboxPlannerEntryRequestSchema))
    body: CreateSandboxPlannerEntryRequest,
  ): SandboxPlannerEntry {
    return this.sandbox.createPlannerEntry(principal.userId, body);
  }

  @Get('guests')
  listGuests(@CurrentUser() principal: Principal): SandboxGuest[] {
    return this.sandbox.listGuests(principal.userId);
  }

  @Post('guests')
  createGuest(
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(createSandboxGuestRequestSchema)) body: CreateSandboxGuestRequest,
  ): SandboxGuest {
    return this.sandbox.createGuest(principal.userId, body);
  }

  @Patch('guests/:guestId')
  updateGuestStatus(
    @CurrentUser() principal: Principal,
    @Param('guestId') guestId: string,
    @Body(new ZodValidationPipe(updateSandboxGuestRequestSchema)) body: UpdateSandboxGuestRequest,
  ): SandboxGuest {
    return this.sandbox.updateGuestStatus(principal.userId, guestId, body);
  }

  @Get('education')
  listEducation(@CurrentUser() principal: Principal): SandboxEducationRecord[] {
    return this.sandbox.listEducation(principal.userId);
  }

  @Post('education/:memberId/complete-project')
  markProjectComplete(
    @CurrentUser() principal: Principal,
    @Param('memberId') memberId: string,
  ): SandboxEducationRecord {
    return this.sandbox.markProjectComplete(principal.userId, memberId);
  }
}
