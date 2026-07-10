# Doctor-Friendly History And Trends Design

## Context

Daily Flow is a local-first Expo app that currently tracks one daily answer: whether the user had a bowel movement. The app has four tabs: Today, History, Trends, and Settings. History is a 30-day status list, and Trends shows simple count cards for yes logs, missed logs, days since last yes, and check-in completion.

The next version should make History and Trends easier for a doctor to understand without turning Daily Flow into a diagnostic tool. The app should continue to use gentle wellness language, keep data local by default, and avoid medical claims.

Clinical references support focusing on bowel movement frequency, hard or lumpy stools, difficulty passing stool, and incomplete evacuation. Bristol stool type is a useful structured way to summarize stool form. These signals should be presented as patient-tracked context for discussion with a clinician, not as diagnosis.

References:

- NIDDK: https://www.niddk.nih.gov/health-information/digestive-diseases/constipation/symptoms-causes
- AGA GI Patient Center: https://patient.gastro.org/constipation/
- Cleveland Clinic Bristol Stool Chart: https://my.clevelandclinic.org/health/articles/bristol-stool-chart

## Goals

- Make 30-day history scannable for a doctor in under one minute.
- Show frequency, gaps, stool form, symptoms, laxative use, and data completeness.
- Preserve quick daily logging.
- Support old entries that only have yes/no data.
- Keep all new data local-first and structured enough for charts.
- Avoid diagnosis, treatment instructions, or urgent-care decisioning in this feature.

## Non-Goals

- No PDF export in this pass.
- No cloud sync, clinician sharing workflow, accounts, analytics, or remote storage.
- No diagnosis labels such as "constipated" or "diarrhea episode" as app conclusions.
- No color, blood, urgency, diet, hydration, exercise, sleep, or full medication tracking in this pass.
- No open-ended daily diary beyond one short laxative/context note.

## Recommended Scope

This should ship as one cohesive "doctor-summary upgrade":

- Existing-data charts from current yes/no logs.
- New structured logging fields for Bristol stool type, symptom burden, and laxative/context notes.
- A clinician-friendly summary panel that combines current and new metrics.
- Graceful fallback for existing entries that do not have new fields.

## Today Logging Design

The Today tab should remain fast and familiar.

The first question remains:

> Did you have a bowel movement today?

If the user answers Yes:

- Show a required Bristol stool type picker from 1 to 7.
- Show optional symptom toggles:
  - Straining
  - Pain
  - Bloating
  - Incomplete evacuation
- Show optional laxative/context controls:
  - Laxative used
  - Short optional note

If the user answers No:

- Skip Bristol stool type.
- Still allow optional symptom toggles.
- Still allow laxative used and short optional note.

The daily save action should save the whole check-in at once. Updating an existing day should overwrite that day's structured fields while preserving its original creation timestamp.

## Data Model

Extend `DailyEntry` with nullable and defaultable fields:

```ts
type StoolType = 1 | 2 | 3 | 4 | 5 | 6 | 7;

type DailySymptoms = {
  straining: boolean;
  pain: boolean;
  bloating: boolean;
  incompleteEvacuation: boolean;
};

type DailyEntry = {
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
```

SQLite should add nullable/default columns:

- `details_recorded INTEGER NOT NULL DEFAULT 0`
- `stool_type INTEGER NULL`
- `symptom_straining INTEGER NOT NULL DEFAULT 0`
- `symptom_pain INTEGER NOT NULL DEFAULT 0`
- `symptom_bloating INTEGER NOT NULL DEFAULT 0`
- `symptom_incomplete_evacuation INTEGER NOT NULL DEFAULT 0`
- `laxative_used INTEGER NOT NULL DEFAULT 0`
- `laxative_note TEXT NOT NULL DEFAULT ''`

Web storage should tolerate missing fields and map them to the same defaults when reading older localStorage entries.

Validation rules:

- `stoolType` must be 1-7 when `hadBowelMovement` is true.
- `stoolType` must be `null` when `hadBowelMovement` is false.
- `laxativeNote` should be trimmed and capped at 160 characters.
- Symptom flags default to false.
- `detailsRecorded` is false for entries created before this upgrade and true for entries saved through the upgraded Today form.

## Metrics

The trend helper layer should derive the following from the last 30 calendar days:

- Bowel movement days.
- Average bowel movements per week, calculated as `(bowel movement days / visible calendar days) * 7`.
- Current gap in days since the most recent yes.
- Longest gap, calculated as the longest consecutive run of completed or missed days without a yes. Pending today does not extend the gap.
- Number of gaps lasting 2+ days, using the same gap definition.
- Check-in completion rate, calculated from answered yes/no days divided by non-pending visible days.
- Missed check-ins.
- Bristol type distribution.
- Most common Bristol type.
- Days with Bristol types 1-2.
- Days with Bristol types 6-7.
- Symptom counts by symptom.
- Total symptom burden days, meaning days with one or more selected symptoms.
- Laxative-use days.
- Days with laxative/context notes.

Existing entries with `detailsRecorded === false` should still count toward frequency and check-in metrics, but should be excluded from Bristol, symptom, laxative, and note denominator calculations.

