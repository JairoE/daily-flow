import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
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
import { exportEntriesCsv } from './src/services/exportEntries';
import {
  createProfile,
  deleteAllData,
  getAllEntries,
  getEntries,
  getProfile,
  initializeStorage,
  saveProfile,
  upsertDailyEntry,
} from './src/storage/database';
import {
  addDays,
  getLocalDateKey,
  isPastCheckInTime,
  normalizeCheckInTime,
  parseLocalDateKey,
} from './src/lib/dates';
import {
  buildHistoryDays,
  buildMonthHistoryDays,
  summarizeTrends,
} from './src/lib/trends';
import {
  getDailyLogSuccessMessage,
  isDailyLogSuccessMessage,
} from './src/lib/dailyLogFeedback';
import {
  getDailyOpenLoveNotice,
  isDailyOpenLoveNoticeMessage,
} from './src/lib/dailyOpenNotice';
import {
  buildLlmWellnessNotePayload,
  getInitialWellnessNoteDisplayState,
  requestLlmWellnessNote,
  resolveWellnessNoteDisplayState,
} from './src/lib/llmWellnessNotes';
import type { WellnessNoteDisplayState } from './src/lib/llmWellnessNotes';
import {
  MAX_WELLNESS_QUESTION_CHARS,
  requestLlmWellnessAnswer,
} from './src/lib/llmWellnessQuestions';
import {
  flowBetterTab,
  primaryTabs,
  resolveAccessibleTab,
} from './src/lib/navigation';
import { getFallbackWellnessNote } from './src/lib/wellnessNotes';
import type {
  DailyEntry,
  DailyEntryInput,
  DailySymptoms,
  HistoryDay,
  HistoryMonthDay,
  Profile,
  StoolType,
  TabKey,
  TrendSummary,
} from './src/types';

