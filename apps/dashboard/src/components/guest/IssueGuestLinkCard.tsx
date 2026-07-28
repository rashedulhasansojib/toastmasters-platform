'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

type IssuedToken = {
  id: string;
  purpose: string;
  url: string;
  expiresAt: string;
  revoked: boolean;
};

/**
 * M3 Slice 6: the raw token is returned only on issue, never persisted or
 * re-fetchable — so, unlike every other list on this page, there is no GET
 * to back a link list across a reload. Issued links only live in this
 * component's state for the current page view (mirrors the legacy portal's
 * GuestRoleLinkButton, which is also issue-and-display, not a saved list).
 */
export function IssueGuestLinkCard({
  clubUnitId,
  meetingId,
}: {
  clubUnitId: string;
  meetingId: string;
}) {
  const [purpose, setPurpose] = useState('timer');
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokens, setTokens] = useState<IssuedToken[]>([]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIssuing(true);
    try {
      const res = await fetch(`/api/clubs/${clubUnitId}/meetings/${meetingId}/capability-tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purpose }),
      });
      if (!res.ok) {
        setError('Could not issue a guest link.');
        return;
      }
      const data = await res.json();
      const url = `${window.location.origin}/guest/${data.token}`;
      setTokens((prev) => [
        { id: data.id, purpose: data.purpose, url, expiresAt: data.expiresAt, revoked: false },
        ...prev,
      ]);
    } finally {
      setIssuing(false);
    }
  }

  async function revoke(id: string) {
    await fetch(`/api/clubs/${clubUnitId}/meetings/${meetingId}/capability-tokens/${id}/revoke`, {
      method: 'PATCH',
    });
    setTokens((prev) => prev.map((t) => (t.id === id ? { ...t, revoked: true } : t)));
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="token-purpose">Purpose</Label>
          <Input
            id="token-purpose"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="timer"
            className="w-40"
            required
          />
        </div>
        <Button type="submit" disabled={issuing}>
          {issuing ? 'Issuing…' : 'Issue guest link'}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </form>

      {tokens.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-3">
            {tokens.map((token, i) => (
              <div key={token.id}>
                {i > 0 && <Separator className="mb-3" />}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium">{token.purpose}</span>
                    {token.revoked ? (
                      <span className="ml-2 text-sm text-muted-foreground">revoked</span>
                    ) : (
                      <a
                        href={token.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 text-sm text-muted-foreground underline underline-offset-2"
                      >
                        {token.url}
                      </a>
                    )}
                  </div>
                  {!token.revoked && (
                    <Button size="sm" variant="outline" onClick={() => revoke(token.id)}>
                      Revoke
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
