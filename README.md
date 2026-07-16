# Daily Flow

Daily Flow is a local-first Expo app for tracking bowel movement frequency and related wellness context. It is built for personal tracking and clinician discussion, not medical diagnosis or treatment.

## Run

```bash
npm install
npm run start
```

Useful commands:

```bash
npm run ios
npm run android
npm run web
npm run typecheck
npm test
```

## Features

### Today

- Log whether you had a bowel movement today.
- For Yes entries, choose a required Bristol stool type from 1 to 7.
- For Yes or No entries, optionally track symptoms:
  - Straining
  - Pain
  - Bloating
  - Incomplete evacuation
- Optionally mark laxative use.
- Add a short laxative/context note, capped at 160 characters.
- Save the whole daily check-in at once.
- Update today's entry without creating duplicates.
- See inline validation for missing Yes/No choice, missing Bristol type, or an over-limit note.

### History

- Review the current month in a calendar card.
- See logged days called out with circular calendar markers.
- Calendar dates can be selected to add or update today or earlier days.
- Recent history rows include the exact date, status, Bristol type, symptom names, laxative marker, and note preview when present.

### Trends

- Doctor summary panel for clinician discussion, including:
  - Bowel movement days in the last 30 days
  - Average bowel movements per week
  - Current gap
  - Longest gap
  - Check-in completion rate
  - Most common Bristol type
  - Symptom burden days
  - Laxative-use days
- Weekly frequency chart with a neutral 3/week reference line.
- Rolling 7-day count chart across the last 30 days.
- Days-between-bowel-movements interval chart.
- Bristol stool form distribution for types 1-7, with hard/lumpy, formed, and loose/watery ranges.
- Symptom burden chart for straining, pain, bloating, and incomplete evacuation.
- Laxative timeline aligned to the 30-day history window.
- Data completeness chart showing answered days and missed check-ins.
- Empty states for charts that need more check-ins.

### Daily Flow Pro+

- Enable Daily Flow Pro+ in Settings to reveal the centered `Flow better ✨`
  tab.
- Receive a generated gentle wellness note when the configured proxy is
  available, with a local daily fallback if generation fails.
- Ask a gastrointestinal wellness question and receive a concise,
  non-diagnostic answer from the configured LLM.
- Send only summary counts plus the question the user explicitly submits. The
  app does not send names, exact dates, free-text check-in notes, or raw history.

### Settings And Reminders

- Create and edit a local profile.
- Set a daily check-in time.
- Turn gentle reminders on or off.
- Use private notification text that avoids bowel-movement wording.
- Store a privacy lock preference.
- Export every local check-in as CSV for future backend migration.
- Delete local data from the app.

## Data And Privacy

- Data stays local by default.
- Native builds use SQLite through `expo-sqlite`.
- Web builds use `localStorage`.
- CSV export writes stable migration columns for all local check-ins and opens
  the device share sheet on iOS and Android.
- Existing Yes/No-only entries are still readable and count toward frequency and check-in metrics.
- Older entries without detail fields are excluded from Bristol, symptom, laxative, and note-specific trend denominators.
- The app does not include accounts, cloud sync, ads, analytics, diagnosis, or treatment recommendations.
- The app uses neutral wellness language and is intended as tracked context for discussion with a clinician.

## Development Notes

- Trend calculations live in pure helpers in `src/lib/trends.ts`.
- Trend helper tests cover legacy entries, Bristol distribution, symptoms, laxative use, notes, gaps, weekly bars, rolling 7-day counts, and intervals.
- Storage adapters normalize old data into the current entry shape.
- Charts are built with React Native `View` and `Text` primitives instead of a chart dependency.
- Daily Flow Pro+ is a local prototype feature. The app sends summary counts
  for notes and summary counts plus a user-submitted question for Q&A. It falls
  back to local notes on any note-generation error.

### Local LLM Proxy

Run the local proxy before exposing it with ngrok:

```bash
OPENAI_API_KEY=sk-... \
LLM_PROXY_ACCESS_TOKEN=choose-a-test-token \
npm run llm:server
```

Then expose `http://localhost:8787` with ngrok and enter the ngrok
`/wellness-note` URL plus the same access token in Settings. The app derives the
matching `/wellness-question` route from that URL. A phone on the same Wi-Fi can
also use `http://<computer-lan-ip>:8787/wellness-note` when that origin is listed
in `ALLOWED_ORIGINS`. Keep this for one trusted tester; use a hosted backend
before a wider beta.

## Verify

```bash
npm run typecheck
npm test
```
