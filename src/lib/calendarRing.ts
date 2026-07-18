import type { DailyEntry } from '../types';
import { compareDailyEntries } from './dailyEntries';

export const CALENDAR_YES_COLOR = '#5E4CF3';
export const CALENDAR_NO_COLOR = '#F3414B';

export type CalendarRingSegment = {
  entryId: string;
  color: string;
  dashLength: number;
  dashOffset: number;
};

export function buildCalendarRingSegments(
  entries: DailyEntry[],
  circumference: number,
  gapLength = 4,
): CalendarRingSegment[] {
  if (entries.length === 0 || circumference <= 0) {
    return [];
  }

  const chronologicalEntries = [...entries].sort(compareDailyEntries);

  if (chronologicalEntries.length === 1) {
    const [entry] = chronologicalEntries;

    return [
      {
        entryId: entry.id,
        color: entry.hadBowelMovement
          ? CALENDAR_YES_COLOR
          : CALENDAR_NO_COLOR,
        dashLength: circumference,
        dashOffset: 0,
      },
    ];
  }

  const resolvedGap = Math.min(
    Math.max(0, gapLength),
    circumference / (chronologicalEntries.length * 4),
  );
  const dashLength =
    (circumference - resolvedGap * chronologicalEntries.length) /
    chronologicalEntries.length;
  const step = dashLength + resolvedGap;

  return chronologicalEntries.map((entry, index) => ({
    entryId: entry.id,
    color: entry.hadBowelMovement
      ? CALENDAR_YES_COLOR
      : CALENDAR_NO_COLOR,
    dashLength,
    dashOffset: index === 0 ? 0 : -index * step,
  }));
}
