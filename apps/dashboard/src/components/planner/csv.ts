import type { MeetingRoleKey, PlannerImportRow } from '@toastmasters/contracts';

/**
 * The legacy portal's planner columns, mapped onto this platform's role
 * vocabulary. Speakers and evaluators are the same `roleKey` distinguished by
 * `slotIndex`, which is why "Speaker 1/2/3" collapse to one key here.
 *
 * Header matching is normalised, so "TT Evaluator", "tt evaluator" and
 * "Table Topics Evaluator" all land in the same column.
 */
type ColumnSpec = { roleKey: MeetingRoleKey; slotIndex?: number };

export const COLUMN_MAP: Record<string, ColumnSpec> = {
  tmod: { roleKey: 'toastmaster' },
  toastmaster: { roleKey: 'toastmaster' },
  'toastmaster of the day': { roleKey: 'toastmaster' },
  ttm: { roleKey: 'table_topics_master' },
  'table topics master': { roleKey: 'table_topics_master' },
  'tt evaluator': { roleKey: 'table_topics_evaluator' },
  'table topics evaluator': { roleKey: 'table_topics_evaluator' },
  'speaker 1': { roleKey: 'speaker', slotIndex: 0 },
  'speaker 2': { roleKey: 'speaker', slotIndex: 1 },
  'speaker 3': { roleKey: 'speaker', slotIndex: 2 },
  'evaluator 1': { roleKey: 'evaluator', slotIndex: 0 },
  'evaluator 2': { roleKey: 'evaluator', slotIndex: 1 },
  'evaluator 3': { roleKey: 'evaluator', slotIndex: 2 },
  'general eval': { roleKey: 'general_evaluator' },
  'general evaluator': { roleKey: 'general_evaluator' },
  timer: { roleKey: 'timer' },
  'ah counter': { roleKey: 'ah_counter' },
  'ah-counter': { roleKey: 'ah_counter' },
  grammarian: { roleKey: 'grammarian' },
  'sergeant at arms': { roleKey: 'sergeant_at_arms' },
};

export const TEMPLATE_HEADERS = [
  'Date',
  'Theme',
  'TMOD',
  'TTM',
  'TT Evaluator',
  'Speaker 1',
  'Evaluator 1',
  'Speaker 2',
  'Evaluator 2',
  'Speaker 3',
  'Evaluator 3',
  'General Evaluator',
  'Timer',
  'Ah Counter',
  'Grammarian',
];

/** Trigger a blank template download — same CSV the header order expects. */
export function downloadPlannerTemplate(): void {
  const csv = `${TEMPLATE_HEADERS.join(',')}\n`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'planner-template.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function normaliseHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[._]/g, ' ').replace(/\s+/g, ' ').replace(/\.$/, '');
}

/**
 * A single-pass RFC-4180 reader: handles quoted fields, escaped `""`, and
 * newlines inside quotes. Enough for a spreadsheet export, and it keeps a
 * parser dependency out of the tree (CLAUDE.md §3).
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      // Swallow the \n of a \r\n pair.
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/**
 * Accepts `YYYY-MM-DD`, `DD/MM/YYYY` and `MM/DD/YYYY` is *deliberately not*
 * guessed — an ambiguous slashed date is reported rather than silently read as
 * the wrong month, which is the same principle as the unresolved-name list.
 */
export function parseDate(raw: string, meetingTime: string): { iso: string } | { error: string } {
  const value = raw.trim();
  const [hours, minutes] = meetingTime.split(':').map(Number);

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const slashed = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);

  let y: number;
  let m: number;
  let d: number;

  if (iso) {
    [, y, m, d] = iso.map(Number) as [number, number, number, number];
  } else if (slashed) {
    const [, a, b, year] = slashed.map(Number) as [number, number, number, number];
    if (a > 12 && b > 12) return { error: `"${value}" is not a valid date` };
    if (a > 12) {
      d = a;
      m = b;
      y = year;
    } else if (b > 12) {
      m = a;
      d = b;
      y = year;
    } else {
      return {
        error: `"${value}" could be day/month or month/day — use YYYY-MM-DD`,
      };
    }
  } else {
    return { error: `"${value}" is not a date the importer recognises` };
  }

  const date = new Date(Date.UTC(y, m - 1, d, hours || 0, minutes || 0));
  if (Number.isNaN(date.getTime()) || date.getUTCMonth() !== m - 1) {
    return { error: `"${value}" is not a valid date` };
  }
  return { iso: date.toISOString() };
}

export type ParseOutcome = {
  rows: PlannerImportRow[];
  /** Problems the server never sees, because they stop a row being sent at all. */
  errors: Array<{ line: number; message: string }>;
  ignoredColumns: string[];
};

/**
 * Turns a sheet into `PlannerImportRow[]`. Names are passed through untouched
 * — resolving them to people is the server's job, since only it can see the
 * member roster.
 */
export function parsePlannerCsv(text: string, meetingTime: string): ParseOutcome {
  const grid = parseCsv(text);
  const errors: ParseOutcome['errors'] = [];
  const ignoredColumns: string[] = [];

  if (grid.length === 0)
    return { rows: [], errors: [{ line: 0, message: 'File is empty' }], ignoredColumns };

  const header = grid[0]!.map(normaliseHeader);
  const dateAt = header.indexOf('date');
  if (dateAt === -1) {
    return {
      rows: [],
      errors: [{ line: 1, message: 'No "Date" column — the first row must be the header' }],
      ignoredColumns,
    };
  }
  const themeAt = header.indexOf('theme');

  const columns = header.map((label, i) => {
    if (i === dateAt || i === themeAt || label === '') return null;
    const spec = COLUMN_MAP[label];
    if (!spec) {
      ignoredColumns.push(grid[0]![i]!.trim());
      return null;
    }
    return spec;
  });

  const rows: PlannerImportRow[] = [];

  for (let r = 1; r < grid.length; r += 1) {
    const line = r + 1;
    const record = grid[r]!;
    const rawDate = (record[dateAt] ?? '').trim();
    if (rawDate === '') {
      errors.push({ line, message: 'Row has no date' });
      continue;
    }

    const parsed = parseDate(rawDate, meetingTime);
    if ('error' in parsed) {
      errors.push({ line, message: parsed.error });
      continue;
    }

    const cells: PlannerImportRow['cells'] = [];
    columns.forEach((spec, i) => {
      if (!spec) return;
      const name = (record[i] ?? '').trim();
      if (name === '') return;
      cells.push({
        roleKey: spec.roleKey,
        ...(spec.slotIndex === undefined ? {} : { slotIndex: spec.slotIndex }),
        name,
      });
    });

    const theme = themeAt === -1 ? '' : (record[themeAt] ?? '').trim();
    rows.push({
      scheduledAt: parsed.iso,
      ...(theme === '' ? {} : { theme }),
      cells,
    });
  }

  return { rows, errors, ignoredColumns: [...new Set(ignoredColumns)] };
}
