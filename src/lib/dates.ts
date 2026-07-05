const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function getLocalDateKey(date = new Date()): string {
  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
  ].join('-');
}

export function parseLocalDateKey(localDate: string): Date {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(localDate: string, days: number): string {
  const date = parseLocalDateKey(localDate);
  date.setDate(date.getDate() + days);
  return getLocalDateKey(date);
}

export function daysBetween(startDate: string, endDate: string): number {
  const start = parseLocalDateKey(startDate);
  const end = parseLocalDateKey(endDate);
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
}

export function getRecentDateKeys(
  days: number,
  endDate = getLocalDateKey(),
): string[] {
  return Array.from({ length: days }, (_, index) =>
    addDays(endDate, index - days + 1),
  );
}

export function formatFriendlyDate(localDate: string, today = getLocalDateKey()) {
  const distance = daysBetween(localDate, today);

  if (distance === 0) {
    return 'Today';
  }

  if (distance === 1) {
    return 'Yesterday';
  }

  return parseLocalDateKey(localDate).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function normalizeCheckInTime(value: string): string | null {
  const match = value.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);

  if (!match) {
    return null;
  }

  return `${pad2(Number(match[1]))}:${match[2]}`;
}

export function parseCheckInTime(value: string): { hour: number; minute: number } {
  const normalized = normalizeCheckInTime(value);

  if (!normalized) {
    throw new Error('Check-in time must use HH:MM 24-hour format.');
  }

  const [hour, minute] = normalized.split(':').map(Number);
  return { hour, minute };
}

export function getCheckInDateTime(
  localDate: string,
  checkInTime: string,
  offsetMinutes = 0,
): Date {
  const date = parseLocalDateKey(localDate);
  const { hour, minute } = parseCheckInTime(checkInTime);
  date.setHours(hour, minute + offsetMinutes, 0, 0);
  return date;
}

export function isPastCheckInTime(
  localDate: string,
  checkInTime: string,
  now = new Date(),
): boolean {
  return now.getTime() >= getCheckInDateTime(localDate, checkInTime).getTime();
}
