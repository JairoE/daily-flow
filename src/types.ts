export type Profile = {
  id: string;
  displayName: string;
  timezone: string;
  checkInTime: string;
  remindersEnabled: boolean;
  privateNotifications: boolean;
  privacyLockEnabled: boolean;
  dailyOpenLoveShownDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DailyEntry = {
  id: string;
  localDate: string;
  hadBowelMovement: boolean;
  detailsRecorded: boolean;
  stoolType: StoolType | null;
  symptoms: DailySymptoms;
  laxativeUsed: boolean;
  laxativeNote: string;
  checkedInAt: string;
  createdAt: string;
  updatedAt: string;
};

export type StoolType = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type DailySymptoms = {
  straining: boolean;
  pain: boolean;
  bloating: boolean;
  incompleteEvacuation: boolean;
};

export type DailyEntryInput = {
  hadBowelMovement: boolean;
  stoolType?: StoolType | null;
  symptoms?: Partial<DailySymptoms>;
  laxativeUsed?: boolean;
  laxativeNote?: string;
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

export type HistoryMonthDay = HistoryDay & {
  isCurrentMonth: boolean;
};

export type WeeklyFrequencyPoint = {
  label: string;
  startDate: string;
  endDate: string;
  count: number;
};

export type RollingFrequencyPoint = {
  localDate: string;
  label: string;
  count: number;
};

export type IntervalPoint = {
  localDate: string;
  label: string;
  daysSincePrevious: number | null;
};

export type BristolDistributionItem = {
  type: StoolType;
  count: number;
};

export type SymptomCounts = {
  straining: number;
  pain: number;
  bloating: number;
  incompleteEvacuation: number;
};

export type TrendSummary = {
  yesLast7: number;
  yesLast30: number;
  missedLast7: number;
  missedLast30: number;
  daysSinceLastYes: number | null;
  checkInRateLast7: number;
  bowelMovementDaysLast30: number;
  averagePerWeekLast30: number;
  currentGapDays: number | null;
  longestGapDays: number;
  gapCount2Plus: number;
  completedDaysLast30: number;
  checkInRateLast30: number;
  bristolDistribution: BristolDistributionItem[];
  mostCommonBristolType: StoolType | null;
  hardOrLumpyDays: number;
  looseOrWateryDays: number;
  symptomCounts: SymptomCounts;
  symptomBurdenDays: number;
  laxativeUseDays: number;
  noteDays: number;
  detailDays: number;
  weeklyFrequency: WeeklyFrequencyPoint[];
  rolling7: RollingFrequencyPoint[];
  intervals: IntervalPoint[];
};

export type TabKey = 'today' | 'history' | 'trends' | 'settings';
