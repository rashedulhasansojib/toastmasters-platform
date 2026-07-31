import { describe, it, expect } from 'vitest';
import { SandboxService } from './sandbox.service';

describe('SandboxService', () => {
  it('gives each person their own working copy of the fixture', () => {
    const service = new SandboxService();

    const memberA = service.createMember('person-a', {
      fullName: 'Test Member',
      role: 'Member',
      email: 'test.member@example.com',
      pathway: 'Dynamic Leadership',
    });

    expect(service.listMembers('person-a')).toContainEqual(memberA);
    // person-b never touched the sandbox before — sees the plain fixture,
    // not person-a's addition. This is the whole point of per-person state.
    expect(service.listMembers('person-b')).not.toContainEqual(memberA);
  });

  it('applies mutations only to the in-memory copy, never anywhere durable', () => {
    const service = new SandboxService();
    const before = service.listGuests('person-c').length;

    service.createGuest('person-c', { fullName: 'New Guest' });

    expect(service.listGuests('person-c')).toHaveLength(before + 1);
    // A fresh service instance (as if the API restarted) starts clean.
    expect(new SandboxService().listGuests('person-c')).toHaveLength(before);
  });

  it('increments a project count on markProjectComplete, capped at the total', () => {
    const service = new SandboxService();
    const [record] = service.listEducation('person-d');
    expect(record).toBeDefined();
    const before = record!.projectsCompleted;

    const updated = service.markProjectComplete('person-d', record!.memberId);
    expect(updated.projectsCompleted).toBe(before + 1);

    for (let i = 0; i < 20; i += 1) service.markProjectComplete('person-d', record!.memberId);
    const capped = service.listEducation('person-d').find((e) => e.memberId === record!.memberId);
    expect(capped!.projectsCompleted).toBe(capped!.projectsTotal);
  });
});
