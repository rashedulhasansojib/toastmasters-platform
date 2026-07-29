import { describe, expect, it } from 'vitest';
import { buildAutoRequests, type AutoRequestSlot } from './speech-approval-requests';

const CLUB = '00000000-0000-4000-8000-000000000001';
const SLOT1 = '11111111-1111-4111-8111-111111111111';
const SLOT2 = '22222222-2222-4222-8222-222222222222';
const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BEN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SCHEDULED = new Date('2026-05-10T18:00:00.000Z');

function slot(overrides: Partial<AutoRequestSlot> & { id: string }): AutoRequestSlot {
  return {
    status: 'approved',
    pathCode: 'PM',
    projectCode: 'PM-ICE-BREAKER',
    level: 1,
    speakerPersonId: null,
    requestedBy: ANA,
    ...overrides,
  };
}

describe('buildAutoRequests', () => {
  it('emits one request per approved slot, credited to speaker with requester fallback', () => {
    const requests = buildAutoRequests({ clubUnitId: CLUB, scheduledAt: SCHEDULED }, [
      slot({ id: SLOT1, speakerPersonId: BEN, requestedBy: ANA }),
      // Self-service: no speaker set, so the requester speaks.
      slot({ id: SLOT2, speakerPersonId: null, requestedBy: ANA }),
    ]);

    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({
      speechSlotId: SLOT1,
      personId: BEN,
      clubUnitId: CLUB,
      requestedAt: SCHEDULED,
    });
    expect(requests[1]).toMatchObject({ speechSlotId: SLOT2, personId: ANA });
  });

  it("skips slots that never happened (status !== 'approved')", () => {
    const requests = buildAutoRequests({ clubUnitId: CLUB, scheduledAt: SCHEDULED }, [
      slot({ id: SLOT1, status: 'requested' }),
      slot({ id: SLOT2, status: 'declined' }),
    ]);
    expect(requests).toEqual([]);
  });

  it('snapshots path/project/level from the slot at request time', () => {
    const [request] = buildAutoRequests({ clubUnitId: CLUB, scheduledAt: SCHEDULED }, [
      slot({ id: SLOT1, pathCode: 'EH', projectCode: 'EH-DELIVER-A-SPEECH', level: 2 }),
    ]);
    expect(request).toMatchObject({ pathCode: 'EH', projectCode: 'EH-DELIVER-A-SPEECH', level: 2 });
  });

  it('uses the meeting scheduledAt for requestedAt, not the wall-clock', () => {
    const [request] = buildAutoRequests({ clubUnitId: CLUB, scheduledAt: SCHEDULED }, [
      slot({ id: SLOT1 }),
    ]);
    expect(request?.requestedAt).toEqual(SCHEDULED);
  });
});
