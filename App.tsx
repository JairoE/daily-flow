import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  configureNotificationBehavior,
  rescheduleProfileNotifications,
  syncNotificationsAfterEntry,
} from './src/services/notifications';
import {
  createProfile,
  deleteAllData,
  getEntries,
  getProfile,
  initializeStorage,
  saveProfile,
  upsertDailyEntry,
} from './src/storage/database';
import { getLocalDateKey, isPastCheckInTime, normalizeCheckInTime } from './src/lib/dates';
import { buildHistoryDays, summarizeTrends } from './src/lib/trends';
import type {
  DailyEntry,
  DailyEntryInput,
  DailySymptoms,
  HistoryDay,
  Profile,
  StoolType,
  TabKey,
  TrendSummary,
} from './src/types';

const tabs: { key: TabKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'history', label: 'History' },
  { key: 'trends', label: 'Trends' },
  { key: 'settings', label: 'Settings' },
];

const emptySymptoms: DailySymptoms = {
  straining: false,
  pain: false,
  bloating: false,
  incompleteEvacuation: false,
};

const symptomOptions: { key: keyof DailySymptoms; label: string }[] = [
  { key: 'straining', label: 'Straining' },
  { key: 'pain', label: 'Pain' },
  { key: 'bloating', label: 'Bloating' },
  { key: 'incompleteEvacuation', label: 'Incomplete evacuation' },
];

const stoolTypeOptions: { type: StoolType; label: string; detail: string }[] = [
  { type: 1, label: 'Type 1', detail: 'Separate hard lumps' },
  { type: 2, label: 'Type 2', detail: 'Lumpy sausage shape' },
  { type: 3, label: 'Type 3', detail: 'Cracked sausage shape' },
  { type: 4, label: 'Type 4', detail: 'Smooth soft shape' },
  { type: 5, label: 'Type 5', detail: 'Soft blobs' },
  { type: 6, label: 'Type 6', detail: 'Mushy pieces' },
  { type: 7, label: 'Type 7', detail: 'Watery' },
];

