import {
  flowBetterTab,
  getVisibleTabs,
  primaryTabs,
  resolveAccessibleTab,
} from '../lib/navigation';

describe('Pro+ navigation', () => {
  it('keeps the four primary tabs in their existing order', () => {
    expect(primaryTabs).toEqual([
      { key: 'today', label: 'Today' },
      { key: 'history', label: 'History' },
      { key: 'trends', label: 'Trends' },
      { key: 'settings', label: 'Settings' },
    ]);
  });

  it('shows Flow better only when Daily Flow Pro+ is enabled', () => {
    expect(getVisibleTabs(false)).toEqual(primaryTabs);
    expect(getVisibleTabs(true)).toEqual([...primaryTabs, flowBetterTab]);
    expect(flowBetterTab).toEqual({
      key: 'flow-better',
      label: 'Flow better ✨',
    });
  });

  it('returns to Today when Flow Better access is removed', () => {
    expect(resolveAccessibleTab('flow-better', false)).toBe('today');
    expect(resolveAccessibleTab('flow-better', true)).toBe('flow-better');
    expect(resolveAccessibleTab('settings', false)).toBe('settings');
  });
});
