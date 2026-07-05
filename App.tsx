import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
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
import type { DailyEntry, HistoryDay, Profile, TabKey, TrendSummary } from './src/types';

const tabs: { key: TabKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'history', label: 'History' },
  { key: 'trends', label: 'Trends' },
  { key: 'settings', label: 'Settings' },
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

  async function handleLog(hadBowelMovement: boolean) {
    if (!profile) {
      return;
    }

    const entry = await upsertDailyEntry(today, hadBowelMovement);
    await refreshEntries();
    await syncNotificationsAfterEntry(profile, entry);
    setNotice(
      hadBowelMovement
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

          {activeTab === 'trends' ? <TrendsScreen trends={trends} /> : null}

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
  onLog: (hadBowelMovement: boolean) => Promise<void>;
}) {
  const [savingChoice, setSavingChoice] = useState<'yes' | 'no' | null>(null);

  async function handlePress(value: boolean) {
    setSavingChoice(value ? 'yes' : 'no');

    try {
      await onLog(value);
    } finally {
      setSavingChoice(null);
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
            onPress={() => handlePress(true)}
            disabled={savingChoice !== null}
            style={[
              styles.answerButton,
              styles.yesButton,
              entry?.hadBowelMovement === true && styles.selectedYesButton,
            ]}
          >
            <Text
              style={[
                styles.answerButtonText,
                entry?.hadBowelMovement === true && styles.selectedAnswerText,
              ]}
            >
              {savingChoice === 'yes' ? 'Saving...' : 'Yes'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => handlePress(false)}
            disabled={savingChoice !== null}
            style={[
              styles.answerButton,
              styles.noButton,
              entry?.hadBowelMovement === false && styles.selectedNoButton,
            ]}
          >
            <Text
              style={[
                styles.answerButtonText,
                entry?.hadBowelMovement === false && styles.selectedAnswerText,
              ]}
            >
              {savingChoice === 'no' ? 'Saving...' : 'No'}
            </Text>
          </Pressable>
        </View>
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
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Recent history</Text>
      {historyDays.map((day) => (
        <View key={day.localDate} style={styles.historyRow}>
          <View style={styles.historyDateBlock}>
            <Text style={styles.historyLabel}>{day.label}</Text>
            <Text style={styles.historyDate}>{day.localDate}</Text>
          </View>
          <StatusPill
            label={statusText(day.status)}
            tone={statusTone(day.status)}
          />
        </View>
      ))}
    </View>
  );
}

function TrendsScreen({ trends }: { trends: TrendSummary }) {
  return (
    <View>
      <View style={styles.trendGrid}>
        <TrendCard label="Last 7 days" value={`${trends.yesLast7}`} detail="yes logs" />
        <TrendCard label="Last 30 days" value={`${trends.yesLast30}`} detail="yes logs" />
        <TrendCard
          label="Since last yes"
          value={
            trends.daysSinceLastYes === null
              ? '—'
              : `${trends.daysSinceLastYes}`
          }
          detail={trends.daysSinceLastYes === 1 ? 'day' : 'days'}
        />
        <TrendCard
          label="7-day check-ins"
          value={`${trends.checkInRateLast7}%`}
          detail="completed"
        />
      </View>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Missed check-ins</Text>
        <View style={styles.statLine}>
          <Text style={styles.bodyText}>Last 7 days</Text>
          <Text style={styles.statValue}>{trends.missedLast7}</Text>
        </View>
        <View style={styles.statLine}>
          <Text style={styles.bodyText}>Last 30 days</Text>
          <Text style={styles.statValue}>{trends.missedLast30}</Text>
        </View>
      </View>
    </View>
  );
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
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numbers-and-punctuation';
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
        onChangeText={onChangeText}
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

function TrendCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <View style={styles.trendCard}>
      <Text style={styles.trendLabel}>{label}</Text>
      <Text style={styles.trendValue}>{value}</Text>
      <Text style={styles.trendDetail}>{detail}</Text>
    </View>
  );
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
  trendGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 14,
  },
  trendCard: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 128,
    padding: 14,
  },
  trendLabel: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '800',
  },
  trendValue: {
    color: palette.ink,
    fontSize: 36,
    fontWeight: '900',
    marginTop: 10,
  },
  trendDetail: {
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
});
