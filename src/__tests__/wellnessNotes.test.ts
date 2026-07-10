import {
  fallbackWellnessNotes,
  getFallbackWellnessNote,
} from '../lib/wellnessNotes';

describe('wellness note helpers', () => {
  it('contains 30 fallback notes', () => {
    expect(fallbackWellnessNotes).toHaveLength(30);
  });

  it('rotates deterministically for the same local date', () => {
    expect(getFallbackWellnessNote('2026-07-10')).toBe(
      getFallbackWellnessNote('2026-07-10'),
    );
  });

  it('can return different notes for adjacent dates', () => {
    expect(getFallbackWellnessNote('2026-07-10')).not.toBe(
      getFallbackWellnessNote('2026-07-11'),
    );
  });

  it('falls back to the first note for invalid dates', () => {
    expect(getFallbackWellnessNote('not-a-date')).toBe(
      fallbackWellnessNotes[0],
    );
    expect(getFallbackWellnessNote('2026-02-31')).toBe(
      fallbackWellnessNotes[0],
    );
  });
});
