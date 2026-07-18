import Svg, { Circle, G } from 'react-native-svg';

import type { DailyEntry } from '../types';
import { buildCalendarRingSegments } from '../lib/calendarRing';

const ringSize = 42;
const ringStrokeWidth = 4;
const ringCenter = ringSize / 2;
const ringRadius = (ringSize - ringStrokeWidth) / 2;
const ringCircumference = 2 * Math.PI * ringRadius;

export function CalendarEntryRing({ entries }: { entries: DailyEntry[] }) {
  const segments = buildCalendarRingSegments(entries, ringCircumference);

  if (segments.length === 0) {
    return null;
  }

  return (
    <Svg
      aria-hidden
      height={ringSize}
      style={{ pointerEvents: 'none' }}
      viewBox={`0 0 ${ringSize} ${ringSize}`}
      width={ringSize}
    >
      <G transform={`rotate(-90 ${ringCenter} ${ringCenter})`}>
        {segments.map((segment) => (
          <Circle
            key={segment.entryId}
            cx={ringCenter}
            cy={ringCenter}
            fill="none"
            r={ringRadius}
            stroke={segment.color}
            strokeDasharray={
              segments.length === 1
                ? undefined
                : `${segment.dashLength} ${ringCircumference - segment.dashLength}`
            }
            strokeDashoffset={segment.dashOffset}
            strokeLinecap="butt"
            strokeWidth={ringStrokeWidth}
          />
        ))}
      </G>
    </Svg>
  );
}