export default function App() {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('today');
  const [notice, setNotice] = useState('');

  const today = getLocalDateKey();
  const includeTodayAsMissed = profile
    ? isPastCheckInTime(today, profile.checkInTime)
    : false;
  const todayEntry =
    entries.find((entry) => entry.localDate === today) ?? null;
  const historyDays = useMemo(
    () =>
      buildHistoryDays(entries, {
        days: 30,
        today,
        includeTodayAsMissed,
      }),
    [entries, today, includeTodayAsMissed],
  );
  const trends = useMemo(
    () =>
      summarizeTrends(entries, {
        today,
        includeTodayAsMissed,
      }),
    [entries, today, includeTodayAsMissed],
  );

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      await initializeStorage();
      await configureNotificationBehavior();
      const storedProfile = await getProfile();
      const storedEntries = await getEntries(30);

      if (storedProfile?.remindersEnabled) {
        await rescheduleProfileNotifications(storedProfile);
      }

      if (!cancelled) {
        setProfile(storedProfile);
        setEntries(storedEntries);
        setReady(true);
      }
    }

    bootstrap().catch((error: unknown) => {
      setNotice(error instanceof Error ? error.message : 'Unable to load app data.');
      setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshEntries() {
    setEntries(await getEntries(30));
  }

  async function handleProfileCreated(nextProfile: Profile) {
    const savedProfile = await saveProfile(nextProfile);
    setProfile(savedProfile);

    if (savedProfile.remindersEnabled) {
      const scheduled = await rescheduleProfileNotifications(savedProfile);
      setNotice(
        scheduled
          ? 'Reminders are set.'
          : 'Reminder preference saved. Notifications are available on iOS and Android devices.',
      );
    }
  }

  async function handleLog(input: DailyEntryInput) {
    if (!profile) {
      return;
    }

    const entry = await upsertDailyEntry(today, input);
    await refreshEntries();
    await syncNotificationsAfterEntry(profile, entry);
    setNotice(
      input.hadBowelMovement
        ? 'Logged for today.'
        : 'Logged for today. Gentle wellness language will stay non-medical.',
    );
  }

  async function handleSaveSettings(nextProfile: Profile) {
    const normalizedTime = normalizeCheckInTime(nextProfile.checkInTime);

    if (!normalizedTime) {
      setNotice('Use HH:MM 24-hour time, such as 09:00 or 20:30.');
      return;
    }

    const savedProfile = await saveProfile({
      ...nextProfile,
      displayName: nextProfile.displayName.trim() || 'Friend',
      checkInTime: normalizedTime,
    });
    setProfile(savedProfile);
    const scheduled = await rescheduleProfileNotifications(savedProfile);
    setNotice(
      savedProfile.remindersEnabled
        ? scheduled
          ? 'Settings saved and reminders refreshed.'
          : 'Settings saved. Notifications are available on iOS and Android devices.'
        : 'Settings saved and reminders turned off.',
    );
  }

  async function clearLocalData() {
    await deleteAllData();
    setProfile(null);
    setEntries([]);
    setActiveTab('today');
    setNotice('');
  }

  function handleDeleteData() {
    Alert.alert(
      'Delete local data?',
      'This removes your profile, check-ins, and reminder records from this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            clearLocalData().catch((error: unknown) => {
              setNotice(
                error instanceof Error
                  ? error.message
                  : 'Unable to delete local data.',
              );
            });
          },
        },
      ],
    );
  }

  if (!ready) {
    return <LoadingScreen />;
  }

  if (!profile) {
    return (
      <OnboardingScreen notice={notice} onComplete={handleProfileCreated} />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.appShell}>
        <View style={styles.header}>
          <View>
            <Text style={styles.appName}>Daily Flow</Text>
            <Text style={styles.headerMeta}>
              {profile.displayName} · Local-only wellness tracker
            </Text>
          </View>
        </View>

        <View style={styles.tabs} accessibilityRole="tablist">
          {tabs.map((tab) => (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === tab.key }}
              onPress={() => setActiveTab(tab.key)}
              style={[
                styles.tabButton,
                activeTab === tab.key && styles.activeTabButton,
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === tab.key && styles.activeTabText,
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {activeTab === 'today' ? (
            <TodayScreen
              entry={todayEntry}
              includeTodayAsMissed={includeTodayAsMissed}
              onLog={handleLog}
            />
          ) : null}

          {activeTab === 'history' ? (
            <HistoryScreen historyDays={historyDays} />
          ) : null}

          {activeTab === 'trends' ? (
            <TrendsScreen trends={trends} historyDays={historyDays} />
          ) : null}

          {activeTab === 'settings' ? (
            <SettingsScreen
              profile={profile}
              onSave={handleSaveSettings}
              onDeleteData={handleDeleteData}
            />
          ) : null}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function LoadingScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.loadingScreen}>
        <ActivityIndicator color={palette.green} size="large" />
        <Text style={styles.loadingText}>Opening Daily Flow</Text>
      </View>
    </SafeAreaView>
  );
}

function OnboardingScreen({
  notice,
  onComplete,
}: {
  notice: string;
  onComplete: (profile: Profile) => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState('');
  const [checkInTime, setCheckInTime] = useState('20:00');
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [privateNotifications, setPrivateNotifications] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleContinue() {
    const normalizedTime = normalizeCheckInTime(checkInTime);

    if (!normalizedTime) {
      setError('Use HH:MM 24-hour time, such as 09:00 or 20:30.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await onComplete(
        createProfile({
          displayName,
          checkInTime: normalizedTime,
          remindersEnabled,
          privateNotifications,
        }),
      );
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Unable to save profile.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.onboardingShell}
      >
        <ScrollView
          contentContainerStyle={styles.onboardingContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brandBlock}>
            <Text style={styles.appNameLarge}>Daily Flow</Text>
            <Text style={styles.subtitle}>
              A private, local-first way to notice bowel movement frequency.
            </Text>
          </View>

          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Profile</Text>
            <LabeledInput
              label="Name or nickname"
              value={displayName}
              placeholder="Friend"
              onChangeText={setDisplayName}
            />
            <LabeledInput
              label="Daily check-in time"
              value={checkInTime}
              placeholder="20:00"
              keyboardType="numbers-and-punctuation"
              onChangeText={setCheckInTime}
            />
            <ToggleRow
              label="Gentle reminders"
              value={remindersEnabled}
              onValueChange={setRemindersEnabled}
            />
            <ToggleRow
              label="Private notification text"
              value={privateNotifications}
              onValueChange={setPrivateNotifications}
            />
          </View>

          <View style={styles.privacyBox}>
            <Text style={styles.privacyTitle}>Privacy note</Text>
            <Text style={styles.bodyText}>
              Your profile and check-ins stay on this device. This app does not
              diagnose, treat, sync, advertise, or send analytics.
            </Text>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}

          <PrimaryButton
            label={saving ? 'Saving...' : 'Start tracking'}
            disabled={saving}
            onPress={handleContinue}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function TodayScreen({
  entry,
  includeTodayAsMissed,
  onLog,
}: {
  entry: DailyEntry | null;
  includeTodayAsMissed: boolean;
  onLog: (input: DailyEntryInput) => Promise<void>;
}) {
  const [hadBowelMovement, setHadBowelMovement] = useState<boolean | null>(
    entry?.hadBowelMovement ?? null,
  );
  const [stoolType, setStoolType] = useState<StoolType | null>(
    entry?.stoolType ?? null,
  );
  const [symptoms, setSymptoms] = useState<DailySymptoms>(
    entry?.symptoms ?? emptySymptoms,
  );
  const [laxativeUsed, setLaxativeUsed] = useState(
    entry?.laxativeUsed ?? false,
  );
  const [laxativeNote, setLaxativeNote] = useState(entry?.laxativeNote ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setHadBowelMovement(entry?.hadBowelMovement ?? null);
    setStoolType(entry?.stoolType ?? null);
    setSymptoms(entry?.symptoms ?? emptySymptoms);
    setLaxativeUsed(entry?.laxativeUsed ?? false);
    setLaxativeNote(entry?.laxativeNote ?? '');
    setError('');
  }, [entry]);

  function handleChoice(value: boolean) {
    setHadBowelMovement(value);
    setError('');

    if (!value) {
      setStoolType(null);
    }
  }

  function toggleSymptom(key: keyof DailySymptoms, value: boolean) {
    setSymptoms((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleSave() {
    if (hadBowelMovement === null) {
      setError('Choose Yes or No first.');
      return;
    }

    if (hadBowelMovement && stoolType === null) {
      setError('Choose a Bristol stool type.');
      return;
    }

    if (laxativeNote.trim().length > 160) {
      setError('Keep the note to 160 characters or fewer.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await onLog({
        hadBowelMovement,
        stoolType: hadBowelMovement ? stoolType : null,
        symptoms,
        laxativeUsed,
        laxativeNote,
      });
    } finally {
      setSaving(false);
    }
  }

  const status = entry
    ? entry.hadBowelMovement
      ? 'Yes logged'
      : 'No logged'
    : includeTodayAsMissed
      ? 'Not checked in yet'
      : 'Ready when you are';

  return (
    <View>
      <View style={styles.heroPanel}>
        <Text style={styles.kicker}>Today</Text>
        <Text style={styles.question}>
          Did you have a bowel movement today?
        </Text>
        <StatusPill
          label={status}
          tone={
            entry?.hadBowelMovement
              ? 'green'
              : entry
                ? 'coral'
                : includeTodayAsMissed
                  ? 'amber'
                  : 'blue'
          }
        />
        <View style={styles.answerRow}>
          <Pressable
            onPress={() => handleChoice(true)}
            disabled={saving}
            style={[
              styles.answerButton,
              styles.yesButton,
              hadBowelMovement === true && styles.selectedYesButton,
            ]}
          >
            <Text
              style={[
                styles.answerButtonText,
                hadBowelMovement === true && styles.selectedAnswerText,
              ]}
            >
              Yes
            </Text>
          </Pressable>
          <Pressable
            onPress={() => handleChoice(false)}
            disabled={saving}
            style={[
              styles.answerButton,
              styles.noButton,
              hadBowelMovement === false && styles.selectedNoButton,
            ]}
          >
            <Text
              style={[
                styles.answerButtonText,
                hadBowelMovement === false && styles.selectedAnswerText,
              ]}
            >
              No
            </Text>
          </Pressable>
        </View>

        {hadBowelMovement ? (
          <View style={styles.inlineSection}>
            <Text style={styles.sectionLabel}>Bristol stool type</Text>
            <View style={styles.stoolGrid}>
              {stoolTypeOptions.map((option) => (
                <Pressable
                  key={option.type}
                  onPress={() => {
                    setStoolType(option.type);
                    setError('');
                  }}
                  style={[
                    styles.stoolButton,
                    stoolType === option.type && styles.selectedStoolButton,
                  ]}
                >
                  <Text
                    style={[
                      styles.stoolButtonLabel,
                      stoolType === option.type && styles.selectedStoolText,
                    ]}
                  >
                    {option.label}
                  </Text>
                  <Text
                    style={[
                      styles.stoolButtonDetail,
                      stoolType === option.type && styles.selectedStoolText,
                    ]}
                  >
                    {option.detail}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.inlineSection}>
          <Text style={styles.sectionLabel}>Symptoms today</Text>
          {symptomOptions.map((option) => (
            <ToggleRow
              key={option.key}
              label={option.label}
              value={symptoms[option.key]}
              onValueChange={(value) => toggleSymptom(option.key, value)}
            />
          ))}
        </View>

        <View style={styles.inlineSection}>
          <Text style={styles.sectionLabel}>Laxative or context</Text>
          <ToggleRow
            label="Laxative used"
            value={laxativeUsed}
            onValueChange={setLaxativeUsed}
          />
          <LabeledInput
            label="Short note"
            value={laxativeNote}
            placeholder="Optional, 160 characters"
            maxLength={160}
            multiline
            onChangeText={setLaxativeNote}
          />
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <PrimaryButton
          label={saving ? 'Saving...' : 'Save today'}
          disabled={saving}
          onPress={handleSave}
        />
      </View>

      <View style={styles.wellnessPanel}>
        <Text style={styles.panelTitle}>Gentle wellness note</Text>
        <Text style={styles.bodyText}>
          Hydration, fiber-rich foods, and any doctor-approved routine can
          support regularity.
        </Text>
      </View>
    </View>
  );
}

function HistoryScreen({ historyDays }: { historyDays: HistoryDay[] }) {
  const chronologicalDays = [...historyDays].reverse();
  const gapLabels = buildHistoryGapLabels(chronologicalDays);

  return (
    <View>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>30-day overview</Text>
        <View style={styles.historyStrip}>
          {chronologicalDays.map((day) => (
            <HistoryTile key={day.localDate} day={day} />
          ))}
        </View>
        {gapLabels.length ? (
          <View style={styles.gapList}>
            {gapLabels.map((gap) => (
              <Text key={`${gap.startDate}-${gap.endDate}`} style={styles.gapText}>
                {gap.length} day gap: {gap.startLabel} to {gap.endLabel}
              </Text>
            ))}
          </View>
        ) : (
          <Text style={styles.chartEmptyText}>No 2+ day gaps in this window.</Text>
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Recent history</Text>
        {historyDays.map((day) => (
          <View key={day.localDate} style={styles.historyRow}>
            <View style={styles.historyDateBlock}>
              <Text style={styles.historyLabel}>{day.label}</Text>
              <Text style={styles.historyDate}>{day.localDate}</Text>
              <Text style={styles.historyDetail}>{historyDetailText(day)}</Text>
            </View>
            <StatusPill
              label={statusText(day.status)}
              tone={statusTone(day.status)}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

function TrendsScreen({
  trends,
  historyDays,
}: {
  trends: TrendSummary;
  historyDays: HistoryDay[];
}) {
  return (
    <View>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Doctor summary</Text>
        <Text style={styles.bodyText}>For discussion with your clinician.</Text>
        <View style={styles.summaryGrid}>
          <SummaryMetric
            label="BM days"
            value={`${trends.bowelMovementDaysLast30}`}
            detail="of 30 days"
          />
          <SummaryMetric
            label="Average"
            value={`${trends.averagePerWeekLast30}`}
            detail="per week"
          />
          <SummaryMetric
            label="Current gap"
            value={formatDaysValue(trends.currentGapDays)}
            detail={pluralize(trends.currentGapDays ?? 0, 'day')}
          />
          <SummaryMetric
            label="Longest gap"
            value={`${trends.longestGapDays}`}
            detail={pluralize(trends.longestGapDays, 'day')}
          />
          <SummaryMetric
            label="Check-ins"
            value={`${trends.checkInRateLast30}%`}
            detail="completed"
          />
          <SummaryMetric
            label="Common Bristol"
            value={
              trends.mostCommonBristolType
                ? `${trends.mostCommonBristolType}`
                : '-'
            }
            detail={
              trends.mostCommonBristolType
                ? 'most logged type'
                : 'not enough detail'
            }
          />
          <SummaryMetric
            label="Symptoms"
            value={`${trends.symptomBurdenDays}`}
            detail="days with any"
          />
          <SummaryMetric
            label="Laxative"
            value={`${trends.laxativeUseDays}`}
            detail="days logged"
          />
        </View>
      </View>

      <ChartPanel title="Weekly frequency">
        <FrequencyBarChart trends={trends} />
      </ChartPanel>

      <ChartPanel title="Rolling 7-day count">
        <RollingTrendChart trends={trends} />
      </ChartPanel>

      <ChartPanel title="Days between bowel movements">
        <IntervalChart trends={trends} />
      </ChartPanel>

      <ChartPanel title="Bristol stool form">
        <BristolDistributionChart trends={trends} />
      </ChartPanel>

      <ChartPanel title="Symptom burden">
        <SymptomBurdenChart trends={trends} />
      </ChartPanel>

      <ChartPanel title="Laxative timeline">
        <LaxativeTimeline historyDays={historyDays} />
      </ChartPanel>

      <ChartPanel title="Data completeness">
        <DataCompletenessChart trends={trends} />
      </ChartPanel>
    </View>
  );
}

function HistoryTile({ day }: { day: HistoryDay }) {
  const selectedSymptomCount = day.entry ? symptomCount(day.entry.symptoms) : 0;

  return (
    <View
      accessible
      accessibilityLabel={`${day.label}, ${statusText(day.status)}${day.entry?.stoolType ? `, Bristol ${day.entry.stoolType}` : ''}`}
      style={[styles.historyTile, historyTileStyle(day.status)]}
    >
      <Text style={styles.historyTileDate}>{Number(day.localDate.slice(-2))}</Text>
      <Text style={styles.historyTileStatus}>{statusAbbreviation(day.status)}</Text>
      {day.entry?.stoolType ? (
        <Text style={styles.historyTileMeta}>B{day.entry.stoolType}</Text>
      ) : null}
      <View style={styles.tileMarkerRow}>
        {selectedSymptomCount > 0 ? (
          <Text style={styles.tileMarker}>S</Text>
        ) : null}
        {day.entry?.laxativeUsed ? <Text style={styles.tileMarker}>L</Text> : null}
      </View>
    </View>
  );
}

function ChartPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>{title}</Text>
      {children}
    </View>
  );
}

function FrequencyBarChart({ trends }: { trends: TrendSummary }) {
  const maxValue = Math.max(
    7,
    ...trends.weeklyFrequency.map((point) => point.count),
  );

  if (!trends.weeklyFrequency.length) {
    return <EmptyChart />;
  }

  return (
    <View>
      <View style={styles.referenceRow}>
        <Text style={styles.chartMeta}>3/week reference</Text>
        <View style={styles.barTrack}>
          <View
            style={[
              styles.referenceFill,
              { width: `${Math.min(100, (3 / maxValue) * 100)}%` },
            ]}
          />
        </View>
      </View>
      {trends.weeklyFrequency.map((point) => (
        <BarRow
          key={`${point.startDate}-${point.endDate}`}
          label={point.label}
          value={point.count}
          maxValue={maxValue}
        />
      ))}
    </View>
  );
}

function RollingTrendChart({ trends }: { trends: TrendSummary }) {
  const maxValue = Math.max(1, ...trends.rolling7.map((point) => point.count));

  if (!trends.rolling7.length) {
    return <EmptyChart />;
  }

  return (
    <View>
      <View style={styles.sparkBars}>
        {trends.rolling7.map((point) => (
          <View
            key={point.localDate}
            accessibilityLabel={`${point.label}: ${point.count} in rolling 7 days`}
            style={[
              styles.sparkBar,
              {
                height: Math.max(4, Math.round((point.count / maxValue) * 58)),
              },
            ]}
          />
        ))}
      </View>
      <View style={styles.chartAxis}>
        <Text style={styles.chartMeta}>30 days ago</Text>
        <Text style={styles.chartMeta}>Today</Text>
      </View>
    </View>
  );
}

function IntervalChart({ trends }: { trends: TrendSummary }) {
  const intervals = trends.intervals.filter(
    (point) => point.daysSincePrevious !== null,
  );
  const maxValue = Math.max(
    1,
    ...intervals.map((point) => point.daysSincePrevious ?? 0),
  );

  if (!intervals.length) {
    return <EmptyChart />;
  }

  return (
    <View>
      {intervals.map((point) => (
        <BarRow
          key={point.localDate}
          label={point.label}
          value={point.daysSincePrevious ?? 0}
          maxValue={maxValue}
          suffix="d"
        />
      ))}
    </View>
  );
}

function BristolDistributionChart({ trends }: { trends: TrendSummary }) {
  const maxValue = Math.max(
    1,
    ...trends.bristolDistribution.map((item) => item.count),
  );
  const total = trends.bristolDistribution.reduce(
    (sum, item) => sum + item.count,
    0,
  );

  if (total === 0) {
    return <EmptyChart />;
  }

  return (
    <View>
      {trends.bristolDistribution.map((item) => (
        <View key={item.type} style={styles.chartRow}>
          <Text style={styles.chartLabel}>Type {item.type}</Text>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                bristolBarStyle(item.type),
                { width: `${(item.count / maxValue) * 100}%` },
              ]}
            />
          </View>
          <Text style={styles.chartValue}>{item.count}</Text>
        </View>
      ))}
      <Text style={styles.chartMeta}>
        Types 1-2 hard/lumpy, 3-4 formed, 5-7 loose/watery.
      </Text>
    </View>
  );
}

function SymptomBurdenChart({ trends }: { trends: TrendSummary }) {
  const symptomRows = symptomOptions.map((option) => ({
    label: option.label,
    value: trends.symptomCounts[option.key],
  }));
  const total = symptomRows.reduce((sum, row) => sum + row.value, 0);
  const maxValue = Math.max(1, ...symptomRows.map((row) => row.value));

  if (total === 0) {
    return <EmptyChart />;
  }

  return (
    <View>
      <Text style={styles.chartMeta}>
        {trends.symptomBurdenDays} days with one or more symptoms.
      </Text>
      {symptomRows.map((row) => (
        <BarRow
          key={row.label}
          label={row.label}
          value={row.value}
          maxValue={maxValue}
        />
      ))}
    </View>
  );
}

function LaxativeTimeline({ historyDays }: { historyDays: HistoryDay[] }) {
  const chronologicalDays = [...historyDays].reverse();
  const hasDetails = chronologicalDays.some(
    (day) => day.entry?.detailsRecorded,
  );

  if (!hasDetails) {
    return <EmptyChart />;
  }

  return (
    <View>
      <View style={styles.timelineStrip}>
        {chronologicalDays.map((day) => (
          <View key={day.localDate} style={styles.timelineDay}>
            <View
              style={[
                styles.timelineDot,
                day.entry?.laxativeUsed && styles.timelineDotActive,
              ]}
            />
          </View>
        ))}
      </View>
      <View style={styles.chartAxis}>
        <Text style={styles.chartMeta}>30 days ago</Text>
        <Text style={styles.chartMeta}>{laxativeNoteSummary(historyDays)}</Text>
        <Text style={styles.chartMeta}>Today</Text>
      </View>
    </View>
  );
}

function DataCompletenessChart({ trends }: { trends: TrendSummary }) {
  const denominator = trends.completedDaysLast30 + trends.missedLast30;
  const completedWidth =
    denominator === 0 ? 0 : (trends.completedDaysLast30 / denominator) * 100;

  return (
    <View>
      <View style={styles.completionTrack}>
        <View
          style={[
            styles.completionFill,
            { width: `${Math.min(100, completedWidth)}%` },
          ]}
        />
      </View>
      <View style={styles.statLine}>
        <Text style={styles.bodyText}>Answered days</Text>
        <Text style={styles.statValue}>{trends.completedDaysLast30}</Text>
      </View>
      <View style={styles.statLine}>
        <Text style={styles.bodyText}>Missed check-ins</Text>
        <Text style={styles.statValue}>{trends.missedLast30}</Text>
      </View>
    </View>
  );
}

function BarRow({
  label,
  value,
  maxValue,
  suffix = '',
}: {
  label: string;
  value: number;
  maxValue: number;
  suffix?: string;
}) {
  return (
    <View style={styles.chartRow}>
      <Text style={styles.chartLabel}>{label}</Text>
      <View style={styles.barTrack}>
        <View
          style={[
            styles.barFill,
            { width: `${maxValue === 0 ? 0 : (value / maxValue) * 100}%` },
          ]}
        />
      </View>
      <Text style={styles.chartValue}>
        {value}
        {suffix}
      </Text>
    </View>
  );
}

function EmptyChart() {
  return <Text style={styles.chartEmptyText}>More check-ins will fill this in.</Text>;
}

function SettingsScreen({
  profile,
  onSave,
  onDeleteData,
}: {
  profile: Profile;
  onSave: (profile: Profile) => Promise<void>;
  onDeleteData: () => void;
}) {
  const [draft, setDraft] = useState(profile);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(profile);
  }, [profile]);

  async function handleSave() {
    setSaving(true);

    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Profile</Text>
        <LabeledInput
          label="Name or nickname"
          value={draft.displayName}
          onChangeText={(displayName) => setDraft({ ...draft, displayName })}
        />
        <LabeledInput
          label="Daily check-in time"
          value={draft.checkInTime}
          keyboardType="numbers-and-punctuation"
          onChangeText={(checkInTime) => setDraft({ ...draft, checkInTime })}
        />
        <ToggleRow
          label="Gentle reminders"
          value={draft.remindersEnabled}
          onValueChange={(remindersEnabled) =>
            setDraft({ ...draft, remindersEnabled })
          }
        />
        <ToggleRow
          label="Private notification text"
          value={draft.privateNotifications}
          onValueChange={(privateNotifications) =>
            setDraft({ ...draft, privateNotifications })
          }
        />
        <ToggleRow
          label="Privacy lock preference"
          value={draft.privacyLockEnabled}
          onValueChange={(privacyLockEnabled) =>
            setDraft({ ...draft, privacyLockEnabled })
          }
        />
        <PrimaryButton
          label={saving ? 'Saving...' : 'Save settings'}
          disabled={saving}
          onPress={handleSave}
        />
      </View>

      <View style={styles.privacyBox}>
        <Text style={styles.privacyTitle}>Sensitive data</Text>
        <Text style={styles.bodyText}>
          Data is stored locally on this device. Private reminders hide bowel
          movement wording from notification text.
        </Text>
      </View>

      <Pressable style={styles.deleteButton} onPress={onDeleteData}>
        <Text style={styles.deleteButtonText}>Delete local data</Text>
      </Pressable>
    </View>
  );
}

function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  maxLength,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numbers-and-punctuation';
  maxLength?: number;
  multiline?: boolean;
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        placeholder={placeholder}
        placeholderTextColor={palette.muted}
        keyboardType={keyboardType}
        maxLength={maxLength}
        multiline={multiline}
        onChangeText={onChangeText}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: palette.border, true: palette.mint }}
        thumbColor={value ? palette.green : palette.surface}
      />
    </View>
  );
}

function PrimaryButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[styles.primaryButton, disabled && styles.disabledButton]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: 'green' | 'coral' | 'amber' | 'blue';
}) {
  return (
    <View style={[styles.statusPill, statusPillStyle(tone)]}>
      <Text style={[styles.statusPillText, statusPillTextStyle(tone)]}>
        {label}
      </Text>
    </View>
  );
}

function SummaryMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <View style={styles.summaryMetric}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryDetail}>{detail}</Text>
    </View>
  );
}

