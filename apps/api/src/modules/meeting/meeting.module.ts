import { Module } from '@nestjs/common';
import { getPrisma } from '@toastmasters/db';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';
import { MeetingRepository } from './meeting.repository';
import { MeetingController } from './meeting.controller';
import { AgendaItemRepository } from './agenda-item.repository';
import { AgendaItemController } from './agenda-item.controller';
import { MeetingRoleAssignmentRepository } from './meeting-role-assignment.repository';
import { MeetingRoleAssignmentController } from './meeting-role-assignment.controller';
import { SpeechSlotRepository } from './speech-slot.repository';
import { SpeechSlotController } from './speech-slot.controller';
import { ChecklistTemplateRepository } from './checklist-template.repository';
import { ChecklistTemplateController } from './checklist-template.controller';
import { ChecklistRunRepository } from './checklist-run.repository';
import { ChecklistRunController } from './checklist-run.controller';
import { CapabilityTokenRepository } from './capability-token.repository';
import { CapabilityTokenService } from './capability-token.service';
import { CapabilityTokenController } from './capability-token.controller';
import { MeetingLiveRecordRepository } from './meeting-live-record.repository';
import { MeetingLiveRecordController } from './meeting-live-record.controller';
import { RoleRotationRepository } from './role-rotation.repository';
import { AgendaTemplateRepository } from './agenda-template.repository';
import { AgendaTemplateController } from './agenda-template.controller';
import { BallotRepository } from './ballot.repository';
import { BallotController } from './ballot.controller';

@Module({
  providers: [
    { provide: PRISMA_CLIENT, useFactory: () => getPrisma() },
    MeetingRepository,
    AgendaItemRepository,
    MeetingRoleAssignmentRepository,
    SpeechSlotRepository,
    ChecklistTemplateRepository,
    ChecklistRunRepository,
    CapabilityTokenRepository,
    CapabilityTokenService,
    MeetingLiveRecordRepository,
    RoleRotationRepository,
    AgendaTemplateRepository,
    BallotRepository,
  ],
  controllers: [
    MeetingController,
    AgendaItemController,
    MeetingRoleAssignmentController,
    SpeechSlotController,
    ChecklistTemplateController,
    ChecklistRunController,
    CapabilityTokenController,
    MeetingLiveRecordController,
    AgendaTemplateController,
    BallotController,
  ],
  exports: [MeetingRepository, CapabilityTokenRepository],
})
export class MeetingModule {}
