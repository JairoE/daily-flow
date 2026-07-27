import { isDesktopLayout } from '../lib/responsiveLayout';

describe('responsive layout', () => {
  it.each([375, 768, 1024])(
    'preserves the mobile and tablet layout at %dpx',
    (width) => {
      expect(isDesktopLayout(width)).toBe(false);
    },
  );

  it.each([1025, 1440])(
    'uses the desktop layout above the tablet boundary at %dpx',
    (width) => {
      expect(isDesktopLayout(width)).toBe(true);
    },
  );
});
