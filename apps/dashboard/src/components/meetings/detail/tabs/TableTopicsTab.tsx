'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, CheckCircle2, Circle, Pencil, Plus, Trash2 } from 'lucide-react';
import type { TableTopicQuestion } from '@toastmasters/contracts';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { EmptyState } from '../primitives';
import type { MeetingDraft } from '../useMeetingDraft';

const MAX_QUESTIONS = 10;

/**
 * Port of the legacy Table Topics tab. Marking a question as asked saves
 * immediately (it happens live, mid-meeting); editing the text debounces
 * like the rest of the meeting metadata.
 */
export function TableTopicsTab({
  draft,
  update,
}: {
  draft: MeetingDraft;
  update: (patch: Partial<MeetingDraft>, immediate?: boolean) => void;
}) {
  const questions = draft.tableTopicQuestions;
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');

  const asked = questions.filter((q) => q.completed).length;

  function setQuestions(next: TableTopicQuestion[], immediate = false) {
    update({ tableTopicQuestions: next }, immediate);
  }

  function add() {
    if (questions.length >= MAX_QUESTIONS) return;
    const next = [...questions, { text: '', completed: false }];
    setQuestions(next);
    setEditingIndex(next.length - 1);
    setEditDraft('');
  }

  function commitEdit() {
    if (editingIndex === null) return;
    setQuestions(
      questions.map((q, i) => (i === editingIndex ? { ...q, text: editDraft } : q)),
      true,
    );
    setEditingIndex(null);
  }

  function remove(index: number) {
    if (editingIndex === index) setEditingIndex(null);
    setQuestions(
      questions.filter((_, i) => i !== index),
      true,
    );
  }

  function toggle(index: number) {
    setQuestions(
      questions.map((q, i) => (i === index ? { ...q, completed: !q.completed } : q)),
      true,
    );
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    const next = [...questions];
    [next[index], next[target]] = [next[target], next[index]];
    if (editingIndex === index) setEditingIndex(target);
    else if (editingIndex === target) setEditingIndex(index);
    setQuestions(next, true);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Table Topic Questions</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Up to {MAX_QUESTIONS}. Tick each one as it is asked during the meeting.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span className="block text-xs text-muted-foreground">
            {questions.length}/{MAX_QUESTIONS}
          </span>
          {questions.length > 0 && (
            <span className="text-xs font-medium text-green-600 dark:text-green-500">
              {asked} asked
            </span>
          )}
        </div>
      </div>

      {questions.length === 0 ? (
        <EmptyState
          title="No questions yet"
          hint="Prep the prompts you want the Table Topics Master to ask."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {questions.map((question, index) => {
            const isEditing = editingIndex === index;
            return (
              <li
                key={`tt-${index}`}
                className={cn(
                  'rounded-xl border bg-card transition-colors',
                  question.completed
                    ? 'border-green-300 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20'
                    : 'border-border',
                )}
              >
                <div className="flex items-start gap-3 p-3">
                  <span
                    className={cn(
                      'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                      question.completed
                        ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {index + 1}
                  </span>

                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <div className="flex flex-col gap-2">
                        <Textarea
                          autoFocus
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') setEditingIndex(null);
                          }}
                          placeholder="Type your question…"
                          className="min-h-20 resize-none"
                        />
                        <div className="flex gap-2">
                          <Button type="button" size="sm" onClick={commitEdit}>
                            Save
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingIndex(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p
                        className={cn(
                          'text-sm leading-snug break-words whitespace-pre-wrap',
                          question.completed && 'text-muted-foreground line-through',
                          !question.text && 'text-muted-foreground italic',
                        )}
                      >
                        {question.text || 'Empty question — tap the pencil to add text'}
                      </p>
                    )}
                  </div>

                  {!isEditing && (
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => toggle(index)}
                        aria-label={question.completed ? 'Mark as not asked' : 'Mark as asked'}
                        className={cn(
                          'p-1 transition-colors',
                          question.completed
                            ? 'text-green-600 hover:text-green-700'
                            : 'text-muted-foreground hover:text-green-600',
                        )}
                      >
                        {question.completed ? (
                          <CheckCircle2 className="size-5" aria-hidden />
                        ) : (
                          <Circle className="size-5" aria-hidden />
                        )}
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Edit question"
                        onClick={() => {
                          setEditingIndex(index);
                          setEditDraft(question.text);
                        }}
                      >
                        <Pencil className="size-3.5" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Move up"
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp className="size-3.5" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Move down"
                        disabled={index === questions.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown className="size-3.5" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Delete question"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {questions.length < MAX_QUESTIONS && (
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={add}>
          <Plus className="size-4" aria-hidden />
          Add question
        </Button>
      )}
    </div>
  );
}
