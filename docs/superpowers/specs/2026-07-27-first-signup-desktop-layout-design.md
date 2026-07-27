# First-Signup Welcome and Desktop Layout Design

## Goal

Show the existing “Glad to see you {name}” notice immediately after first-time signup while preserving its existing once-per-day behavior, and make the web app comfortable on desktop without changing mobile or iPad layouts.

## Welcome behavior

- Keep the existing personalized message and daily-open behavior.
- After profile creation, display the welcome success notice immediately.
- Persist the current date as the notice’s shown date so a reload on the signup day does not display it a second time.
- Keep reminder setup behavior unchanged. The welcome notice takes visual priority immediately after signup.
- Continue displaying the existing “Welcome back” notice on the first app open of later days.

## Desktop layout

- Preserve the current layout through 1024 px wide.
- Above 1024 px, center the application shell in the viewport, cap its readable width, and add desktop-sized outer gutters.
- Keep the current top navigation, screen order, colors, typography, cards, and interactions.
- Apply the same desktop containment principle to onboarding so forms do not stretch across a wide monitor.
- Do not introduce sidebars, multi-column screen layouts, or changes to mobile/tablet component sizing.

## Implementation boundaries

- Use React Native’s responsive window dimensions and conditional styles; do not add dependencies.
- Keep Expo SDK 57 compatibility.
- Add focused tests for first-signup notice persistence and desktop breakpoint style selection.
- Validate with type checking, the relevant Jest tests, the full test suite, and web rendering at mobile, iPad, and desktop viewport widths.

