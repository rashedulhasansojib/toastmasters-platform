'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { LibraryItemKind, LibraryItemCategory } from '@toastmasters/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** Governance docs are created under a different route/resource (`library.governance_document`) than everything else (`library.item`) — see the M5 plan doc's "two library resources" note. `isGovernance` picks the base path; the category field is hidden and forced when true. */
export function LibraryUploadForm({
  clubUnitId,
  isGovernance,
}: {
  clubUnitId: string;
  isGovernance: boolean;
}) {
  const router = useRouter();
  const base = isGovernance ? 'governance-documents' : 'library-items';
  const [kind, setKind] = useState<LibraryItemKind>('document');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<LibraryItemCategory>(
    isGovernance ? 'governance' : 'other',
  );
  const [file, setFile] = useState<File | null>(null);
  const [externalUrl, setExternalUrl] = useState('');
  const [reviewBy, setReviewBy] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      let fileUrl: string | undefined;
      let fileMimeType: string | undefined;
      let fileSizeBytes: number | undefined;

      if (file) {
        const urlRes = await fetch(`/api/clubs/${clubUnitId}/${base}/upload-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contentType: file.type || 'application/octet-stream' }),
        });
        if (!urlRes.ok) {
          setError('Could not get an upload URL.');
          return;
        }
        const { url, key } = (await urlRes.json()) as { url: string; key: string };
        const putRes = await fetch(url, { method: 'PUT', body: file });
        if (!putRes.ok) {
          setError('Upload failed.');
          return;
        }
        fileUrl = key;
        fileMimeType = file.type || 'application/octet-stream';
        fileSizeBytes = file.size;
      }

      const res = await fetch(`/api/clubs/${clubUnitId}/${base}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          title,
          ...(isGovernance ? {} : { category }),
          fileUrl,
          fileMimeType,
          fileSizeBytes,
          externalUrl: externalUrl || undefined,
          reviewBy: reviewBy || undefined,
        }),
      });
      if (!res.ok) {
        setError('Could not save that item.');
        return;
      }
      setTitle('');
      setFile(null);
      setExternalUrl('');
      setReviewBy('');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label>Kind</Label>
        <Select value={kind} onValueChange={(v) => setKind(v as LibraryItemKind)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="document">Document</SelectItem>
            <SelectItem value="media">Media</SelectItem>
            <SelectItem value="link">Link</SelectItem>
            <SelectItem value="note">Note</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {!isGovernance && (
        <div className="flex flex-col gap-1">
          <Label>Category</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as LibraryItemCategory)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="training">Training</SelectItem>
              <SelectItem value="branding">Branding</SelectItem>
              <SelectItem value="meeting">Meeting</SelectItem>
              <SelectItem value="finance">Finance</SelectItem>
              <SelectItem value="media">Media</SelectItem>
              <SelectItem value="external">External</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <Label htmlFor="library-title">Title</Label>
        <Input
          id="library-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </div>
      {kind === 'link' ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor="library-external-url">URL</Label>
          <Input
            id="library-external-url"
            value={externalUrl}
            onChange={(e) => setExternalUrl(e.target.value)}
            required
          />
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <Label htmlFor="library-file">File</Label>
          <input
            id="library-file"
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <Label htmlFor="library-review-by">Review by</Label>
        <Input
          id="library-review-by"
          type="date"
          value={reviewBy}
          onChange={(e) => setReviewBy(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : 'Add'}
      </Button>
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </form>
  );
}
