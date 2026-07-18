import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('../services/notifications', () => ({
  configureNotificationBehavior: jest.fn(),
  rescheduleProfileNotifications: jest.fn(),
  syncNotificationsAfterEntry: jest.fn(),
  syncNotificationsForDate: jest.fn(),
}));
jest.mock('../services/exportEntries', () => ({
  exportEntriesCsv: jest.fn(),
}));
jest.mock('../storage/database', () => ({
  createDailyEntry: jest.fn(),
  createProfile: jest.fn(),
  deleteAllData: jest.fn(),
  deleteDailyEntry: jest.fn(),
  getAllEntries: jest.fn(),
  getEntries: jest.fn(),
  getEntriesByDate: jest.fn(),
  getProfile: jest.fn(),
  initializeStorage: jest.fn(),
  saveProfile: jest.fn(),
  updateDailyEntry: jest.fn(),
}));

import { CalendarDayButton } from '../../App';
import { CalendarEntryRing } from '../components/CalendarEntryRing';
import type { DailyEntry, HistoryMonthDay } from '../types';

const emptySymptoms = {
  straining: false,
  pain: false,
  bloating: false,
  incompleteEvacuation: false,
};

function entry(id: string, hour: string, hadBowelMovement: boolean): DailyEntry {
  return {
    id,
    localDate: '2026-07-09',
    hadBowelMovement,
    detailsRecorded: true,
    stoolType: hadBowelMovement ? 4 : null,
    symptoms: emptySymptoms,
    laxativeUsed: false,
    laxativeNote: '',
    checkedInAt: `2026-07-09T${hour}:00:00.000Z`,
    createdAt: `2026-07-09T${hour}:00:00.000Z`,
    updatedAt: `2026-07-09T${hour}:00:00.000Z`,
  };
}

describe('CalendarDayButton', () => {
  it('announces exact counts and renders the event ring', () => {
    const entries = [
      entry('no-first', '08', false),
      entry('no-second', '13', false),
      entry('yes-last', '18', true),
    ];
    const day: HistoryMonthDay = {
      localDate: '2026-07-09',
      label: 'Thu, Jul 9',
      status: 'mixed',
      entries,
      isCurrentMonth: true,
    };
    let renderer: ReactTestRenderer;

    act(() => {
      renderer = create(
        createElement(CalendarDayButton, {
          day,
          selected: true,
          onPress: () => undefined,
        }),
      );
    });

    expect(
      renderer!.root.findByProps({
        accessibilityLabel: 'Thu, Jul 9, 3 logs: 1 yes, 2 no',
      }),
    ).toBeTruthy();
    expect(renderer!.root.findByType(CalendarEntryRing).props.entries).toEqual(
      entries,
    );
  });
});