## History Tab Design

History should become a scan-first view with details below.

At the top, show a 30-day status strip:

- One fixed-size tile per day.
- Tile state: Yes, No, Missed, Pending.
- Yes tiles can show Bristol type when present.
- Symptom days get a subtle marker.
- Laxative days get a subtle marker.
- Long no-BM gaps get a visible bracket or label such as "3-day gap."

Below the strip, keep a compact daily list for exact review:

- Date label.
- Yes/No/Missed/Pending status.
- Bristol type if logged.
- Symptom count or symptom names.
- Laxative used marker.
- Short note preview if present.

This preserves the current History behavior while adding the visual overview doctors need.

## Trends Tab Design

Trends should start with a doctor summary panel, followed by charts.

### Doctor Summary Panel

Show the most clinically useful 30-day facts:

- Bowel movement days: `12 of 30`
- Average per week: `2.8/week`
- Current gap: `2 days`
- Longest gap: `5 days`
- Check-in completion: `87%`
- Most common Bristol type: `Type 2`
- Symptom burden: `9 days with symptoms`
- Laxative use: `4 days`

Use neutral language such as "For discussion with your clinician." Do not label results as normal or abnormal.

### Frequency Bar Chart

Show bowel movement count per week across the visible period. Include a subtle reference line at 3 per week because clinical resources commonly use fewer than three bowel movements per week as a constipation symptom threshold. Label the line "3/week reference" instead of "normal."

### Rolling 7-Day Line

Show the rolling count of yes logs across the last 30 days. This makes improving or worsening frequency easier to see than a single total.

### Interval Chart

Show days between bowel movements. Long intervals should be visually obvious because they are easy for a doctor to interpret.

### Bristol Distribution

Show a horizontal distribution of logged Bristol types 1-7. Grouping should be visually readable:

- Types 1-2: hard/lumpy range.
- Types 3-4: formed range.
- Types 5-7: loose/watery range.

The chart should still display individual type counts, not only groups.

### Symptom Burden Chart

Show symptom counts over the last 30 days:

- Straining
- Pain
- Bloating
- Incomplete evacuation

Use a compact horizontal bar chart or stacked symptom row. Also show "days with any symptom" as a headline number.

### Laxative Timeline

Show laxative-use days as small markers aligned to the same 30-day timeline. Notes should appear in the daily detail list, not inside the chart.

### Data Completeness

Show answered vs missed days so clinicians can judge reliability. This can be a simple completion bar and a missed count.

## Data Flow

1. App loads profile and the recent entry window from local storage.
2. Storage maps old entries into the extended entry shape.
3. Today logging saves the extended entry.
4. `buildHistoryDays` returns per-day status plus any structured details.
5. `summarizeTrends` returns the expanded metrics and chart series.
6. History and Trends render from derived data, not from raw storage rows.

The helper layer should stay pure and well-tested. UI components should not recalculate chart metrics directly.

## Error Handling

- If storage migration fails, show the existing notice pattern with a plain error message.
- If an older entry lacks Bristol or symptom fields, treat those fields as unknown/default rather than failing.
- If a user selects Yes without choosing Bristol type, show an inline validation message.
- If a note exceeds 160 characters, block save with clear feedback.
- If there is not enough data for a chart, show a small empty state such as "More check-ins will fill this in."

## Accessibility And Visual Design

- Do not rely on color alone. Tiles and chart marks need labels, accessible text, or patterns.
- Keep charts compact and calm; this is a health-adjacent utility, not a decorative dashboard.
- Use fixed dimensions for history tiles and chart bars so labels and state changes do not shift layout.
- Avoid diagnosis-colored severity language. Use neutral labels: "hard/lumpy range," "formed range," and "loose/watery range."
- Keep the daily logging flow thumb-friendly and quick on mobile.

## Testing Plan

Add focused tests for the trend helper layer:

- Existing yes/no-only entries still produce current trend metrics.
- Old entries missing new fields map safely to defaults.
- Bristol type distribution counts only entries with `hadBowelMovement` and known `stoolType`.
- Symptom burden counts days with one or more symptoms.
- Laxative-use days and note days are counted correctly.
- Current gap and longest gap calculations handle no yes entries, one yes entry, and multiple yes entries.
- Weekly frequency and rolling 7-day series are deterministic with a fixed `today`.
- Check-in rate excludes pending today before check-in cutoff.

Manual verification should cover:

- Creating a new profile.
- Logging Yes with Bristol, symptoms, laxative, and note.
- Logging No with symptoms and laxative.
- Updating today's entry.
- Viewing History and Trends with mixed old and new entries.
- Running on web and native-compatible storage paths.

## Open Decisions Resolved

- Bristol type is required only for Yes entries.
- Symptoms and laxative use are allowed for both Yes and No entries.
- The note is limited to laxative/context use, not a general diary.
- The first implementation remains 30-day focused.
- The app will use neutral references and summaries, not diagnostic conclusions.

## Implementation Boundary

This spec is ready to become a single implementation plan. The plan should avoid unrelated refactors, keep storage migration tightly scoped, and preserve the local-first privacy model.
