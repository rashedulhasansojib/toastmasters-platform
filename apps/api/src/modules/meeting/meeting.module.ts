import { Module } from '@nestjs/common';
import { getPrisma } from '@toastmasters/db';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';
import { MeetingRepository } from './meeting.repository';
import { MeetingController } from './meeting.controller';

@Module({
  providers: [{ provide: PRISMA_CLIENT, useFactory: () => getPrisma() }, MeetingRepository],
  controllers: [MeetingController],
  exports: [MeetingRepository],
})
export class MeetingModule {}