function buildHistoryGapLabels(chronologicalDays: HistoryDay[]) {
  const gaps: {
    startDate: string;
    endDate: string;
    startLabel: string;
    endLabel: string;
    length: number;
  }[] = [];
  let activeGap: HistoryDay[] = [];
  let seenYes = false;

  for (const day of chronologicalDays) {
    if (day.status === 'pending') {
      continue;
    }

    if (day.status === 'yes') {
      if (seenYes && activeGap.length >= 2) {
        const first = activeGap[0];
        const last = activeGap[activeGap.length - 1];
        gaps.push({
          startDate: first.localDate,
          endDate: last.localDate,
          startLabel: first.label,
          endLabel: last.label,
          length: activeGap.length,
        });
      }

      seenYes = true;
      activeGap = [];
      continue;
    }

    if (seenYes && (day.status === 'no' || day.status === 'missed')) {
      activeGap.push(day);
    }
  }

  if (seenYes && activeGap.length >= 2) {
    const first = activeGap[0];
    const last = activeGap[activeGap.length - 1];
    gaps.push({
      startDate: first.localDate,
      endDate: last.localDate,
      startLabel: first.label,
      endLabel: last.label,
      length: activeGap.length,
    });
  }

  return gaps;
}

function symptomCount(symptoms: DailySymptoms): number {
  return symptomOptions.filter((option) => symptoms[option.key]).length;
}

