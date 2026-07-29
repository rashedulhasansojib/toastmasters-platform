import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type {
  SpeechEvaluation,
  EvaluationSubjectKind,
  EvaluationMode,
  EvaluationVisibility,
  EvaluationFormScale,
  EvaluationMetricsSnapshot,
} from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type SpeechEvaluationRow = Awaited<ReturnType<PrismaClient['speechEvaluation']['create']>>;

function toSpeechEvaluation(row: SpeechEvaluationRow): SpeechEvaluation {
  return {
    id: row.id,
    meetingId: row.meetingId,
    orgUnitId: row.orgUnitId,
    subjectKind: row.subjectKind,
    speechSlotId: row.speechSlotId,
    speakerPersonId: row.speakerPersonId,
    speakerGuestId: row.speakerGuestId,
    evaluatorPersonId: row.evaluatorPersonId,
    mode: row.mode,
    formScales: row.formScales as unknown as EvaluationFormScale[] | null,
    formExcelledAt: row.formExcelledAt,
    formWorkOn: row.formWorkOn,
    formChallengeYourself: row.formChallengeYourself,
    audioUrl: row.audioUrl,
    scanUrl: row.scanUrl,
    metricsSnapshot: row.metricsSnapshot as unknown as EvaluationMetricsSnapshot,
    visibility: row.visibility,
    submittedAt: row.submittedAt.toISOString(),
  };
}

@Injectable()
export class SpeechEvaluationRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async create(input: {
    meetingId: string;
    orgUnitId: string;
    subjectKind: EvaluationSubjectKind;
    speechSlotId?: string;
    speakerPersonId?: string;
    speakerGuestId?: string;
    evaluatorPersonId: string;
    mode: EvaluationMode;
    formScales?: EvaluationFormScale[];
    formExcelledAt?: string;
    formWorkOn?: string;
    formChallengeYourself?: string;
    audioUrl?: string;
    scanUrl?: string;
    metricsSnapshot: EvaluationMetricsSnapshot;
    visibility: EvaluationVisibility;
  }): Promise<SpeechEvaluation> {
    const row = await this.db.speechEvaluation.create({
      data: {
        ...input,
        formScales: input.formScales ?? undefined,
        metricsSnapshot: input.metricsSnapshot,
      },
    });
    return toSpeechEvaluation(row);
  }

  /** VPE-facing — every evaluation in the club, matching `education.evaluation`'s club-wide (non-`own`) grant. */
  async findByClub(orgUnitId: string): Promise<SpeechEvaluation[]> {
    const rows = await this.db.speechEvaluation.findMany({
      where: { orgUnitId },
      orderBy: { submittedAt: 'desc' },
    });
    return rows.map(toSpeechEvaluation);
  }

  /** Member-facing — FR-EDU-5: visible to the speaker only (query-level filter, same pattern the M6 plan doc documents for tickets/own-condition grants). */
  async findAsSpeaker(personId: string): Promise<SpeechEvaluation[]> {
    const rows = await this.db.speechEvaluation.findMany({
      where: { speakerPersonId: personId },
      orderBy: { submittedAt: 'desc' },
    });
    return rows.map(toSpeechEvaluation);
  }
}
