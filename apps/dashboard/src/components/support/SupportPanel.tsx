'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { SupportProfile, SupportRequest } from '@toastmasters/contracts';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { submitAction } from '@/lib/toast';

function OptInToggle({ profile }: { profile: SupportProfile | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const turningOn = !(profile?.isDiscoverable ?? false);
    try {
      const result = await submitAction(
        () =>
          fetch('/api/support-profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              isDiscoverable: turningOn,
              consentVersion: '2026-1',
              availableRoles: profile?.availableRoles ?? ['general_evaluator'],
            }),
          }),
        {
          loading: turningOn ? 'Opting in…' : 'Opting out…',
          success: turningOn ? 'Opted in' : 'Opted out',
          error: 'Could not update your preference.',
        },
      );
      if (!result) return;
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <p className="text-sm">
        Discoverable for cross-club support:{' '}
        <strong>{profile?.isDiscoverable ? 'on' : 'off'}</strong>
      </p>
      <Button type="button" variant="outline" size="sm" onClick={toggle} disabled={busy}>
        {profile?.isDiscoverable ? 'Opt out' : 'Opt in'}
      </Button>
    </div>
  );
}

function CreateRequestForm({ clubUnitId }: { clubUnitId: string }) {
  const router = useRouter();
  const [meetingId, setMeetingId] = useState('');
  const [roleKey, setRoleKey] = useState('general_evaluator');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await submitAction(
        () =>
          fetch(`/api/clubs/${clubUnitId}/support-requests`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              meetingId,
              roleKey,
              neededBy: new Date(Date.now() + 7 * 86_400_000).toISOString(),
            }),
          }),
        {
          loading: 'Creating request…',
          success: 'Request created',
          error: 'Could not create that request.',
        },
      );
      if (!result) return;
      setMeetingId('');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="support-meeting-id">Meeting ID</Label>
        <Input
          id="support-meeting-id"
          value={meetingId}
          onChange={(e) => setMeetingId(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="support-role-key">Role needed</Label>
        <Input
          id="support-role-key"
          value={roleKey}
          onChange={(e) => setRoleKey(e.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Requesting…' : 'Request cross-club support'}
      </Button>
    </form>
  );
}

function RespondAction({ clubUnitId, request }: { clubUnitId: string; request: SupportRequest }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function respond(response: 'accepted' | 'declined') {
    setBusy(true);
    try {
      const result = await submitAction(
        () =>
          fetch(`/api/clubs/${clubUnitId}/support-requests/${request.id}/respond`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ response }),
          }),
        {
          loading: response === 'accepted' ? 'Accepting…' : 'Declining…',
          success: response === 'accepted' ? 'Accepted' : 'Declined',
          error: 'Could not send your response.',
        },
      );
      if (!result) return;
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (request.status !== 'open') return null;

  return (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => respond('accepted')}
        disabled={busy}
      >
        Accept
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => respond('declined')}
        disabled={busy}
      >
        Decline
      </Button>
    </div>
  );
}

export function SupportPanel({
  clubUnitId,
  profile,
  requests,
}: {
  clubUnitId: string;
  profile: SupportProfile | null;
  requests: SupportRequest[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <OptInToggle profile={profile} />
      <CreateRequestForm clubUnitId={clubUnitId} />
      {requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">No support requests yet.</p>
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-3">
            {requests.map((r, i) => (
              <div key={r.id}>
                {i > 0 && <Separator className="mb-3" />}
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">
                    {r.roleKey} ({r.status}) — {r.invitees.length} invited
                  </p>
                  <RespondAction clubUnitId={clubUnitId} request={r} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