function symptomNames(symptoms: DailySymptoms): string[] {
  return symptomOptions
    .filter((option) => symptoms[option.key])
    .map((option) => option.label);
}

function historyDetailText(day: HistoryDay): string {
  if (!day.entry) {
    return day.status === 'pending' ? 'Waiting for check-in' : 'No check-in';
  }

  if (!day.entry.detailsRecorded) {
    return 'Earlier yes/no log';
  }

  const parts: string[] = [];

  if (day.entry.stoolType) {
    parts.push(`Bristol ${day.entry.stoolType}`);
  }

  const symptoms = symptomNames(day.entry.symptoms);

  if (symptoms.length) {
    parts.push(symptoms.join(', '));
  }

  if (day.entry.laxativeUsed) {
    parts.push('Laxative used');
  }

  if (day.entry.laxativeNote.trim()) {
    parts.push(`Note: ${day.entry.laxativeNote.trim()}`);
  }

  return parts.length ? parts.join(' · ') : 'No added details';
}

function laxativeNoteSummary(historyDays: HistoryDay[]): string {
  const count = historyDays.filter(
    (day) => day.entry?.detailsRecorded && day.entry.laxativeNote.trim(),
  ).length;

  return count === 1 ? '1 note' : `${count} notes`;
}

function formatDaysValue(value: number | null): string {
  return value === null ? '-' : `${value}`;
}

