export type Profile = {
  id: string;
  displayName: string;
  timezone: string;
  checkInTime: string;
  remindersEnabled: boolean;
  privateNotifications: boolean;
  privacyLockEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DailyEntry = {
  id: string;
  localDate: string;
  hadBowelMovement: boolean;
  checkedInAt: string;
  createdAt: string;
  updatedAt: string;
};

export type NotificationType =
  | 'daily_checkin'
  | 'logged_no_wellness'
  | 'missed_checkin';

export type NotificationStatus = 'scheduled' | 'sent' | 'canceled';

export type NotificationRecord = {
  id: string;
  localDate: string;
  type: NotificationType;
  notificationId: string;
  status: NotificationStatus;
  createdAt: string;
};

export type HistoryStatus = 'yes' | 'no' | 'missed' | 'pending';

export type HistoryDay = {
  localDate: string;
  label: string;
  status: HistoryStatus;
  entry: DailyEntry | null;
};

export type TrendSummary = {
  yesLast7: number;
  yesLast30: number;
  missedLast7: number;
  missedLast30: number;
  daysSinceLastYes: number | null;
  checkInRateLast7: number;
};

export type TabKey = 'today' | 'history' | 'trends' | 'settings';