const entryLoadLimit = 90;

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
  const [noticeKey, setNoticeKey] = useState(0);

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
  const monthHistoryDays = useMemo(
    () =>
      buildMonthHistoryDays(entries, {
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
    setActiveTab((current) =>
      resolveAccessibleTab(
        current,
        Boolean(profile?.llmWellnessNotesEnabled),
      ),
    );
  }, [profile?.llmWellnessNotesEnabled]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      await initializeStorage();
      await configureNotificationBehavior();
      const storedProfile = await getProfile();
      const storedEntries = await getEntries(entryLoadLimit);
      const dailyOpenNotice = storedProfile
        ? getDailyOpenLoveNotice(storedProfile, today)
        : null;
      const nextProfile =
        storedProfile && dailyOpenNotice
          ? await saveProfile({
              ...storedProfile,
              dailyOpenLoveShownDate: dailyOpenNotice.shownDate,
            })
          : storedProfile;

      if (nextProfile?.remindersEnabled) {
        await rescheduleProfileNotifications(nextProfile);
      }

      if (!cancelled) {
        setProfile(nextProfile);
        setEntries(storedEntries);
        if (dailyOpenNotice) {
          setNotice(dailyOpenNotice.message);
          setNoticeKey((current) => current + 1);
        }
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
    const nextEntries = await getEntries(entryLoadLimit);
    setEntries(nextEntries);
    return nextEntries;
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
    const nextEntries = await refreshEntries();
    await syncNotificationsAfterEntry(profile, entry);
    setNotice(
      getDailyLogSuccessMessage(nextEntries, {
        today,
        loggedAt: new Date(entry.checkedInAt),
      }),
    );
    setNoticeKey((current) => current + 1);
  }

  async function handleLogForDate(localDate: string, input: DailyEntryInput) {
    if (!profile) {
      return;
    }

    const entry = await upsertDailyEntry(localDate, input);
    await refreshEntries();

    if (localDate === today) {
      await syncNotificationsAfterEntry(profile, entry);
    }

    setNotice(`Saved ${shortMonthDay(localDate)}.`);
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

  async function handleExportData() {
    try {
      const allEntries = await getAllEntries();
      const result = await exportEntriesCsv(allEntries, today);
      setNotice(
        result.delivery === 'web-download'
          ? `CSV download prepared with ${result.rowCount} entries.`
          : `CSV export prepared with ${result.rowCount} entries.`,
      );
    } catch (error: unknown) {
      setNotice(
        error instanceof Error ? error.message : 'Unable to export CSV data.',
      );
    }
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
          <Text style={styles.appName}>
            {activeTab === 'trends'
              ? 'Statistics'
              : activeTab === 'flow-better'
                ? 'Flow Better'
                : 'Daily Flow'}
          </Text>
          <Text style={styles.headerMeta}>
            {profile.displayName} · Local-only wellness tracker
          </Text>
        </View>

        <View style={styles.tabs} accessibilityRole="tablist">
          <View style={styles.primaryTabRow}>
            {primaryTabs.map((tab) => (
              <Pressable
                key={tab.key}
                accessibilityLabel={`Open ${tab.label} tab`}
                accessibilityRole="tab"
                accessibilityState={{ selected: activeTab === tab.key }}
                onPress={() => setActiveTab(tab.key)}
                style={({ pressed }) => [
                  styles.tabButton,
                  pressed && styles.pressedControl,
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

          {profile.llmWellnessNotesEnabled ? (
            <LinearGradient
              colors={[
                palette.rose,
                palette.purple,
                palette.blue,
                palette.green,
              ]}
              end={{ x: 1, y: 0 }}
              start={{ x: 0, y: 0 }}
              style={styles.flowBetterTabOutline}
            >
              <Pressable
                accessibilityLabel={`Open ${flowBetterTab.label} tab`}
                accessibilityRole="tab"
                accessibilityState={{
                  selected: activeTab === flowBetterTab.key,
                }}
                onPress={() => setActiveTab(flowBetterTab.key)}
                style={({ pressed }) => [
                  styles.flowBetterTabButton,
                  activeTab === flowBetterTab.key &&
                    styles.activeFlowBetterTabButton,
                  pressed && styles.pressedControl,
                ]}
              >
                <Text
                  style={[
                    styles.flowBetterTabText,
                    activeTab === flowBetterTab.key && styles.activeTabText,
                  ]}
                >
                  {flowBetterTab.label}
                </Text>
              </Pressable>
            </LinearGradient>
          ) : null}
        </View>

        {notice ? (
          isDailyLogSuccessMessage(notice) ||
          isDailyOpenLoveNoticeMessage(notice) ? (
            <SuccessNotice
              key={noticeKey}
              title={
                isDailyOpenLoveNoticeMessage(notice)
                  ? 'Welcome back'
                  : 'Daily check-in saved'
              }
              message={notice}
            />
          ) : (
            <Text style={styles.notice}>{notice}</Text>
          )
        ) : null}

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

          {activeTab === 'flow-better' ? (
            <FlowBetterScreen
              localDate={today}
              profile={profile}
              trends={trends}
            />
          ) : null}

          {activeTab === 'history' ? (
            <HistoryScreen
              monthDays={monthHistoryDays}
              onLogDate={handleLogForDate}
            />
          ) : null}

          {activeTab === 'trends' ? (
            <TrendsScreen trends={trends} historyDays={historyDays} />
          ) : null}

          {activeTab === 'settings' ? (
            <SettingsScreen
              profile={profile}
              onSave={handleSaveSettings}
              onExportData={handleExportData}
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

function useReduceMotionPreference() {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) {
          setReduceMotion(enabled);
        }
      })
      .catch(() => undefined);

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}

function SuccessNotice({ title, message }: { title: string; message: string }) {
  const reduceMotion = useReduceMotionPreference();
  const entrance = useRef(new Animated.Value(1)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const useNativeDriver = Platform.OS !== 'web';

  useEffect(() => {
    entrance.stopAnimation();

    if (reduceMotion) {
      entrance.setValue(1);
      return;
    }

    entrance.setValue(0);
    Animated.spring(entrance, {
      toValue: 1,
      damping: 14,
      mass: 0.8,
      stiffness: 160,
      useNativeDriver,
    }).start();
  }, [entrance, message, reduceMotion, useNativeDriver]);

  useEffect(() => {
    spin.stopAnimation();
    spin.setValue(0);

    if (reduceMotion) {
      return;
    }

    const animation = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 3200,
        easing: Easing.linear,
        useNativeDriver,
      }),
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [message, reduceMotion, spin, useNativeDriver]);

  const entranceStyle = reduceMotion
    ? null
    : {
        opacity: entrance,
        transform: [
          {
            translateY: entrance.interpolate({
              inputRange: [0, 1],
              outputRange: [-6, 0],
            }),
          },
          {
            scale: entrance.interpolate({
              inputRange: [0, 1],
              outputRange: [0.97, 1],
            }),
          },
        ],
      };
  const spinStyle = reduceMotion
    ? null
    : {
        transform: [
          {
            rotate: spin.interpolate({
              inputRange: [0, 1],
              outputRange: ['0deg', '360deg'],
            }),
          },
        ],
      };

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[styles.successNoticeShell, entranceStyle]}
    >
      <Animated.View
        style={[styles.successNoticeGlow, styles.nonInteractive, spinStyle]}
      >
        <View
          style={[styles.successNoticeGlowPatch, styles.successNoticeGlowMint]}
        />
        <View
          style={[styles.successNoticeGlowPatch, styles.successNoticeGlowBlue]}
        />
        <View
          style={[styles.successNoticeGlowPatch, styles.successNoticeGlowRose]}
        />
        <View
          style={[
            styles.successNoticeGlowPatch,
            styles.successNoticeGlowPurple,
          ]}
        />
      </Animated.View>
      <View style={styles.successNoticeInner}>
        <Text style={styles.successNoticeTitle}>{title}</Text>
        <Text style={styles.successNoticeText}>{message}</Text>
      </View>
    </Animated.View>
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

export function TodayScreen({
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
            accessibilityLabel="Log yes for today"
            accessibilityRole="button"
            accessibilityState={{
              disabled: saving,
              selected: hadBowelMovement === true,
            }}
            onPress={() => handleChoice(true)}
            disabled={saving}
            style={({ pressed }) => [
              styles.answerButton,
              styles.yesButton,
              pressed && styles.pressedControl,
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
            accessibilityLabel="Log no for today"
            accessibilityRole="button"
            accessibilityState={{
              disabled: saving,
              selected: hadBowelMovement === false,
            }}
            onPress={() => handleChoice(false)}
            disabled={saving}
            style={({ pressed }) => [
              styles.answerButton,
              styles.noButton,
              pressed && styles.pressedControl,
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
                  accessibilityLabel={`Select ${option.label}: ${option.detail}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: stoolType === option.type }}
                  onPress={() => {
                    setStoolType(option.type);
                    setError('');
                  }}
                  style={({ pressed }) => [
                    styles.stoolButton,
                    pressed && styles.pressedControl,
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
    </View>
  );
}

export function FlowBetterScreen({
  localDate,
  profile,
  trends,
}: {
  localDate: string;
  profile: Profile;
  trends: TrendSummary;
}) {
  const [wellnessNoteState, setWellnessNoteState] =
    useState<WellnessNoteDisplayState>(() =>
      getInitialWellnessNoteDisplayState(profile),
    );
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [questionError, setQuestionError] = useState('');
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const initialState = getInitialWellnessNoteDisplayState(profile);

    setWellnessNoteState(initialState);

    if (initialState.status === 'fallback') {
      return () => {
        cancelled = true;
      };
    }

    requestLlmWellnessNote(profile, buildLlmWellnessNotePayload(trends)).then(
      (note) => {
        if (!cancelled) {
          setWellnessNoteState(resolveWellnessNoteDisplayState(note));
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [
    localDate,
    profile.llmWellnessNoteAccessToken,
    profile.llmWellnessNoteEndpoint,
    profile.llmWellnessNotesEnabled,
    trends,
  ]);

  async function handleAskQuestion() {
    const submittedQuestion = question.trim();

    if (!submittedQuestion) {
      setQuestionError('Enter a question first.');
      return;
    }

    setAsking(true);
    setAnswer('');
    setQuestionError('');

    try {
      const result = await requestLlmWellnessAnswer(
        profile,
        submittedQuestion,
        buildLlmWellnessNotePayload(trends),
      );

      if (result.ok) {
        setAnswer(result.answer);
        return;
      }

      if (result.reason === 'not-configured') {
        setQuestionError(
          'Add your Pro+ endpoint and access code in Settings.',
        );
      } else if (result.reason === 'invalid-question') {
        setQuestionError('Keep your question between 1 and 500 characters.');
      } else {
        setQuestionError('Unable to answer right now. Please try again.');
      }
    } finally {
      setAsking(false);
    }
  }

  const wellnessNote =
    wellnessNoteState.status === 'generated'
      ? wellnessNoteState.note
      : wellnessNoteState.status === 'fallback'
        ? getFallbackWellnessNote(localDate)
        : null;

  return (
    <View>
      <View style={styles.wellnessPanel}>
        <Text style={styles.panelTitle}>Gentle wellness note</Text>
        <View style={styles.wellnessNoteContent}>
          {wellnessNoteState.status === 'loading' ? (
            <View
              accessibilityLabel="Preparing gentle wellness note"
              accessibilityRole="progressbar"
              style={styles.wellnessNoteLoading}
            >
              <ActivityIndicator color={palette.green} size="small" />
              <Text style={styles.bodyText}>Preparing your note...</Text>
            </View>
          ) : (
            <Text style={styles.bodyText}>{wellnessNote}</Text>
          )}
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Ask about your flow</Text>
        <View style={styles.wellnessQuestionForm}>
          <LabeledInput
            label="Question"
            value={question}
            placeholder="What would you like to know?"
            maxLength={MAX_WELLNESS_QUESTION_CHARS}
            multiline
            editable={!asking}
            onChangeText={(value) => {
              setQuestion(value);
              setAnswer('');
              setQuestionError('');
            }}
          />
          <PrimaryButton
            label={asking ? 'Asking...' : 'Ask'}
            disabled={asking}
            onPress={handleAskQuestion}
          />
        </View>

        {asking ? (
          <View
            accessibilityLabel="Preparing wellness answer"
            accessibilityRole="progressbar"
            style={styles.wellnessAnswerStatus}
          >
            <ActivityIndicator color={palette.purple} size="small" />
            <Text style={styles.bodyText}>Preparing an answer...</Text>
          </View>
        ) : null}

        {questionError ? (
          <Text accessibilityLiveRegion="polite" style={styles.errorText}>
            {questionError}
          </Text>
        ) : null}

        {answer ? (
          <View accessibilityLiveRegion="polite" style={styles.wellnessAnswer}>
            <Text style={styles.bodyText}>{answer}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function HistoryScreen({
  monthDays,
  onLogDate,
}: {
  monthDays: HistoryMonthDay[];
  onLogDate: (localDate: string, input: DailyEntryInput) => Promise<void>;
}) {
  const today = getLocalDateKey();
  const defaultEditDate = addDays(today, -1);
  const [selectedDate, setSelectedDate] = useState(defaultEditDate);
  const currentMonthDays = monthDays.filter((day) => day.isCurrentMonth);
  const visibleHistoryDays = currentMonthDays
    .filter((day) => day.localDate <= today)
    .reverse();

  return (
    <View>
      <MonthCalendarCard
        monthDays={monthDays}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
      />

      <BackfillEntryPanel
        localDate={selectedDate}
        onDateChange={setSelectedDate}
        onSave={onLogDate}
      />

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Recent history</Text>
        {visibleHistoryDays.map((day) => (
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

function BackfillEntryPanel({
  localDate,
  onDateChange,
  onSave,
}: {
  localDate: string;
  onDateChange: (localDate: string) => void;
  onSave: (localDate: string, input: DailyEntryInput) => Promise<void>;
}) {
  const [hadBowelMovement, setHadBowelMovement] = useState<boolean | null>(null);
  const [stoolType, setStoolType] = useState<StoolType | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function handleChoice(value: boolean) {
    setHadBowelMovement(value);
    setError('');

    if (!value) {
      setStoolType(null);
    }
  }

  async function handleSave() {
    const normalizedDate = normalizeBackfillLocalDate(localDate);

    if (!normalizedDate) {
      setError('Use a valid date in YYYY-MM-DD format.');
      return;
    }

    if (normalizedDate > getLocalDateKey()) {
      setError('Choose today or an earlier date.');
      return;
    }

    if (hadBowelMovement === null) {
      setError('Choose Yes or No first.');
      return;
    }

    if (hadBowelMovement && stoolType === null) {
      setError('Choose a Bristol stool type.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await onSave(normalizedDate, {
        hadBowelMovement,
        stoolType: hadBowelMovement ? stoolType : null,
      });
      onDateChange(addDays(normalizedDate, -1));
      setHadBowelMovement(null);
      setStoolType(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.panel}>
      <View style={styles.chartCardHeader}>
        <Text style={styles.panelTitle}>Edit any day</Text>
        <Text style={styles.rangeText}>Optional</Text>
      </View>
      <Text style={styles.bodyText}>
        Add or update remembered check-ins for today or any earlier date.
      </Text>
      <View style={styles.backfillForm}>
        <LabeledInput
          label="Date"
          value={localDate}
          placeholder="YYYY-MM-DD"
          keyboardType="numbers-and-punctuation"
          onChangeText={(value) => {
            onDateChange(value);
            setError('');
          }}
        />
        <View style={styles.answerRow}>
          <Pressable
            accessibilityLabel="Backfill yes for selected date"
            accessibilityRole="button"
            accessibilityState={{
              disabled: saving,
              selected: hadBowelMovement === true,
            }}
            disabled={saving}
            onPress={() => handleChoice(true)}
            style={({ pressed }) => [
              styles.answerButton,
              styles.yesButton,
              pressed && styles.pressedControl,
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
            accessibilityLabel="Backfill no for selected date"
            accessibilityRole="button"
            accessibilityState={{
              disabled: saving,
              selected: hadBowelMovement === false,
            }}
            disabled={saving}
            onPress={() => handleChoice(false)}
            style={({ pressed }) => [
              styles.answerButton,
              styles.noButton,
              pressed && styles.pressedControl,
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
                  accessibilityLabel={`Select ${option.label}: ${option.detail}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: stoolType === option.type }}
                  onPress={() => {
                    setStoolType(option.type);
                    setError('');
                  }}
                  style={({ pressed }) => [
                    styles.stoolButton,
                    pressed && styles.pressedControl,
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
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <PrimaryButton
        label={saving ? 'Saving...' : 'Save selected day'}
        disabled={saving}
        onPress={handleSave}
      />
    </View>
  );
}

function MonthCalendarCard({
  monthDays,
  selectedDate,
  onSelectDate,
}: {
  monthDays: HistoryMonthDay[];
  selectedDate: string;
  onSelectDate: (localDate: string) => void;
}) {
  const currentMonthDay =
    monthDays.find((day) => day.isCurrentMonth) ?? monthDays[0];
  const monthTitle = currentMonthDay
    ? parseLocalDateKey(currentMonthDay.localDate).toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      })
    : 'Current month';
  const weekdayLabels = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  return (
    <View style={styles.calendarPanel}>
      <View style={styles.calendarHeader}>
        <Text style={styles.calendarTitle}>{monthTitle}</Text>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.calendarNavGlyphs}
        >
          <Text style={styles.calendarNavGlyph}>‹</Text>
          <Text style={[styles.calendarNavGlyph, styles.calendarNavGlyphMuted]}>
            ›
          </Text>
        </View>
      </View>

      <View style={styles.calendarWeekdayRow}>
        {weekdayLabels.map((label) => (
          <Text key={label} style={styles.calendarWeekday}>
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.calendarGrid}>
        {monthDays.map((day) => (
          <CalendarDayButton
            key={day.localDate}
            day={day}
            selected={day.localDate === selectedDate}
            onPress={() => onSelectDate(day.localDate)}
          />
        ))}
      </View>
    </View>
  );
}

function CalendarDayButton({
  day,
  selected,
  onPress,
}: {
  day: HistoryMonthDay;
  selected: boolean;
  onPress: () => void;
}) {
  const answered = day.status === 'yes' || day.status === 'no';

  return (
    <Pressable
      accessibilityLabel={`${day.label}, ${statusText(day.status)}${
        day.isCurrentMonth ? '' : ', outside current month'
      }`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.calendarDayCell,
        pressed && styles.pressedControl,
      ]}
    >
      <View
        style={[
          styles.calendarDayBubble,
          !day.isCurrentMonth && styles.calendarDayBubbleOutside,
          answered && styles.calendarDayBubbleLogged,
          day.status === 'no' && styles.calendarDayBubbleNo,
          selected && styles.calendarDayBubbleSelected,
        ]}
      >
        {answered ? (
          <View
            style={[
              styles.calendarLoggedAccent,
              day.status === 'no' && styles.calendarLoggedAccentNo,
            ]}
          />
        ) : null}
        <Text
          style={[
            styles.calendarDayText,
            !day.isCurrentMonth && styles.calendarDayTextOutside,
            selected && styles.calendarDayTextSelected,
          ]}
        >
          {Number(day.localDate.slice(-2))}
        </Text>
      </View>
    </Pressable>
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
      <SectionHeader title="Records" range="Last 30 Days" />
      <View style={styles.recordsPanel}>
        <Text style={styles.bodyText}>For discussion with your clinician.</Text>
        <View style={styles.summaryGrid}>
          <SummaryMetric
            label="Current gap"
            value={formatDaysValue(trends.currentGapDays)}
            detail={pluralize(trends.currentGapDays ?? 0, 'day')}
            tone="amber"
          />
          <SummaryMetric
            label="Longest gap"
            value={`${trends.longestGapDays}`}
            detail={pluralize(trends.longestGapDays, 'day')}
            tone="purple"
          />
          <SummaryMetric
            label="Completed"
            value={`${trends.completedDaysLast30}`}
            detail="check-ins"
            tone="rose"
          />
          <SummaryMetric
            label="Success rate"
            value={`${trends.checkInRateLast30}%`}
            detail="completed"
            tone="green"
          />
          <SummaryMetric
            label="BM days"
            value={`${trends.bowelMovementDaysLast30}`}
            detail="of 30 days"
            tone="blue"
          />
          <SummaryMetric
            label="Average BMs"
            value={`${trends.averageBowelMovementsPerWeekLast30}`}
            detail="movements per week"
            tone="teal"
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
            tone="slate"
          />
          <SummaryMetric
            label="Symptom logs"
            value={`${trends.symptomBurdenEntriesLast30}`}
            detail="entries with any"
            tone="coral"
          />
        </View>
      </View>

      <SectionHeader title={formatRecentWeekRange(historyDays)} range="Last 7 Days" />
      <View style={styles.panel}>
        <HabitWeekMatrix historyDays={historyDays} />
      </View>

      <SectionHeader title="Progress" range="Last 7 Days" />
      <View style={styles.panel}>
        <RecentProgressChart historyDays={historyDays} />
      </View>

      <ChartPanel title="Weekly frequency" range="Last 30 Days">
        <FrequencyBarChart trends={trends} />
      </ChartPanel>

      <ChartPanel title="Days between bowel movements" range="Last 30 Days">
        <IntervalChart trends={trends} />
      </ChartPanel>

      <ChartPanel title="Bristol stool form" range="Last 30 Days">
        <BristolDistributionChart trends={trends} />
      </ChartPanel>

      <ChartPanel title="Symptom burden" range="Last 30 Days">
        <SymptomBurdenChart trends={trends} />
      </ChartPanel>

      <ChartPanel title="Laxative timeline" range="Last 30 Days">
        <LaxativeTimeline historyDays={historyDays} />
      </ChartPanel>

      <ChartPanel title="Data completeness" range="Last 30 Days">
        <DataCompletenessChart trends={trends} />
      </ChartPanel>
    </View>
  );
}

function ChartPanel({
  title,
  range,
  children,
}: {
  title: string;
  range?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.chartCardHeader}>
        <Text style={styles.panelTitle}>{title}</Text>
        {range ? <Text style={styles.rangeText}>{range}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function SectionHeader({ title, range }: { title: string; range?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {range ? <Text style={styles.sectionRange}>{range}</Text> : null}
    </View>
  );
}

function HabitWeekMatrix({ historyDays }: { historyDays: HistoryDay[] }) {
  const days = [...historyDays.slice(0, 7)].reverse();
  const rows = [
    {
      label: 'Check-in',
      tone: 'blue' as const,
      isActive: (day: HistoryDay) => day.status === 'yes' || day.status === 'no',
      isMuted: (day: HistoryDay) => day.status === 'missed' || day.status === 'pending',
    },
    {
      label: 'Movement',
      tone: 'green' as const,
      isActive: (day: HistoryDay) => day.status === 'yes',
      isMuted: (day: HistoryDay) => day.status === 'missed' || day.status === 'pending',
    },
    {
      label: 'Details',
      tone: 'purple' as const,
      isActive: (day: HistoryDay) => day.entry?.detailsRecorded === true,
      isMuted: (day: HistoryDay) => day.status === 'missed' || day.status === 'pending',
    },
    {
      label: 'Symptoms',
      tone: 'rose' as const,
      isActive: (day: HistoryDay) =>
        day.entry ? symptomCount(day.entry.symptoms) > 0 : false,
      isMuted: (day: HistoryDay) => day.status === 'missed' || day.status === 'pending',
    },
    {
      label: 'Context',
      tone: 'amber' as const,
      isActive: (day: HistoryDay) =>
        day.entry?.laxativeUsed === true ||
        Boolean(day.entry?.laxativeNote.trim()),
      isMuted: (day: HistoryDay) => day.status === 'missed' || day.status === 'pending',
    },
  ];

  return (
    <View>
      <View style={styles.matrixHeaderRow}>
        <View style={styles.matrixLabelSpacer} />
        <View style={styles.matrixCells}>
          {days.map((day) => (
            <Text key={day.localDate} style={styles.matrixDayLabel}>
              {weekdayInitial(day.localDate)}
            </Text>
          ))}
        </View>
      </View>
      {rows.map((row) => (
        <View key={row.label} style={styles.matrixRow}>
          <Text numberOfLines={1} style={styles.matrixLabel}>
            {row.label}
          </Text>
          <View style={styles.matrixCells}>
            {days.map((day) => (
              <View
                key={`${row.label}-${day.localDate}`}
                accessible
                accessibilityLabel={`${row.label}, ${day.label}: ${
                  row.isActive(day) ? 'logged' : row.isMuted(day) ? 'not logged' : 'clear'
                }`}
                style={[
                  styles.matrixDot,
                  matrixToneStyle(row.tone),
                  row.isActive(day) && styles.matrixDotActive,
                  row.isMuted(day) && styles.matrixDotMuted,
                ]}
              >
                {row.isActive(day) ? <Text style={styles.matrixCheck}>✓</Text> : null}
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function RecentProgressChart({ historyDays }: { historyDays: HistoryDay[] }) {
  const days = [...historyDays.slice(0, 7)].reverse();

  return (
    <View>
      <View style={styles.progressPlot}>
        <View style={styles.progressGridLineTop} />
        <View style={styles.progressGridLineMiddle} />
        {days.map((day) => {
          const answered = day.status === 'yes' || day.status === 'no';
          const strongHeight = day.status === 'yes' ? 42 : 0;
          const softHeight = answered ? 100 : 12;

          return (
            <View key={day.localDate} style={styles.progressColumn}>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressBarSoftFill,
                    { height: `${softHeight}%` },
                  ]}
                >
                  <View
                    style={[
                      styles.progressBarStrongFill,
                      { height: `${strongHeight}%` },
                    ]}
                  />
                </View>
              </View>
            </View>
          );
        })}
        <View style={styles.progressAxisLabels}>
          <Text style={styles.progressAxisText}>100%</Text>
          <Text style={styles.progressAxisText}>50%</Text>
          <Text style={styles.progressAxisText}>0%</Text>
        </View>
      </View>
      <View style={styles.progressDayRow}>
        {days.map((day) => (
          <Text key={day.localDate} style={styles.progressDayLabel}>
            {weekdayShort(day.localDate)}
          </Text>
        ))}
      </View>
      <View style={styles.progressLegend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, styles.legendSwatchSoft]} />
          <Text style={styles.legendText}>Check-in completed</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, styles.legendSwatchStrong]} />
          <Text style={styles.legendText}>Movement logged</Text>
        </View>
      </View>
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
        {trends.symptomBurdenEntriesLast30} entries with one or more symptoms.
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
  onExportData,
  onDeleteData,
}: {
  profile: Profile;
  onSave: (profile: Profile) => Promise<void>;
  onExportData: () => Promise<void>;
  onDeleteData: () => void;
}) {
  const [draft, setDraft] = useState(profile);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

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

  async function handleExport() {
    setExporting(true);

    try {
      await onExportData();
    } finally {
      setExporting(false);
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
        <Text style={styles.sectionLabel}>Daily Flow Pro+</Text>
        <ToggleRow
          label="Daily Flow Pro+"
          value={draft.llmWellnessNotesEnabled}
          onValueChange={(llmWellnessNotesEnabled) =>
            setDraft({ ...draft, llmWellnessNotesEnabled })
          }
        />
        {draft.llmWellnessNotesEnabled ? (
          <>
            <LabeledInput
              label="Endpoint URL"
              value={draft.llmWellnessNoteEndpoint}
              placeholder="https://your-ngrok-domain/wellness-note"
              onChangeText={(llmWellnessNoteEndpoint) =>
                setDraft({ ...draft, llmWellnessNoteEndpoint })
              }
            />
            <LabeledInput
              label="Access code"
              value={draft.llmWellnessNoteAccessToken}
              placeholder="Local proxy token"
              secureTextEntry
              onChangeText={(llmWellnessNoteAccessToken) =>
                setDraft({ ...draft, llmWellnessNoteAccessToken })
              }
            />
          </>
        ) : null}
        <PrimaryButton
          label={saving ? 'Saving...' : 'Save settings'}
          disabled={saving}
          onPress={handleSave}
        />
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Export data</Text>
        <Text style={styles.bodyText}>
          Save a CSV of every local check-in for a future hosted import.
        </Text>
        <View style={styles.panelAction}>
          <PrimaryButton
            label={exporting ? 'Preparing CSV...' : 'Export CSV'}
            disabled={exporting}
            onPress={handleExport}
          />
        </View>
      </View>

      <View style={styles.privacyBox}>
        <Text style={styles.privacyTitle}>Sensitive data</Text>
        <Text style={styles.bodyText}>
          Data is stored locally on this device. Private reminders hide bowel
          movement wording from notification text. Daily Flow Pro+ sends summary
          counts and any question you choose to submit to your configured proxy.
        </Text>
      </View>

      <Pressable
        accessibilityLabel="Delete local data"
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.deleteButton,
          pressed && styles.pressedControl,
        ]}
        onPress={onDeleteData}
      >
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
  secureTextEntry,
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numbers-and-punctuation';
  maxLength?: number;
  multiline?: boolean;
  secureTextEntry?: boolean;
  editable?: boolean;
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
        secureTextEntry={secureTextEntry}
        editable={editable}
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
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        pressed && styles.pressedControl,
        disabled && styles.disabledButton,
      ]}
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
  tone = 'purple',
}: {
  label: string;
  value: string;
  detail: string;
  tone?: MetricTone;
}) {
  return (
    <View style={styles.summaryMetric}>
      <View style={[styles.metricAccent, metricToneStyle(tone)]} />
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryDetail}>{detail}</Text>
    </View>
  );
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

type MetricTone =
  | 'amber'
  | 'blue'
  | 'coral'
  | 'green'
  | 'purple'
  | 'rose'
  | 'slate'
  | 'teal';

function metricToneStyle(tone: MetricTone) {
  return {
    amber: styles.amberAccent,
    blue: styles.blueAccent,
    coral: styles.coralAccent,
    green: styles.greenAccent,
    purple: styles.purpleAccent,
    rose: styles.roseAccent,
    slate: styles.slateAccent,
    teal: styles.tealAccent,
  }[tone];
}

function matrixToneStyle(tone: MetricTone) {
  return {
    amber: styles.amberMatrixDot,
    blue: styles.blueMatrixDot,
    coral: styles.coralMatrixDot,
    green: styles.greenMatrixDot,
    purple: styles.purpleMatrixDot,
    rose: styles.roseMatrixDot,
    slate: styles.slateMatrixDot,
    teal: styles.tealMatrixDot,
  }[tone];
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

function weekdayInitial(localDate: string): string {
  return parseLocalDateKey(localDate)
    .toLocaleDateString(undefined, { weekday: 'short' })
    .slice(0, 1);
}

function normalizeBackfillLocalDate(value: string): string | null {
  const trimmed = value.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }

  const parsed = parseLocalDateKey(trimmed);
  const normalized = getLocalDateKey(parsed);

  return normalized === trimmed ? normalized : null;
}

function weekdayShort(localDate: string): string {
  return parseLocalDateKey(localDate).toLocaleDateString(undefined, {
    weekday: 'short',
  });
}

function shortMonthDay(localDate: string): string {
  return parseLocalDateKey(localDate).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function formatRecentWeekRange(historyDays: HistoryDay[]): string {
  const days = [...historyDays.slice(0, 7)].reverse();
  const first = days[0];
  const last = days[days.length - 1];

  if (!first || !last) {
    return 'Recent week';
  }

  return `${shortMonthDay(first.localDate)}-${shortMonthDay(last.localDate)}`;
}

const palette = {
  background: '#F4F3FA',
  surface: '#FFFFFF',
  tile: '#F0F0F3',
  tileStrong: '#E7E5F4',
  ink: '#111217',
  muted: '#6F6B78',
  softText: '#8E8996',
  border: '#E5E3EC',
  purple: '#5E4CF3',
  purpleSoft: '#C9C3FF',
  purpleFaint: '#EFEDFF',
  green: '#2FBF6D',
  mint: '#DDF7E9',
  blue: '#2387E8',
  blueSoft: '#E5F2FF',
  teal: '#0891B2',
  tealSoft: '#DDF8FB',
  coral: '#F3414B',
  coralSoft: '#FFE6E8',
  amber: '#FF922E',
  amberSoft: '#FFF0DF',
  rose: '#E7346B',
  roseSoft: '#FFE8F0',
  slate: '#69657B',
  slateSoft: '#ECEAF2',
};

const cardShadow = {
  boxShadow: '0 10px 22px rgba(77, 70, 95, 0.08)',
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
    alignItems: 'center',
    paddingBottom: 14,
    paddingTop: 10,
  },
  appName: {
    color: palette.ink,
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
  },
  appNameLarge: {
    color: palette.ink,
    fontSize: 42,
    fontWeight: '900',
  },
  headerMeta: {
    color: palette.softText,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 5,
    textAlign: 'center',
  },
  subtitle: {
    color: palette.muted,
    fontSize: 17,
    lineHeight: 24,
    marginTop: 8,
  },
  tabs: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: palette.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: 8,
    marginBottom: 14,
    padding: 5,
    ...cardShadow,
  },
  primaryTabRow: {
    flexDirection: 'row',
  },
  tabButton: {
    alignItems: 'center',
    borderRadius: 18,
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  activeTabButton: {
    backgroundColor: palette.purple,
  },
  pressedControl: {
    opacity: 0.78,
  },
  tabText: {
    color: palette.softText,
    fontSize: 13,
    fontWeight: '800',
  },
  activeTabText: {
    color: palette.surface,
  },
  flowBetterTabOutline: {
    borderRadius: 19,
    padding: 2,
  },
  flowBetterTabButton: {
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderRadius: 17,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 12,
  },
  activeFlowBetterTabButton: {
    backgroundColor: palette.purple,
  },
  flowBetterTabText: {
    color: palette.purple,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  content: {
    paddingBottom: 34,
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
    fontWeight: '700',
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
  recordsPanel: {
    backgroundColor: palette.surface,
    borderRadius: 28,
    marginBottom: 24,
    padding: 16,
    ...cardShadow,
  },
  panel: {
    backgroundColor: palette.surface,
    borderRadius: 28,
    marginBottom: 24,
    padding: 16,
    ...cardShadow,
  },
  heroPanel: {
    backgroundColor: palette.surface,
    borderRadius: 28,
    marginBottom: 16,
    padding: 18,
    ...cardShadow,
  },
  wellnessPanel: {
    backgroundColor: palette.surface,
    borderRadius: 24,
    marginBottom: 14,
    padding: 16,
    ...cardShadow,
  },
  wellnessNoteContent: {
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 44,
  },
  wellnessNoteLoading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  wellnessQuestionForm: {
    marginTop: 16,
  },
  wellnessAnswerStatus: {
    alignItems: 'center',
    borderTopColor: palette.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
    paddingTop: 16,
  },
  wellnessAnswer: {
    borderTopColor: palette.border,
    borderTopWidth: 1,
    marginTop: 18,
    paddingTop: 16,
  },
  kicker: {
    color: palette.purple,
    fontSize: 13,
    fontWeight: '900',
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
    borderRadius: 20,
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
    fontWeight: '900',
    marginBottom: 10,
  },
  stoolGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  stoolButton: {
    backgroundColor: palette.tile,
    borderColor: palette.border,
    borderRadius: 18,
    borderWidth: 1,
    flexBasis: '48%',
    flexGrow: 1,
    minHeight: 78,
    padding: 11,
  },
  selectedStoolButton: {
    backgroundColor: palette.purple,
    borderColor: palette.purple,
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
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    color: palette.muted,
    flex: 1,
    fontSize: 26,
    fontWeight: '900',
  },
  sectionRange: {
    color: palette.purple,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'right',
  },
  chartCardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  rangeText: {
    color: palette.purple,
    fontSize: 14,
    fontWeight: '800',
  },
  panelTitle: {
    color: palette.ink,
    flex: 1,
    fontSize: 18,
    fontWeight: '900',
  },
  panelAction: {
    marginTop: 14,
  },
  bodyText: {
    color: palette.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  privacyBox: {
    backgroundColor: palette.blueSoft,
    borderColor: '#C8E2FF',
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 14,
    padding: 16,
  },
  privacyTitle: {
    color: palette.blue,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 8,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 7,
  },
  input: {
    backgroundColor: palette.tile,
    borderColor: palette.border,
    borderRadius: 18,
    borderWidth: 1,
    color: palette.ink,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  backfillForm: {
    marginTop: 14,
  },
  calendarPanel: {
    backgroundColor: palette.surface,
    borderRadius: 28,
    marginBottom: 24,
    paddingHorizontal: 18,
    paddingBottom: 22,
    paddingTop: 18,
    ...cardShadow,
  },
  calendarHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  calendarTitle: {
    color: palette.ink,
    fontSize: 24,
    fontWeight: '900',
  },
  calendarNavGlyphs: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
  },
  calendarNavGlyph: {
    color: palette.purple,
    fontSize: 42,
    fontWeight: '700',
    lineHeight: 44,
  },
  calendarNavGlyphMuted: {
    color: palette.purpleSoft,
  },
  calendarWeekdayRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  calendarWeekday: {
    color: palette.softText,
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 8,
  },
  calendarDayCell: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    width: '14.2857%',
  },
  calendarDayBubble: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: 999,
    borderWidth: 4,
    height: 42,
    justifyContent: 'center',
    position: 'relative',
    width: 42,
  },
  calendarDayBubbleOutside: {
    opacity: 0.42,
  },
  calendarDayBubbleLogged: {
    borderColor: palette.purpleSoft,
  },
  calendarDayBubbleNo: {
    borderColor: '#FFB8BE',
  },
  calendarDayBubbleSelected: {
    backgroundColor: palette.purpleFaint,
  },
  calendarLoggedAccent: {
    backgroundColor: palette.purple,
    borderRadius: 999,
    height: 18,
    position: 'absolute',
    right: 1,
    top: -2,
    transform: [{ rotate: '-28deg' }],
    width: 7,
  },
  calendarLoggedAccentNo: {
    backgroundColor: palette.coral,
  },
  calendarDayText: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  calendarDayTextOutside: {
    color: palette.softText,
  },
  calendarDayTextSelected: {
    color: palette.purple,
    fontWeight: '900',
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
    fontWeight: '800',
    paddingRight: 12,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: palette.purple,
    borderRadius: 20,
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
    fontWeight: '900',
  },
  deleteButton: {
    alignItems: 'center',
    borderColor: palette.coral,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 50,
  },
  deleteButtonText: {
    color: palette.coral,
    fontSize: 16,
    fontWeight: '900',
  },
  notice: {
    backgroundColor: palette.purpleFaint,
    borderColor: palette.purpleSoft,
    borderRadius: 18,
    borderWidth: 1,
    color: palette.purple,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
    marginBottom: 12,
    padding: 12,
  },
  successNoticeShell: {
    backgroundColor: palette.purpleFaint,
    borderRadius: 22,
    marginBottom: 12,
    overflow: 'hidden',
    padding: 3,
    position: 'relative',
    ...cardShadow,
  },
  successNoticeGlow: {
    bottom: -160,
    left: -90,
    position: 'absolute',
    right: -90,
    top: -160,
  },
  nonInteractive: {
    pointerEvents: 'none',
  },
  successNoticeGlowPatch: {
    borderRadius: 999,
    height: '62%',
    position: 'absolute',
    width: '62%',
  },
  successNoticeGlowMint: {
    backgroundColor: palette.green,
    left: 0,
    top: 0,
  },
  successNoticeGlowBlue: {
    backgroundColor: palette.blue,
    right: 0,
    top: 0,
  },
  successNoticeGlowRose: {
    backgroundColor: palette.rose,
    bottom: 0,
    right: 0,
  },
  successNoticeGlowPurple: {
    backgroundColor: palette.purple,
    bottom: 0,
    left: 0,
  },
  successNoticeInner: {
    backgroundColor: palette.surface,
    borderRadius: 19,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  successNoticeTitle: {
    color: palette.purple,
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  successNoticeText: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 21,
  },
  errorText: {
    color: palette.coral,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 12,
  },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  statusPillText: {
    fontSize: 13,
    fontWeight: '900',
  },
  greenPill: {
    backgroundColor: palette.mint,
    borderColor: palette.green,
  },
  greenPillText: {
    color: '#16713F',
  },
  coralPill: {
    backgroundColor: palette.coralSoft,
    borderColor: palette.coral,
  },
  coralPillText: {
    color: '#B51723',
  },
  amberPill: {
    backgroundColor: palette.amberSoft,
    borderColor: palette.amber,
  },
  amberPillText: {
    color: '#9A5300',
  },
  bluePill: {
    backgroundColor: palette.blueSoft,
    borderColor: palette.blue,
  },
  bluePillText: {
    color: '#1264B2',
  },
  historyRow: {
    alignItems: 'center',
    borderTopColor: palette.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 66,
    paddingVertical: 11,
  },
  historyDateBlock: {
    flex: 1,
    paddingRight: 12,
  },
  historyLabel: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  historyDate: {
    color: palette.softText,
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
    backgroundColor: palette.tile,
    borderRadius: 20,
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 112,
    overflow: 'hidden',
    padding: 14,
  },
  metricAccent: {
    alignSelf: 'flex-end',
    borderRadius: 6,
    height: 22,
    marginBottom: 2,
    width: 22,
  },
  summaryLabel: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 3,
    textTransform: 'uppercase',
  },
  summaryValue: {
    color: palette.ink,
    fontSize: 30,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  summaryDetail: {
    color: palette.softText,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 3,
    textAlign: 'center',
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
    fontVariant: ['tabular-nums'],
  },
  chartRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 40,
  },
  chartLabel: {
    color: palette.ink,
    flexBasis: 84,
    flexShrink: 0,
    fontSize: 12,
    fontWeight: '900',
  },
  chartValue: {
    color: palette.ink,
    flexBasis: 34,
    fontSize: 13,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  chartMeta: {
    color: palette.softText,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 18,
  },
  chartEmptyText: {
    color: palette.muted,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  barTrack: {
    backgroundColor: palette.tile,
    borderRadius: 999,
    flex: 1,
    height: 16,
    overflow: 'hidden',
  },
  barFill: {
    backgroundColor: palette.purple,
    borderRadius: 999,
    height: '100%',
  },
  referenceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  referenceFill: {
    backgroundColor: palette.purpleSoft,
    height: '100%',
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
  chartAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  timelineStrip: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
    minHeight: 32,
  },
  timelineDay: {
    alignItems: 'center',
    flex: 1,
    minWidth: 4,
  },
  timelineDot: {
    backgroundColor: palette.border,
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  timelineDotActive: {
    backgroundColor: palette.purple,
  },
  completionTrack: {
    backgroundColor: palette.tile,
    borderRadius: 999,
    height: 18,
    marginBottom: 10,
    overflow: 'hidden',
  },
  completionFill: {
    backgroundColor: palette.purple,
    height: '100%',
  },
  amberAccent: {
    backgroundColor: palette.amber,
  },
  blueAccent: {
    backgroundColor: palette.blue,
  },
  coralAccent: {
    backgroundColor: palette.coral,
  },
  greenAccent: {
    backgroundColor: palette.green,
  },
  purpleAccent: {
    backgroundColor: palette.purple,
  },
  roseAccent: {
    backgroundColor: palette.rose,
  },
  slateAccent: {
    backgroundColor: palette.slate,
  },
  tealAccent: {
    backgroundColor: palette.teal,
  },
  matrixHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 8,
  },
  matrixLabelSpacer: {
    width: 92,
  },
  matrixCells: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 210,
  },
  matrixDayLabel: {
    color: palette.softText,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
    width: 24,
  },
  matrixRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 40,
  },
  matrixLabel: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: '800',
    paddingRight: 8,
    width: 92,
  },
  matrixDot: {
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderRadius: 12,
    borderWidth: 3,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  matrixDotActive: {
    backgroundColor: palette.green,
    borderColor: palette.green,
  },
  matrixDotMuted: {
    backgroundColor: palette.border,
    borderColor: palette.border,
  },
  matrixCheck: {
    color: palette.surface,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 18,
  },
  amberMatrixDot: {
    borderColor: palette.amberSoft,
  },
  blueMatrixDot: {
    borderColor: palette.blueSoft,
  },
  coralMatrixDot: {
    borderColor: palette.coralSoft,
  },
  greenMatrixDot: {
    borderColor: palette.mint,
  },
  purpleMatrixDot: {
    borderColor: palette.purpleSoft,
  },
  roseMatrixDot: {
    borderColor: palette.roseSoft,
  },
  slateMatrixDot: {
    borderColor: palette.slateSoft,
  },
  tealMatrixDot: {
    borderColor: palette.tealSoft,
  },
  progressPlot: {
    borderBottomColor: palette.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    height: 190,
    marginRight: 30,
    paddingHorizontal: 8,
    position: 'relative',
  },
  progressGridLineTop: {
    backgroundColor: palette.border,
    height: 1,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 20,
  },
  progressGridLineMiddle: {
    backgroundColor: palette.border,
    height: 1,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 100,
  },
  progressColumn: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
  },
  progressBar: {
    backgroundColor: palette.tile,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    height: 160,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    width: 28,
  },
  progressBarSoftFill: {
    backgroundColor: palette.purpleSoft,
    justifyContent: 'flex-end',
    width: '100%',
  },
  progressBarStrongFill: {
    backgroundColor: palette.purple,
    width: '100%',
  },
  progressAxisLabels: {
    bottom: -9,
    justifyContent: 'space-between',
    position: 'absolute',
    right: -42,
    top: 10,
  },
  progressAxisText: {
    color: palette.softText,
    fontSize: 13,
    fontWeight: '800',
  },
  progressDayRow: {
    flexDirection: 'row',
    marginRight: 30,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  progressDayLabel: {
    color: palette.muted,
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  progressLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 14,
  },
  legendItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  legendSwatch: {
    borderRadius: 5,
    height: 10,
    width: 18,
  },
  legendSwatchSoft: {
    backgroundColor: palette.purpleSoft,
  },
  legendSwatchStrong: {
    backgroundColor: palette.purple,
  },
  legendText: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '800',
  },
});
