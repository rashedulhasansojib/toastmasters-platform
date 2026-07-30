'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, KeyRound, Plus, Trash2 } from 'lucide-react';
import type {
  ClubMemberType,
  OrgUnitWithCount,
  PersonDetail,
  ProgramYear,
  RoleAssignmentEndedReason,
  RoleTemplateSummary,
} from '@toastmasters/contracts';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { OrgUnitCascadePicker } from './OrgUnitCascadePicker';

const MEMBER_TYPES: ClubMemberType[] = [
  'new',
  'renewing',
  'dual',
  'reinstated',
  'charter',
  'transfer',
  'honorary',
];
const END_REASONS: RoleAssignmentEndedReason[] = ['term_end', 'resigned', 'removed', 'succeeded'];

export function UserDetailView({
  regionUnitId,
  detail,
  roleTemplates,
  defaultProgramYearId,
  programYear,
}: {
  regionUnitId: string;
  detail: PersonDetail;
  roleTemplates: RoleTemplateSummary[];
  defaultProgramYearId: string | null;
  programYear: ProgramYear | null;
}) {
  const router = useRouter();
  const [assignOpen, setAssignOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/platform/${regionUnitId}/users`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> All users
        </Link>
      </div>

      <ProfileCard regionUnitId={regionUnitId} detail={detail} />

      {detail.pendingInvitation && (
        <PendingInvitationCard
          invitation={detail.pendingInvitation}
          onChanged={() => router.refresh()}
        />
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Roles</CardTitle>
          <Button size="sm" onClick={() => setAssignOpen(true)}>
            <Plus /> Assign new role
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {detail.roleAssignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No roles assigned yet.</p>
          ) : (
            detail.roleAssignments.map((r) => (
              <RoleRow
                key={r.roleAssignmentId}
                roleAssignmentId={r.roleAssignmentId}
                role={r.role}
                orgUnitName={r.orgUnitName}
                status={r.status}
                onChanged={() => router.refresh()}
              />
            ))
          )}
          {detail.platformRoles.map((p) => (
            <div
              key={p.platformRoleAssignmentId}
              className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
            >
              <span>
                <span className="font-medium">{p.role}</span>
                <span className="text-muted-foreground"> · {p.orgUnitName ?? 'platform-wide'}</span>
              </span>
              <Badge variant="secondary">platform</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Club memberships</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {detail.clubMemberships.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not a member of any club yet.</p>
          ) : (
            detail.clubMemberships.map((c) => (
              <div
                key={c.clubMembershipId}
                className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-medium">{c.clubName}</span>
                  <span className="text-muted-foreground"> · {c.memberType}</span>
                </span>
                <Badge variant={c.localStatus === 'active' ? 'default' : 'outline'}>
                  {c.localStatus}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <PasswordResetCard regionUnitId={regionUnitId} personId={detail.id} />

      <DangerZoneCard
        regionUnitId={regionUnitId}
        personId={detail.id}
        personName={detail.fullName}
      />

      <Dialog open={assignOpen} onOpenChange={setAssignOpen} title="Assign a new role">
        {assignOpen && (
          <AssignRoleForm
            regionUnitId={regionUnitId}
            personId={detail.id}
            roleTemplates={roleTemplates}
            defaultProgramYearId={defaultProgramYearId}
            programYear={programYear}
            onDone={() => {
              setAssignOpen(false);
              router.refresh();
            }}
            onCancel={() => setAssignOpen(false)}
          />
        )}
      </Dialog>
    </div>
  );
}

/**
 * Users admin password reset (super-admin People page). Sets a new
 * argon2id-hashed password server-side and bumps permission_version so any
 * live session for this person is invalidated on the next request.
 */
function PasswordResetCard({ regionUnitId, personId }: { regionUnitId: string; personId: string }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (password.length < 8) {
      toast.error('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('The two passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      const result = await submitAction(
        () =>
          fetch(`/api/people/${personId}/password?anchorOrgUnitId=${regionUnitId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password }),
          }),
        {
          loading: 'Resetting password…',
          success: 'Password updated',
          error: 'Could not reset the password.',
        },
      );
      if (!result) return;
      setPassword('');
      setConfirmPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" /> Reset password
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Sets a new password and signs the user out of any active session on their next request.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reset-password">New password</Label>
              <Input
                id="reset-password"
                type="password"
                autoComplete="new-password"
                className="h-11 lg:h-9"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reset-password-confirm">Confirm password</Label>
              <Input
                id="reset-password-confirm"
                type="password"
                autoComplete="new-password"
                className="h-11 lg:h-9"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="lg" className="h-11 lg:h-9" disabled={busy}>
              {busy ? 'Saving…' : 'Reset password'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * Users admin soft-delete (super-admin People page). One-way from the UI —
 * on success, we bounce back to the users list, since the detail page for a
 * deleted person 404s.
 */
function DangerZoneCard({
  regionUnitId,
  personId,
  personName,
}: {
  regionUnitId: string;
  personId: string;
  personName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onDelete(): Promise<void> {
    if (
      !confirm(
        `Delete ${personName}? This ends all their active roles and club memberships and signs them out. Ledger, meeting, and audit history is retained.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const result = await submitAction(
        () =>
          fetch(`/api/people/${personId}?anchorOrgUnitId=${regionUnitId}`, {
            method: 'DELETE',
          }),
        {
          loading: 'Deleting user…',
          success: 'User deleted',
          error: 'Could not delete this user.',
        },
      );
      if (!result) return;
      router.push(`/platform/${regionUnitId}/users`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <Trash2 className="size-4" /> Delete user
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Removes the user from the admin surface, ends every active role and club membership, and
          revokes any pending invitation. Historical records (ledger, minutes, attendance, audit)
          are kept — this is not a hard delete.
        </p>
        <div>
          <Button
            type="button"
            variant="destructive"
            size="lg"
            className="h-11 lg:h-9"
            disabled={busy}
            onClick={() => void onDelete()}
          >
            {busy ? 'Deleting…' : 'Delete user'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ProfileCard({ regionUnitId, detail }: { regionUnitId: string; detail: PersonDetail }) {
  const router = useRouter();
  const [fullName, setFullName] = useState(detail.fullName);
  const [phone, setPhone] = useState(detail.phone ?? '');
  const [tiMemberNumber, setTiMemberNumber] = useState(detail.tiMemberNumber ?? '');
  const [status, setStatus] = useState<'active' | 'disabled'>(
    detail.status === 'disabled' ? 'disabled' : 'active',
  );
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await submitAction(
        () =>
          fetch(`/api/people/${detail.id}?anchorOrgUnitId=${regionUnitId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fullName,
              phone: phone.trim() || null,
              tiMemberNumber: tiMemberNumber.trim() || null,
              status,
            }),
          }),
        {
          loading: 'Saving changes…',
          success: 'Changes saved',
          error: 'Could not save those changes.',
        },
      );
      if (!result) return;
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{detail.fullName}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-name">Full name</Label>
              <Input
                id="edit-name"
                className="h-11 lg:h-9"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-email">Email</Label>
              <Input id="edit-email" className="h-11 lg:h-9" value={detail.email} disabled />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input
                id="edit-phone"
                className="h-11 lg:h-9"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-ti">TI member number</Label>
              <Input
                id="edit-ti"
                className="h-11 lg:h-9"
                value={tiMemberNumber}
                onChange={(e) => setTiMemberNumber(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5 sm:max-w-xs">
            <Label htmlFor="edit-status">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as 'active' | 'disabled')}>
              <SelectTrigger className="w-full" id="edit-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="lg" className="h-11 lg:h-9" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PendingInvitationCard({
  invitation,
  onChanged,
}: {
  invitation: { id: string; role: string; expiresAt: string };
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [lastLink, setLastLink] = useState<string | null>(null);

  async function resend(): Promise<void> {
    setBusy(true);
    try {
      const response = await submitAction(
        () => fetch(`/api/invitations/${invitation.id}/resend`, { method: 'POST' }),
        {
          loading: 'Resending invitation…',
          success: 'Invitation resent',
          error: 'Could not resend that invitation.',
        },
      );
      if (response) {
        const data = await response.json();
        setLastLink(data.inviteUrl ?? null);
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function revoke(): Promise<void> {
    if (!confirm('Revoke this invitation? The link will stop working.')) return;
    setBusy(true);
    try {
      await submitAction(
        () => fetch(`/api/invitations/${invitation.id}/revoke`, { method: 'POST' }),
        {
          loading: 'Revoking invitation…',
          success: 'Invitation revoked',
          error: 'Could not revoke that invitation.',
        },
      );
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending invitation</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Invited as <span className="font-medium">{invitation.role}</span> · expires{' '}
          {new Date(invitation.expiresAt).toLocaleDateString()}
        </p>
        {lastLink && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2">
            <code className="flex-1 truncate text-xs">{lastLink}</code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void navigator.clipboard.writeText(lastLink)}
            >
              Copy
            </Button>
          </div>
        )}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void resend()}>
            Resend
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void revoke()}>
            Revoke
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RoleRow({
  roleAssignmentId,
  role,
  orgUnitName,
  status,
  onChanged,
}: {
  roleAssignmentId: string;
  role: string;
  orgUnitName: string;
  status: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function end(): Promise<void> {
    const reason = prompt(`End this role? Type one of: ${END_REASONS.join(', ')}`, 'term_end');
    if (!reason || !END_REASONS.includes(reason as RoleAssignmentEndedReason)) return;
    setBusy(true);
    try {
      await submitAction(
        () =>
          fetch(`/api/role-assignments/${roleAssignmentId}/end`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason }),
          }),
        {
          loading: 'Ending role…',
          success: 'Role ended',
          error: 'Could not end that role.',
        },
      );
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
      <span>
        <span className="font-medium">{role}</span>
        <span className="text-muted-foreground"> · {orgUnitName}</span>
      </span>
      <div className="flex items-center gap-2">
        <Badge variant={status === 'active' ? 'default' : 'outline'}>{status}</Badge>
        {status === 'active' && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void end()}>
            End
          </Button>
        )}
      </div>
    </div>
  );
}

