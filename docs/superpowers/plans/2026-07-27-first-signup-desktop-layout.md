# First-Signup Welcome and Desktop Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display the existing daily welcome notice during first-time signup and constrain the web UI to a readable centered desktop layout above 1024 px.

**Architecture:** Reuse the existing daily-notice generator for signup and persist its `shownDate` with the new profile. Add a small pure responsive-layout helper so the exact desktop boundary is testable, then apply conditional styles through React Native’s `useWindowDimensions`.

**Tech Stack:** Expo SDK 57, React 19, React Native 0.86, TypeScript, Jest.

## Global Constraints

- Keep “Glad to see you {name}” and the existing once-per-day behavior.
- Preserve the current layout at widths up to and including 1024 px.
- Do not add dependencies or change navigation, colors, typography, screen order, or mobile/tablet component sizing.
- Use test-driven development and verify against the Expo SDK 57 documentation.

---

### Task 1: First-signup welcome

**Files:**
- Modify: `App.tsx`
- Modify: `src/__tests__/dailyOpenNotice.test.ts`
- Modify: `src/lib/dailyOpenNotice.ts`

**Interfaces:**
- Consumes: `Profile`, `getDailyOpenLoveNotice(profile, today)`
- Produces: `prepareDailyOpenLoveNotice(profile, today): { profile: Profile; notice: DailyOpenLoveNotice | null }`

- [ ] **Step 1: Write the failing test**

Add a test proving that preparing a notice for a new profile returns “Glad to see you Jairo” and a profile whose `dailyOpenLoveShownDate` is today. Add a second assertion proving an already-shown profile returns no notice and remains unchanged.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx jest src/__tests__/dailyOpenNotice.test.ts --runInBand`

Expected: FAIL because `prepareDailyOpenLoveNotice` is not exported.

- [ ] **Step 3: Implement the pure preparation helper**

Use `getDailyOpenLoveNotice`. When a notice exists, return a copied profile with `dailyOpenLoveShownDate: notice.shownDate`; otherwise return the original profile and `notice: null`.

- [ ] **Step 4: Use the helper in both entry paths**

In bootstrap, prepare the stored profile and persist it only when a notice exists. In `handleProfileCreated`, prepare the new profile before saving, schedule reminders with the saved profile, then display the prepared welcome notice and increment `noticeKey`. Keep reminder scheduling behavior intact and let the welcome notice take immediate visual priority.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `npx jest src/__tests__/dailyOpenNotice.test.ts --runInBand`

Expected: all daily-open notice tests pass.

### Task 2: Desktop-only responsive shell

**Files:**
- Create: `src/lib/responsiveLayout.ts`
- Create: `src/__tests__/responsiveLayout.test.ts`
- Modify: `App.tsx`

**Interfaces:**
- Produces: `desktopLayoutBreakpoint = 1024`
- Produces: `isDesktopLayout(width: number): boolean`

- [ ] **Step 1: Write the failing breakpoint test**

Test that widths 375, 768, and 1024 return `false`, while 1025 and 1440 return `true`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx jest src/__tests__/responsiveLayout.test.ts --runInBand`

Expected: FAIL because `responsiveLayout.ts` does not exist.

- [ ] **Step 3: Implement the responsive helper**

Export the 1024 px breakpoint and return `width > desktopLayoutBreakpoint`.

- [ ] **Step 4: Apply conditional desktop styles**

Import `useWindowDimensions` and `isDesktopLayout`. In the authenticated app shell, apply a desktop style only above 1024 px with `alignSelf: 'center'`, `maxWidth: 1040`, `width: '100%'`, 32 px horizontal padding, and 24 px top padding. In onboarding, apply a desktop-only content style with `alignSelf: 'center'`, `maxWidth: 720`, `width: '100%'`, and larger top padding. Leave every existing base style unchanged.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `npx jest src/__tests__/responsiveLayout.test.ts --runInBand`

Expected: all responsive-layout tests pass.

### Task 3: Verification and publication

**Files:**
- Verify all modified files

**Interfaces:**
- Consumes: completed Tasks 1 and 2
- Produces: verified branch and draft pull request

- [ ] **Step 1: Run static and automated checks**

Run `npm run typecheck`, both focused Jest files, and `npm test`. All commands must exit 0.

- [ ] **Step 2: Render responsive web views**

Start the Expo web app and inspect at 390×844, 1024×1366, and 1440×1000. Confirm the first two retain their current layout, desktop content is centered and constrained, and no viewport has horizontal scrolling.

- [ ] **Step 3: Review the final diff**

Run `git diff --check`, inspect `git diff --stat`, and confirm only the approved spec, plan, welcome behavior, responsive helper/tests, and desktop styles are included.

- [ ] **Step 4: Commit and publish**

Commit the implementation tersely, push `codex/first-signup-desktop-layout`, and open a draft PR against `main` describing behavior, impact, and verification.

