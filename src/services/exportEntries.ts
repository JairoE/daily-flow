import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import {
  buildDailyEntriesCsv,
  buildDailyEntriesExportFilename,
} from '../lib/exportData';
import type { DailyEntry } from '../types';

export type ExportEntriesResult = {
  delivery: 'share-sheet' | 'web-download';
  fileName: string;
  rowCount: number;
  uri?: string;
};

function downloadCsvInBrowser(fileName: string, csv: string) {
  if (typeof document === 'undefined') {
    throw new Error('CSV download is only available in a browser.');
  }

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function exportEntriesCsv(
  entries: DailyEntry[],
  localDate: string,
): Promise<ExportEntriesResult> {
  const csv = buildDailyEntriesCsv(entries);
  const fileName = buildDailyEntriesExportFilename(localDate);

  if (Platform.OS === 'web') {
    downloadCsvInBrowser(fileName, csv);
    return {
      delivery: 'web-download',
      fileName,
      rowCount: entries.length,
    };
  }

  const file = new File(Paths.cache, fileName);

  file.create({ overwrite: true });
  file.write(csv);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('File sharing is not available on this device.');
  }

  await Sharing.shareAsync(file.uri, {
    UTI: 'public.comma-separated-values-text',
    dialogTitle: 'Export Daily Flow data',
    mimeType: 'text/csv',
  });

  return {
    delivery: 'share-sheet',
    fileName,
    rowCount: entries.length,
    uri: file.uri,
  };
}
