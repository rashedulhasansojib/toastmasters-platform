'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Meeting, TableTopicQuestion, WordOfDay } from '@toastmasters/contracts';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * The meeting's descriptive metadata, held as editable form state. Mirrors
 * the legacy portal's `EventFormState` — the fields that all live on the
 * meeting row itself and therefore share one PATCH. Roles, agenda items,
 * guests, attendance and resources are separate resources with their own
 * endpoints, so they are not in here.
 */
export type MeetingDraft = {
  date: string;
  startTime: string;
  meetingNumber: string;
  title: string;
  theme: string;
  venue: string;
  joinUrl: string;
  wordOfDay: WordOfDay;
  tableTopicQuestions: TableTopicQuestion[];
};

export const EMPTY_WORD_OF_DAY: WordOfDay = {
  word: '',
  partOfSpeech: '',
  meaning: '',
  example: '',
};

function toDraft(meeting: Meeting): MeetingDraft {
  return {
    date: meeting.scheduledAt.slice(0, 10),
    startTime: meeting.scheduledAt.slice(11, 16),
    meetingNumber: meeting.meetingNumber?.toString() ?? '',
    title: meeting.title ?? '',
    theme: meeting.theme ?? '',
    venue: meeting.venue ?? '',
    joinUrl: meeting.joinUrl ?? '',
    wordOfDay: meeting.wordOfDay ?? EMPTY_WORD_OF_DAY,
    tableTopicQuestions: meeting.tableTopicQuestions ?? [],
  };
}

function isEmptyWordOfDay(word: WordOfDay): boolean {
  return !word.word && !word.partOfSpeech && !word.meaning && !word.example;
}

function toPayload(draft: MeetingDraft) {
  return {
    title: draft.title.trim() || null,
    theme: draft.theme.trim() || null,
    venue: draft.venue.trim() || null,
    joinUrl: draft.joinUrl.trim() || null,
    meetingNumber: draft.meetingNumber.trim() ? Number(draft.meetingNumber) : null,
    wordOfDay: isEmptyWordOfDay(draft.wordOfDay) ? null : draft.wordOfDay,
    // Blank questions are scratch rows the user hasn't filled in yet — they
    // would fail the contract's `min(1)`, so they never reach the wire.
    tableTopicQuestions: draft.tableTopicQuestions.filter((q) => q.text.trim().length > 0),
    scheduledAt: new Date(`${draft.date}T${draft.startTime}:00`).toISOString(),
  };
}

const AUTOSAVE_DELAY_MS = 1500;

/**
 * Debounced autosave, as in the legacy portal: typing schedules a save
 * 1.5s later, while a discrete action (ticking a table topic as asked)
 * passes `immediate` and saves at once.
 */
export function useMeetingDraft(clubUnitId: string, meeting: Meeting) {
  const router = useRouter();
  const [draft, setDraft] = useState<MeetingDraft>(() => toDraft(meeting));
  const [saveState, setSaveState] = useState<SaveState>('idle');

  // Mirrors `draft` for the debounced save to read at fire time. Written in
  // `update` (before the timer is armed) and re-synced by the effect below,
  // never during render.
  const draftRef = useRef(draft);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const save = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setSaveState('saving');
    try {
      const res = await fetch(`/api/clubs/${clubUnitId}/meetings/${meeting.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toPayload(draftRef.current)),
      });
      if (!res.ok) {
        setSaveState('error');
        return;
      }
      setSaveState('saved');
      router.refresh();
      if (resetRef.current) clearTimeout(resetRef.current);
      resetRef.current = setTimeout(() => setSaveState('idle'), 2000);
    } catch {
      setSaveState('error');
    }
  }, [clubUnitId, meeting.id, router]);

  const update = useCallback(
    (patch: Partial<MeetingDraft>, immediate = false) => {
      setDraft((prev) => {
        const next = { ...prev, ...patch };
        draftRef.current = next;
        return next;
      });
      if (timerRef.current) clearTimeout(timerRef.current);
      if (immediate) {
        void save();
      } else {
        timerRef.current = setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
      }
    },
    [save],
  );

  // Flush a pending edit rather than losing it when the tab is hidden or the
  // page is closed — a meeting is edited on a phone that gets locked mid-typing.
  useEffect(() => {
    const flush = () => {
      if (timerRef.current) void save();
    };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, [save]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (resetRef.current) clearTimeout(resetRef.current);
    },
    [],
  );

  return { draft, update, save, saveState };
}
