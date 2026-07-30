import { describe, it, expect, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type {
  ClubDuesSettings,
  ClubMembership,
  DuesRecord,
  LedgerEntry,
} from '@toastmasters/contracts';
import { DuesRecordService, deriveDuesStatus } from './dues-record.service';

function duesRecord(overrides: Partial<DuesRecord> = {}): DuesRecord {
  return {
    id: 'dues-1',
    orgUnitId: 'club-1',
    clubMembershipId: 'membership-1',
    personId: 'person-1',
    duesPeriod: '2026-OCT',
    programYearId: 'py-2026',
    tiAmountDue: 60,
    tiAmountPaid: 0,
    tiCurrency: 'USD',
    tiPaidAt: null,
    tiSubmittedToWhqAt: null,
    localAmountDue: 40,
    localAmountPaid: 0,
    localCurrency: 'USD',
    localPaidAt: null,
    status: 'due',
    ledgerEntryIds: [],
    createdAt: '2026-07-29T00:00:00.000Z',
    ...overrides,
  };
}

function membership(overrides: Partial<ClubMembership> = {}): ClubMembership {
  return {
    id: 'membership-1',
    personId: 'person-1',
    clubUnitId: 'club-1',
    memberType: 'renewing',
    joinedAt: '2025-01-01T00:00:00.000Z',
    leftAt: null,
    isPrimary: true,
    tiStanding: 'good',
    localStatus: 'active',
    provenance: 'portal',
    lastReconciledAt: null,
    ...overrides,
  };
}

function ledgerEntry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: 'ledger-1',
    orgUnitId: 'club-1',
    programYearId: 'py-2026',
    direction: 'in',
    category: 'dues',
    amount: 40,
    currency: 'USD',
    occurredOn: '2026-07-29',
    counterpartyKind: 'member',
    counterpartyRef: 'person-1',
    counterpartyLabel: 'Jane Doe',
    description: 'Dues payment',
    receiptUrl: null,
    recordedBy: 'treasurer-1',
    recordedAt: '2026-07-29T00:00:00.000Z',
    reversalOfEntryId: null,
    ...overrides,
  };
}

function duesSettings(overrides: Partial<ClubDuesSettings> = {}): ClubDuesSettings {
  return {
    orgUnitId: 'club-1',
    localDuesAmount: 40,
    tiDuesAmount: 60,
    currency: 'USD',
    ...overrides,
  };
}

function makeService(
  overrides: {
    record?: DuesRecord | null;
    activeMemberships?: ClubMembership[];
    existingForPeriod?: DuesRecord | null;
    ledgerEntry?: LedgerEntry | null;
    settings?: ClubDuesSettings;
  } = {},
) {
  const duesRecords = {
    findByClub: vi.fn(),
    findById: vi
      .fn()
      .mockResolvedValue(overrides.record === undefined ? duesRecord() : overrides.record),
    findByMembershipAndPeriod: vi.fn().mockResolvedValue(overrides.existingForPeriod ?? null),
    create: vi.fn().mockImplementation(async (input) => duesRecord({ ...input, id: 'new-dues' })),
    recordPayment: vi.fn().mockResolvedValue(duesRecord()),
  };
  const clubMemberships = {
    findActiveByClub: vi.fn().mockResolvedValue(overrides.activeMemberships ?? [membership()]),
  };
  const ledgerEntries = {
    findById: vi
      .fn()
      .mockResolvedValue(
        overrides.ledgerEntry === undefined ? ledgerEntry() : overrides.ledgerEntry,
      ),
  };
  const duesSettingsRepo = {
    find: vi.fn().mockResolvedValue(overrides.settings ?? duesSettings()),
  };

  const service = new DuesRecordService(
    duesRecords as never,
    clubMemberships as never,
    ledgerEntries as never,
    duesSettingsRepo as never,
  );
  return { service, duesRecords, clubMemberships, ledgerEntries, duesSettingsRepo };
}

describe('deriveDuesStatus', () => {
  it('is waived when nothing is due', () => {
    expect(
      deriveDuesStatus({ tiAmountDue: 0, tiAmountPaid: 0, localAmountDue: 0, localAmountPaid: 0 }),
    ).toBe('waived');
  });

  it('is due when nothing has been paid', () => {
    expect(
      deriveDuesStatus({
        tiAmountDue: 60,
        tiAmountPaid: 0,
        localAmountDue: 40,
        localAmountPaid: 0,
      }),
    ).toBe('due');
  });

  it('is partial once some but not all of the total has been paid', () => {
    expect(
      deriveDuesStatus({
        tiAmountDue: 60,
        tiAmountPaid: 60,
        localAmountDue: 40,
        localAmountPaid: 0,
      }),
    ).toBe('partial');
  });

  it('is paid once total paid meets or exceeds total due', () => {
    expect(
      deriveDuesStatus({
        tiAmountDue: 60,
        tiAmountPaid: 60,
        localAmountDue: 40,
        localAmountPaid: 40,
      }),
    ).toBe('paid');
  });
});