function pluralize(value: number, singular: string): string {
  return value === 1 ? singular : `${singular}s`;
}

function statusAbbreviation(status: HistoryDay['status']): string {
  if (status === 'yes') {
    return 'Y';
  }

  if (status === 'no') {
    return 'N';
  }

  if (status === 'missed') {
    return 'M';
  }

  return 'P';
}

function statusText(status: HistoryDay['status']): string {
  if (status === 'yes') {
    return 'Yes';
  }

  if (status === 'no') {
    return 'No';
  }

  if (status === 'missed') {
    return 'Missed';
  }

  return 'Pending';
}

function statusTone(status: HistoryDay['status']): 'green' | 'coral' | 'amber' | 'blue' {
  if (status === 'yes') {
    return 'green';
  }

  if (status === 'no') {
    return 'coral';
  }

  if (status === 'missed') {
    return 'amber';
  }

  return 'blue';
}

function statusPillStyle(tone: 'green' | 'coral' | 'amber' | 'blue') {
  return {
    green: styles.greenPill,
    coral: styles.coralPill,
    amber: styles.amberPill,
    blue: styles.bluePill,
  }[tone];
}

function statusPillTextStyle(tone: 'green' | 'coral' | 'amber' | 'blue') {
  return {
    green: styles.greenPillText,
    coral: styles.coralPillText,
    amber: styles.amberPillText,
    blue: styles.bluePillText,
  }[tone];
}

