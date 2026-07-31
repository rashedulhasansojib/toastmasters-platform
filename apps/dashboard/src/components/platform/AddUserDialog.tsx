'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import type { ClubMemberType, OrgUnit, RoleTemplateSummary } from '@toastmasters/contracts';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { submitAction, toast } from '@/lib/toast';
import { OrgUnitFieldsPicker } from './OrgUnitFieldsPicker';

const MEMBER_TYPES: ClubMemberType[] = [
  'new',
  'renewing',
  'dual',
  'reinstated',
  'charter',
  'transfer',
  'honorary',
];

export function AddUserDialogLauncher({
  regionUnitId,
  roleTemplates,
  defaultProgramYearId,
}: {
  regionUnitId: string;
  roleTemplates: RoleTemplateSummary[];
  defaultProgramYearId: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus /> Add User
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="Add a new user">
        {open && (
          <AddUserForm
            regionUnitId={regionUnitId}
            roleTemplates={roleTemplates}
            defaultProgramYearId={defaultProgramYearId}
            onClose={() => setOpen(false)}
          />
        )}
      </Dialog>
    </>
  );
}

type InviteResult = { inviteUrl: string } | null;

function AddUserForm({
  regionUnitId,
  roleTemplates,
  defaultProgramYearId,
  onClose,
}: {
  regionUnitId: string;
  roleTemplates: RoleTemplateSummary[];
  defaultProgramYearId: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [tiMemberNumber, setTiMemberNumber] = useState('');
  const [assignNow, setAssignNow] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<OrgUnit | null>(null);
  const [role, setRole] = useState('');
  const [memberType, setMemberType] = useState<ClubMemberType | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [inviteResult, setInviteResult] = useState<InviteResult>(null);
  const [copied, setCopied] = useState(false);

  const eligibleRoles = selectedUnit
    ? roleTemplates.filter((t) => t.unitTypes.length > 0 && t.unitTypes.includes(selectedUnit.type))
    : [];

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (assignNow && selectedUnit?.type === 'club' && !memberType) {
      toast.error('Choose a member type for a club-tier assignment.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await submitAction(
        () =>
          fetch(`/api/org-units/${regionUnitId}/people`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fullName: fullName.trim(),
              email: email.trim(),
              phone: phone.trim() || undefined,
              tiMemberNumber: tiMemberNumber.trim() || undefined,
              invite:
                assignNow && selectedUnit && role && defaultProgramYearId
                  ? {
                      orgUnitId: selectedUnit.id,
                      role,
                      programYearId: defaultProgramYearId,
                      memberType: memberType || undefined,
                    }
                  : undefined,
            }),
          }),
        {
          loading: 'Creating user…',
          success: 'User created',
          error: 'Could not create that user.',
        },
      );
      if (!response) return;
      const data = await response.json();
      if (data.invitation?.inviteUrl) {
        setInviteResult({ inviteUrl: data.invitation.inviteUrl });
      } else {
        router.refresh();
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  }

  function done(): void {
    router.refresh();
    onClose();
  }

  if (inviteResult) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {fullName} has been created. Share this link so they can set their password — it will not
          be shown again.
        </p>
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2">
          <code className="flex-1 truncate text-xs">{inviteResult.inviteUrl}</code>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(inviteResult.inviteUrl);
              setCopied(true);
            }}
          >
            {copied ? 'Copied' : 'Copy link'}
          </Button>
        </div>
        <div className="flex justify-end">
          <Button size="lg" className="h-11 lg:h-9" onClick={done}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-user-name">Full name</Label>
        <Input
          id="new-user-name"
          className="h-11 lg:h-9"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-user-email">Email</Label>
          <Input
            id="new-user-email"
            type="email"
            className="h-11 lg:h-9"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-user-phone">Phone</Label>
          <Input
            id="new-user-phone"
            type="tel"
            className="h-11 lg:h-9"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-user-ti">TI member number</Label>
        <Input
          id="new-user-ti"
          className="h-11 lg:h-9"
          value={tiMemberNumber}
          onChange={(e) => setTiMemberNumber(e.target.value)}
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={assignNow}
          onChange={(e) => setAssignNow(e.target.checked)}
        />
        Place them in the org tree and assign a role now
      </label>

      {assignNow && (
        <div className="flex flex-col gap-3 rounded-md border border-border p-3">
          <OrgUnitFieldsPicker regionUnitId={regionUnitId} onChange={setSelectedUnit} />

          {selectedUnit && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-user-role">Role</Label>
              <Select value={role || undefined} onValueChange={(v) => setRole(v ?? '')}>
                <SelectTrigger className="w-full" id="new-user-role">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {eligibleRoles.map((t) => (
                    <SelectItem key={t.role} value={t.role}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {eligibleRoles.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No seeded role applies to a {selectedUnit.type}.
                </p>
              )}
            </div>
          )}

          {selectedUnit?.type === 'club' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-user-member-type">Member type</Label>
              <Select
                value={memberType || undefined}
                onValueChange={(v) => setMemberType(v as ClubMemberType)}
              >
                <SelectTrigger className="w-full" id="new-user-member-type">
                  <SelectValue placeholder="Select a member type" />
                </SelectTrigger>
                <SelectContent>
                  {MEMBER_TYPES.map((mt) => (
                    <SelectItem key={mt} value={mt}>
                      {mt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {!defaultProgramYearId && (
            <p className="text-xs text-destructive">
              No current program year is set — a role cannot be assigned until one exists.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" size="lg" className="h-11 lg:h-9" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" size="lg" className="h-11 lg:h-9" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create user'}
        </Button>
      </div>
    </form>
  );
}
