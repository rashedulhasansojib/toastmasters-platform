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

@Module({
  providers: [
    { provide: PRISMA_CLIENT, useFactory: () => getPrisma() },
    MeetingRepository,
    AgendaItemRepository,
    MeetingRoleAssignmentRepository,
    SpeechSlotRepository,
    ChecklistTemplateRepository,
    ChecklistRunRepository,
  ],
  controllers: [
    MeetingController,
    AgendaItemController,
    MeetingRoleAssignmentController,
    SpeechSlotController,
    ChecklistTemplateController,
    ChecklistRunController,
  ],
  exports: [MeetingRepository],
})
export class MeetingModule {}
