import type { Profile } from '../types';

export type DailyOpenLoveNotice = {
  message: string;
  shownDate: string;
};

export function getDailyOpenLoveNotice(
  profile: Profile,
  today: string,
): DailyOpenLoveNotice | null {
  if (profile.dailyOpenLoveShownDate === today) {
    return null;
  }

  const profileName = profile.displayName.trim() || 'Friend';

  return {
    message: `Glad to see you ${profileName}`,
    shownDate: today,
  };
}

export function isDailyOpenLoveNoticeMessage(message: string): boolean {
  return message.startsWith('Glad to see you ');
}