function AssignRoleForm({
  regionUnitId,
  personId,
  roleTemplates,
  defaultProgramYearId,
  programYear,
  onDone,
  onCancel,
}: {
  regionUnitId: string;
  personId: string;
  roleTemplates: RoleTemplateSummary[];
  defaultProgramYearId: string | null;
  programYear: ProgramYear | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [selectedUnit, setSelectedUnit] = useState<OrgUnitWithCount | null>(null);
  const [role, setRole] = useState('');
  const [memberType, setMemberType] = useState<ClubMemberType | ''>('');
  const [termStart, setTermStart] = useState(programYear?.startsOn ?? '');
  const [termEnd, setTermEnd] = useState(programYear?.endsOn ?? '');
  const [submitting, setSubmitting] = useState(false);

  const eligibleRoles = selectedUnit
    ? roleTemplates.filter((t) => t.unitTypes.length > 0 && t.unitTypes.includes(selectedUnit.type))
    : [];

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!selectedUnit || !role || !defaultProgramYearId) {
      toast.error('Choose an org unit, a role, and make sure a current program year exists.');
      return;
    }
    if (selectedUnit.type === 'club' && !memberType) {
      toast.error('Choose a member type for a club-tier assignment.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitAction(
        () =>
          fetch(`/api/org-units/${selectedUnit.id}/role-assignments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              personId,
              role,
              programYearId: defaultProgramYearId,
              termStart,
              termEnd,
              memberType: memberType || undefined,
            }),
          }),
        {
          loading: 'Assigning role…',
          success: 'Role assigned',
          error: 'Could not assign that role.',
        },
      );
      if (!result) return;
      onDone();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
      <OrgUnitCascadePicker regionUnitId={regionUnitId} onChange={setSelectedUnit} />

      {selectedUnit && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="assign-role">Role</Label>
          <Select value={role || undefined} onValueChange={(v) => setRole(v ?? '')}>
            <SelectTrigger className="w-full" id="assign-role">
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
          <Label htmlFor="assign-member-type">Member type</Label>
          <Select
            value={memberType || undefined}
            onValueChange={(v) => setMemberType(v as ClubMemberType)}
          >
            <SelectTrigger className="w-full" id="assign-member-type">
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="assign-term-start">Term start</Label>
          <Input
            id="assign-term-start"
            type="date"
            className="h-11 lg:h-9"
            value={termStart}
            onChange={(e) => setTermStart(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="assign-term-end">Term end</Label>
          <Input
            id="assign-term-end"
            type="date"
            className="h-11 lg:h-9"
            value={termEnd}
            onChange={(e) => setTermEnd(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-11 lg:h-9"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button type="submit" size="lg" className="h-11 lg:h-9" disabled={submitting}>
          {submitting ? 'Assigning…' : 'Assign role'}
        </Button>
      </div>
    </form>
  );
}