function historyTileStyle(status: HistoryDay['status']) {
  return {
    yes: styles.greenTile,
    no: styles.coralTile,
    missed: styles.amberTile,
    pending: styles.blueTile,
  }[status];
}

function bristolBarStyle(type: StoolType) {
  if (type <= 2) {
    return styles.coralBar;
  }

  if (type <= 4) {
    return styles.greenBar;
  }

  return styles.blueBar;
}

const palette = {
  background: '#F7F4ED',
  surface: '#FFFFFF',
  surfaceAlt: '#F2F7F4',
  ink: '#202124',
  muted: '#66655F',
  border: '#DDD6C8',
  green: '#28765C',
  mint: '#DDF0E8',
  blue: '#2F6FBB',
  blueSoft: '#E8F0FB',
  coral: '#C8513E',
  coralSoft: '#FFE8E2',
  amber: '#93691E',
  amberSoft: '#FFF3D7',
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  appShell: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  header: {
    paddingVertical: 14,
  },
  appName: {
    color: palette.ink,
    fontSize: 28,
    fontWeight: '800',
  },
  appNameLarge: {
    color: palette.ink,
    fontSize: 42,
    fontWeight: '900',
  },
  headerMeta: {
    color: palette.muted,
    fontSize: 14,
    marginTop: 4,
  },
  subtitle: {
    color: palette.muted,
    fontSize: 17,
    lineHeight: 24,
    marginTop: 8,
  },
  tabs: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 12,
    padding: 4,
  },
  tabButton: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  activeTabButton: {
    backgroundColor: palette.ink,
  },
  tabText: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  activeTabText: {
    color: palette.surface,
  },
  content: {
    paddingBottom: 28,
  },
  loadingScreen: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    color: palette.muted,
    fontSize: 16,
    marginTop: 14,
  },
  onboardingShell: {
    flex: 1,
  },
  onboardingContent: {
    padding: 22,
    paddingBottom: 34,
  },
  brandBlock: {
    marginBottom: 22,
    marginTop: 20,
  },
  panel: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    padding: 16,
  },
  heroPanel: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    padding: 18,
  },
  wellnessPanel: {
    backgroundColor: palette.surfaceAlt,
    borderColor: palette.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  kicker: {
    color: palette.blue,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  question: {
    color: palette.ink,
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 36,
    marginBottom: 14,
  },
  answerRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  answerButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 68,
    paddingHorizontal: 10,
  },
  yesButton: {
    backgroundColor: palette.mint,
    borderColor: palette.green,
  },
  noButton: {
    backgroundColor: palette.coralSoft,
    borderColor: palette.coral,
  },
  selectedYesButton: {
    backgroundColor: palette.green,
  },
  selectedNoButton: {
    backgroundColor: palette.coral,
  },
  answerButtonText: {
    color: palette.ink,
    fontSize: 20,
    fontWeight: '900',
  },
  selectedAnswerText: {
    color: palette.surface,
  },
  inlineSection: {
    borderTopColor: palette.border,
    borderTopWidth: 1,
    marginTop: 18,
    paddingTop: 16,
  },
  sectionLabel: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 10,
  },
  stoolGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  stoolButton: {
    backgroundColor: '#FFFEFB',
    borderColor: palette.border,
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: '48%',
    flexGrow: 1,
    minHeight: 78,
    padding: 10,
  },
  selectedStoolButton: {
    backgroundColor: palette.ink,
    borderColor: palette.ink,
  },
  stoolButtonLabel: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: '900',
  },
  stoolButtonDetail: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    marginTop: 4,
  },
  selectedStoolText: {
    color: palette.surface,
  },
  panelTitle: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12,
  },
  bodyText: {
    color: palette.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  privacyBox: {
    backgroundColor: palette.blueSoft,
    borderColor: '#CAD8EA',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    padding: 16,
  },
  privacyTitle: {
    color: palette.blue,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 7,
  },
  input: {
    backgroundColor: '#FFFEFB',
    borderColor: palette.border,
    borderRadius: 8,
    borderWidth: 1,
    color: palette.ink,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  toggleRow: {
    alignItems: 'center',
    borderTopColor: palette.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
  },
  toggleLabel: {
    color: palette.ink,
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    paddingRight: 12,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: palette.ink,
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 16,
  },
  disabledButton: {
    opacity: 0.58,
  },
  primaryButtonText: {
    color: palette.surface,
    fontSize: 16,
    fontWeight: '800',
  },
  deleteButton: {
    alignItems: 'center',
    borderColor: palette.coral,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 50,
  },
  deleteButtonText: {
    color: palette.coral,
    fontSize: 16,
    fontWeight: '800',
  },
  notice: {
    backgroundColor: palette.blueSoft,
    borderColor: '#CAD8EA',
    borderRadius: 8,
    borderWidth: 1,
    color: palette.blue,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: 12,
    padding: 12,
  },
  errorText: {
    color: palette.coral,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
  },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  statusPillText: {
    fontSize: 13,
    fontWeight: '800',
  },
  greenPill: {
    backgroundColor: palette.mint,
    borderColor: palette.green,
  },
  greenPillText: {
    color: palette.green,
  },
  coralPill: {
    backgroundColor: palette.coralSoft,
    borderColor: palette.coral,
  },
  coralPillText: {
    color: palette.coral,
  },
  amberPill: {
    backgroundColor: palette.amberSoft,
    borderColor: palette.amber,
  },
  amberPillText: {
    color: palette.amber,
  },
  bluePill: {
    backgroundColor: palette.blueSoft,
    borderColor: palette.blue,
  },
  bluePillText: {
    color: palette.blue,
  },
  historyStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  historyTile: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    height: 58,
    justifyContent: 'center',
    width: 38,
  },
  greenTile: {
    backgroundColor: palette.mint,
    borderColor: palette.green,
  },
  coralTile: {
    backgroundColor: palette.coralSoft,
    borderColor: palette.coral,
  },
  amberTile: {
    backgroundColor: palette.amberSoft,
    borderColor: palette.amber,
  },
  blueTile: {
    backgroundColor: palette.blueSoft,
    borderColor: palette.blue,
  },
  historyTileDate: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: '900',
  },
  historyTileStatus: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 1,
  },
  historyTileMeta: {
    color: palette.muted,
    fontSize: 10,
    fontWeight: '900',
    marginTop: 1,
  },
  tileMarkerRow: {
    flexDirection: 'row',
    gap: 2,
    minHeight: 11,
  },
  tileMarker: {
    color: palette.blue,
    fontSize: 9,
    fontWeight: '900',
  },
  gapList: {
    gap: 6,
    marginTop: 12,
  },
  gapText: {
    color: palette.amber,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  historyRow: {
    alignItems: 'center',
    borderTopColor: palette.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 64,
    paddingVertical: 10,
  },
  historyDateBlock: {
    flex: 1,
    paddingRight: 12,
  },
  historyLabel: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  historyDate: {
    color: palette.muted,
    fontSize: 13,
    marginTop: 2,
  },
  historyDetail: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 5,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 14,
  },
  summaryMetric: {
    borderTopColor: palette.border,
    borderTopWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 96,
    paddingTop: 12,
  },
  summaryLabel: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '800',
  },
  summaryValue: {
    color: palette.ink,
    fontSize: 30,
    fontWeight: '900',
    marginTop: 6,
  },
  summaryDetail: {
    color: palette.muted,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },
  statLine: {
    alignItems: 'center',
    borderTopColor: palette.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  statValue: {
    color: palette.ink,
    fontSize: 20,
    fontWeight: '900',
  },
  chartRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 38,
  },
  chartLabel: {
    color: palette.ink,
    flexBasis: 84,
    flexShrink: 0,
    fontSize: 12,
    fontWeight: '800',
  },
  chartValue: {
    color: palette.ink,
    flexBasis: 34,
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'right',
  },
  chartMeta: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  chartEmptyText: {
    color: palette.muted,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  barTrack: {
    backgroundColor: palette.surfaceAlt,
    borderColor: palette.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    height: 14,
    overflow: 'hidden',
  },
  barFill: {
    backgroundColor: palette.green,
    borderRadius: 8,
    height: '100%',
  },
  referenceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  referenceFill: {
    backgroundColor: palette.amber,
    height: '100%',
    opacity: 0.72,
  },
  coralBar: {
    backgroundColor: palette.coral,
  },
  greenBar: {
    backgroundColor: palette.green,
  },
  blueBar: {
    backgroundColor: palette.blue,
  },
  sparkBars: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 3,
    height: 66,
  },
  sparkBar: {
    backgroundColor: palette.blue,
    borderRadius: 4,
    flex: 1,
    minWidth: 4,
  },
  chartAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  timelineStrip: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
    minHeight: 28,
  },
  timelineDay: {
    alignItems: 'center',
    flex: 1,
    minWidth: 4,
  },
  timelineDot: {
    backgroundColor: palette.border,
    borderRadius: 5,
    height: 9,
    width: 9,
  },
  timelineDotActive: {
    backgroundColor: palette.ink,
  },
  completionTrack: {
    backgroundColor: palette.amberSoft,
    borderColor: palette.border,
    borderRadius: 8,
    borderWidth: 1,
    height: 18,
    marginBottom: 10,
    overflow: 'hidden',
  },
  completionFill: {
    backgroundColor: palette.green,
    height: '100%',
  },
});
