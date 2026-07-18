import type { DailyEntry } from '../types';
import { compareDailyEntries } from './dailyEntries';

const csvSchemaVersion = '1';

const dailyEntriesCsvHeaders = [
  'schema_version',
  'id',
  'local_date',
  'had_bowel_movement',
  'details_recorded',
  'stool_type',
  'symptom_straining',
  'symptom_pain',
  'symptom_bloating',
  'symptom_incomplete_evacuation',
  'laxative_used',
  'laxative_note',
  'checked_in_at',
  'created_at',
  'updated_at',
];

function csvCell(value: string | number | boolean | null): string {
  if (value === null) {
    return '';
  }

  const text = String(value);

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function entryToRow(entry: DailyEntry): string[] {
  return [
    csvSchemaVersion,
    entry.id,
    entry.localDate,
    entry.hadBowelMovement,
    entry.detailsRecorded,
    entry.stoolType,
    entry.symptoms.straining,
    entry.symptoms.pain,
    entry.symptoms.bloating,
    entry.symptoms.incompleteEvacuation,
    entry.laxativeUsed,
    entry.laxativeNote,
    entry.checkedInAt,
    entry.createdAt,
    entry.updatedAt,
  ].map(csvCell);
}

export function buildDailyEntriesCsv(entries: DailyEntry[]): string {
  const sortedEntries = [...entries].sort(
    (a, b) => a.localDate.localeCompare(b.localDate) || compareDailyEntries(a, b),
  );
  const rows = [
    dailyEntriesCsvHeaders,
    ...sortedEntries.map(entryToRow),
  ];

  return rows.map((row) => row.join(',')).join('\n');
}

export function buildDailyEntriesExportFilename(localDate: string): string {
  return `daily-flow-entries-${localDate}.csv`;
}
