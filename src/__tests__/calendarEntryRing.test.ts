import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Circle } from 'react-native-svg';

import { CalendarEntryRing } from '../components/CalendarEntryRing';
import {
  CALENDAR_NO_COLOR,
  CALENDAR_YES_COLOR,
} from '../lib/calendarRing';
import type { DailyEntry } from '../types';

const emptySymptoms = {
  straining: false,
  pain: false,
  bloating: false,
  incompleteEvacuation: false,
};

function entry(
  id: string,
  checkedInAt: string,
  hadBowelMovement: boolean,
): DailyEntry {
  return {
    id,
    localDate: '2026-07-09',
    hadBowelMovement,
    detailsRecorded: true,
    stoolType: hadBowelMovement ? 4 : null,
    symptoms: emptySymptoms,
    laxativeUsed: false,
    laxativeNote: '',
    checkedInAt,
    createdAt: checkedInAt,
    updatedAt: checkedInAt,
  };
}

describe('CalendarEntryRing', () => {
  it('renders mixed segment strokes in chronological color order', () => {
    let renderer: ReactTestRenderer;

    act(() => {
      renderer = create(
        createElement(CalendarEntryRing, {
          entries: [
            entry('yes-last', '2026-07-09T18:00:00.000Z', true),
            entry('no-later', '2026-07-09T13:00:00.000Z', false),
            entry('no-first', '2026-07-09T08:00:00.000Z', false),
          ],
        }),
      );
    });

    const circles = renderer!.root.findAllByType(Circle);
    expect(circles.map((circle) => circle.props.stroke)).toEqual([
      CALENDAR_NO_COLOR,
      CALENDAR_NO_COLOR,
      CALENDAR_YES_COLOR,
    ]);
    expect(circles.every((circle) => circle.props.fill === 'none')).toBe(true);
  });
});
