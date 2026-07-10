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
    message: `I love you ${profileName}`,
    shownDate: today,
  };
}

export function isDailyOpenLoveNoticeMessage(message: string): boolean {
  return message.startsWith('I love you ');
}
