import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import type {
  CreateSandboxAgendaItemRequest,
  CreateSandboxGuestRequest,
  CreateSandboxMeetingRequest,
  CreateSandboxMemberRequest,
  CreateSandboxPlannerEntryRequest,
  SandboxAgendaItem,
  SandboxEducationRecord,
  SandboxGuest,
  SandboxMeeting,
  SandboxMember,
  SandboxPlannerEntry,
  SandboxState,
  UpdateSandboxGuestRequest,
} from '@toastmasters/contracts';
import { createSandboxFixture } from './sandbox.fixture';

const IDLE_EVICTION_MS = 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

interface SandboxEntry {
  state: SandboxState;
  lastAccessedAt: number;
}

/**
 * The sandbox's entire persistence layer: a per-person, in-memory working
 * copy of `createSandboxFixture()`. Deliberately not Prisma/Postgres — the
 * whole point of the sandbox is that nothing a demo-signup person does
 * touches real club data (per product decision; see the sandbox module's
 * top-level comment). Consequences accepted knowingly: this state is
 * per-API-process (lost on restart, not shared across instances if the API
 * is ever scaled out) — fine for a sandbox, not something to reuse for
 * anything that needs to be durable.
 */
@Injectable()
export class SandboxService implements OnModuleDestroy {
  private readonly entries = new Map<string, SandboxEntry>();
  private readonly sweepHandle: ReturnType<typeof setInterval>;

  constructor() {
    this.sweepHandle = setInterval(() => this.evictIdle(), SWEEP_INTERVAL_MS);
    this.sweepHandle.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.sweepHandle);
  }

  private evictIdle(): void {
    const now = Date.now();
    for (const [personId, entry] of this.entries) {
      if (now - entry.lastAccessedAt > IDLE_EVICTION_MS) this.entries.delete(personId);
    }
  }

  private stateFor(personId: string): SandboxState {
    const existing = this.entries.get(personId);
    if (existing) {
      existing.lastAccessedAt = Date.now();
      return existing.state;
    }
    const state = createSandboxFixture();
    this.entries.set(personId, { state, lastAccessedAt: Date.now() });
    return state;
  }

  getState(personId: string): SandboxState {
    return this.stateFor(personId);
  }

  listMembers(personId: string): SandboxMember[] {
    return this.stateFor(personId).members;
  }

  createMember(personId: string, input: CreateSandboxMemberRequest): SandboxMember {
    const member: SandboxMember = {
      id: randomUUID(),
      fullName: input.fullName,
      role: input.role,
      email: input.email,
      joinedAt: new Date().toISOString().slice(0, 10),
      pathway: input.pathway,
      pathwayLevel: 1,
    };
    this.stateFor(personId).members.push(member);
    return member;
  }

  listMeetings(personId: string): SandboxMeeting[] {
    return this.stateFor(personId).meetings;
  }

  createMeeting(personId: string, input: CreateSandboxMeetingRequest): SandboxMeeting {
    const meeting: SandboxMeeting = {
      id: randomUUID(),
      theme: input.theme,
      scheduledAt: input.scheduledAt,
      status: 'upcoming',
      agenda: [],
    };
    this.stateFor(personId).meetings.push(meeting);
    return meeting;
  }

  addAgendaItem(
    personId: string,
    meetingId: string,
    input: CreateSandboxAgendaItemRequest,
  ): SandboxAgendaItem {
    const meeting = this.stateFor(personId).meetings.find((m) => m.id === meetingId);
    if (!meeting) throw new NotFoundException('Sandbox meeting not found');
    const item: SandboxAgendaItem = {
      id: randomUUID(),
      order: meeting.agenda.length + 1,
      title: input.title,
      speaker: input.speaker ?? null,
      durationMinutes: input.durationMinutes,
    };
    meeting.agenda.push(item);
    return item;
  }

  listPlanner(personId: string): SandboxPlannerEntry[] {
    return this.stateFor(personId).planner;
  }

  createPlannerEntry(
    personId: string,
    input: CreateSandboxPlannerEntryRequest,
  ): SandboxPlannerEntry {
    const entry: SandboxPlannerEntry = {
      id: randomUUID(),
      meetingDate: input.meetingDate,
      theme: input.theme,
      toastmaster: input.toastmaster ?? null,
      generalEvaluator: input.generalEvaluator ?? null,
    };
    this.stateFor(personId).planner.push(entry);
    return entry;
  }

  listGuests(personId: string): SandboxGuest[] {
    return this.stateFor(personId).guests;
  }

  createGuest(personId: string, input: CreateSandboxGuestRequest): SandboxGuest {
    const guest: SandboxGuest = {
      id: randomUUID(),
      fullName: input.fullName,
      email: input.email ?? null,
      invitedBy: input.invitedBy ?? null,
      pipelineStatus: 'new',
      visitedAt: null,
    };
    this.stateFor(personId).guests.push(guest);
    return guest;
  }

  updateGuestStatus(
    personId: string,
    guestId: string,
    input: UpdateSandboxGuestRequest,
  ): SandboxGuest {
    const guest = this.stateFor(personId).guests.find((g) => g.id === guestId);
    if (!guest) throw new NotFoundException('Sandbox guest not found');
    guest.pipelineStatus = input.pipelineStatus;
    if (input.pipelineStatus === 'visited' && !guest.visitedAt) {
      guest.visitedAt = new Date().toISOString().slice(0, 10);
    }
    return guest;
  }

  listEducation(personId: string): SandboxEducationRecord[] {
    return this.stateFor(personId).education;
  }

  markProjectComplete(personId: string, memberId: string): SandboxEducationRecord {
    const record = this.stateFor(personId).education.find((e) => e.memberId === memberId);
    if (!record) throw new NotFoundException('Sandbox education record not found');
    if (record.projectsCompleted < record.projectsTotal) record.projectsCompleted += 1;
    return record;
  }
}
