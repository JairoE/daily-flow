import {
  buildDailyEntriesCsv,
  buildDailyEntriesExportFilename,
} from '../lib/exportData';
import type { DailyEntry } from '../types';

const emptySymptoms = {
  straining: false,
  pain: false,
  bloating: false,
  incompleteEvacuation: false,
};

function entry(values: Partial<DailyEntry> & Pick<DailyEntry, 'localDate'>): DailyEntry {
  const { localDate, ...overrides } = values;

  return {
    id: `entry-${localDate}`,
    localDate,
    hadBowelMovement: false,
    detailsRecorded: true,
    stoolType: null,
    symptoms: emptySymptoms,
    laxativeUsed: false,
    laxativeNote: '',
    checkedInAt: `${localDate}T12:00:00.000Z`,
    createdAt: `${localDate}T12:00:00.000Z`,
    updatedAt: `${localDate}T12:00:00.000Z`,
    ...overrides,
  };
}

describe('export data helpers', () => {
  it('builds a migration-friendly CSV with stable columns and chronological rows', () => {
    const csv = buildDailyEntriesCsv([
      entry({
        localDate: '2026-07-05',
        hadBowelMovement: false,
        symptoms: { ...emptySymptoms, pain: true },
        laxativeNote: 'No movement, mild pain',
      }),
      entry({
        localDate: '2026-07-03',
        hadBowelMovement: true,
        stoolType: 4,
        symptoms: { ...emptySymptoms, straining: true },
        laxativeUsed: true,
        laxativeNote: 'PEG "half dose"',
      }),
    ]);

    expect(csv).toBe(
      [
        'schema_version,id,local_date,had_bowel_movement,details_recorded,stool_type,symptom_straining,symptom_pain,symptom_bloating,symptom_incomplete_evacuation,laxative_used,laxative_note,checked_in_at,created_at,updated_at',
        '1,entry-2026-07-03,2026-07-03,true,true,4,true,false,false,false,true,"PEG ""half dose""",2026-07-03T12:00:00.000Z,2026-07-03T12:00:00.000Z,2026-07-03T12:00:00.000Z',
        '1,entry-2026-07-05,2026-07-05,false,true,,false,true,false,false,false,"No movement, mild pain",2026-07-05T12:00:00.000Z,2026-07-05T12:00:00.000Z,2026-07-05T12:00:00.000Z',
      ].join('\n'),
    );
  });

  it('keeps the header when there are no entries', () => {
    expect(buildDailyEntriesCsv([])).toBe(
      'schema_version,id,local_date,had_bowel_movement,details_recorded,stool_type,symptom_straining,symptom_pain,symptom_bloating,symptom_incomplete_evacuation,laxative_used,laxative_note,checked_in_at,created_at,updated_at',
    );
  });

  it('builds a dated csv filename', () => {
    expect(buildDailyEntriesExportFilename('2026-07-12')).toBe(
      'daily-flow-entries-2026-07-12.csv',
    );
  });
});
