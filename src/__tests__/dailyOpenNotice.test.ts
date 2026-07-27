import { getDailyOpenLoveNotice } from '../lib/dailyOpenNotice';
import type { Profile } from '../types';

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'local-profile',
    displayName: 'Jairo',
    timezone: 'America/New_York',
    checkInTime: '20:00',
    remindersEnabled: true,
    privateNotifications: false,
    privacyLockEnabled: false,
    llmWellnessNotesEnabled: false,
    llmWellnessNoteEndpoint: '',
    llmWellnessNoteAccessToken: '',
    dailyOpenLoveShownDate: null,
    createdAt: '2026-07-05T12:00:00.000Z',
    updatedAt: '2026-07-05T12:00:00.000Z',
    ...overrides,
  };
}

describe('daily open notice', () => {
  it('builds the love message the first time a profile opens the app each day', () => {
    expect(getDailyOpenLoveNotice(profile(), '2026-07-10')).toEqual({
      message: 'Glad to see you Jairo',
      shownDate: '2026-07-10',
    });
  });

  it('does not repeat the message after it has been shown for the day', () => {
    expect(
      getDailyOpenLoveNotice(
        profile({ dailyOpenLoveShownDate: '2026-07-10' }),
        '2026-07-10',
      ),
    ).toBeNull();
  });

  it('shows again on the next day', () => {
    expect(
      getDailyOpenLoveNotice(
        profile({ dailyOpenLoveShownDate: '2026-07-10' }),
        '2026-07-11',
      ),
    ).toEqual({
      message: 'Glad to see you Jairo',
      shownDate: '2026-07-11',
    });
  });
});
