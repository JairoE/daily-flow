import type { TabKey } from '../types';

export type AppTab = {
  key: TabKey;
  label: string;
};

export const primaryTabs: readonly AppTab[] = [
  { key: 'today', label: 'Today' },
  { key: 'history', label: 'History' },
  { key: 'trends', label: 'Trends' },
  { key: 'settings', label: 'Settings' },
];

export const flowBetterTab: AppTab = {
  key: 'flow-better',
  label: 'Flow better ✨',
};

export function getVisibleTabs(proEnabled: boolean): readonly AppTab[] {
  return proEnabled ? [...primaryTabs, flowBetterTab] : primaryTabs;
}

export function resolveAccessibleTab(
  activeTab: TabKey,
  proEnabled: boolean,
): TabKey {
  return activeTab === 'flow-better' && !proEnabled ? 'today' : activeTab;
}