describe('DuesRecordService.generate', () => {
  it('creates one record per active membership using the club dues settings amounts', async () => {
    const { service, duesRecords } = makeService();
    const created = await service.generate('club-1', {
      duesPeriod: '2026-OCT',
      programYearId: 'py-2026',
    });

    expect(duesRecords.create).toHaveBeenCalledWith(
      expect.objectContaining({
        orgUnitId: 'club-1',
        clubMembershipId: 'membership-1',
        personId: 'person-1',
        duesPeriod: '2026-OCT',
        programYearId: 'py-2026',
        tiAmountDue: 60,
        tiCurrency: 'USD',
        localAmountDue: 40,
        localCurrency: 'USD',
        status: 'due',
      }),
    );
    expect(created).toHaveLength(1);
  });

  it('skips a membership that already has a record for the period', async () => {
    const { service, duesRecords } = makeService({ existingForPeriod: duesRecord() });
    const created = await service.generate('club-1', {
      duesPeriod: '2026-OCT',
      programYearId: 'py-2026',
    });

    expect(created).toEqual([]);
    expect(duesRecords.create).not.toHaveBeenCalled();
  });

  it('defaults currency to USD and amounts to 0 when club dues settings are unset', async () => {
    const { service, duesRecords } = makeService({
      settings: { orgUnitId: 'club-1', localDuesAmount: null, tiDuesAmount: null, currency: null },
    });
    await service.generate('club-1', { duesPeriod: '2026-OCT', programYearId: 'py-2026' });

    expect(duesRecords.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tiAmountDue: 0,
        tiCurrency: 'USD',
        localAmountDue: 0,
        localCurrency: 'USD',
        status: 'waived',
      }),
    );
  });
});

describe('DuesRecordService.recordPayment', () => {
  it('rejects, without recording a payment, when the dues record does not exist', async () => {
    const { service, duesRecords } = makeService({ record: null });
    await expect(
      service.recordPayment({
        orgUnitId: 'club-1',
        duesRecordId: 'missing',
        scope: 'ti',
        amount: 60,
        ledgerEntryId: 'ledger-1',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(duesRecords.recordPayment).not.toHaveBeenCalled();
  });

  it('rejects when the dues record belongs to a different club', async () => {
    const { service, duesRecords } = makeService({ record: duesRecord({ orgUnitId: 'club-2' }) });
    await expect(
      service.recordPayment({
        orgUnitId: 'club-1',
        duesRecordId: 'dues-1',
        scope: 'ti',
        amount: 60,
        ledgerEntryId: 'ledger-1',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(duesRecords.recordPayment).not.toHaveBeenCalled();
  });

  it('rejects when the ledger entry does not belong to this club', async () => {
    const { service, duesRecords } = makeService({
      ledgerEntry: ledgerEntry({ orgUnitId: 'club-2' }),
    });
    await expect(
      service.recordPayment({
        orgUnitId: 'club-1',
        duesRecordId: 'dues-1',
        scope: 'ti',
        amount: 60,
        ledgerEntryId: 'ledger-1',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(duesRecords.recordPayment).not.toHaveBeenCalled();
  });

  it('rejects when the ledger entry is already linked to this dues record', async () => {
    const { service, duesRecords } = makeService({
      record: duesRecord({ ledgerEntryIds: ['ledger-1'] }),
    });
    await expect(
      service.recordPayment({
        orgUnitId: 'club-1',
        duesRecordId: 'dues-1',
        scope: 'ti',
        amount: 60,
        ledgerEntryId: 'ledger-1',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(duesRecords.recordPayment).not.toHaveBeenCalled();
  });

  it('sets paidAt for the ti scope once the ti amount is fully paid, deriving the new status', async () => {
    const { service, duesRecords } = makeService({
      record: duesRecord({
        tiAmountDue: 60,
        tiAmountPaid: 0,
        localAmountDue: 40,
        localAmountPaid: 0,
      }),
    });
    await service.recordPayment({
      orgUnitId: 'club-1',
      duesRecordId: 'dues-1',
      scope: 'ti',
      amount: 60,
      ledgerEntryId: 'ledger-1',
    });

    expect(duesRecords.recordPayment).toHaveBeenCalledWith('dues-1', {
      scope: 'ti',
      amount: 60,
      ledgerEntryId: 'ledger-1',
      status: 'partial',
      paidAt: expect.any(Date),
    });
  });

  it('leaves paidAt unset for a local payment that does not fully cover the local amount', async () => {
    const { service, duesRecords } = makeService({
      record: duesRecord({
        tiAmountDue: 60,
        tiAmountPaid: 0,
        localAmountDue: 40,
        localAmountPaid: 0,
      }),
    });
    await service.recordPayment({
      orgUnitId: 'club-1',
      duesRecordId: 'dues-1',
      scope: 'local',
      amount: 20,
      ledgerEntryId: 'ledger-1',
    });

    expect(duesRecords.recordPayment).toHaveBeenCalledWith('dues-1', {
      scope: 'local',
      amount: 20,
      ledgerEntryId: 'ledger-1',
      status: 'partial',
      paidAt: undefined,
    });
  });
});
