import { db } from '../db/database';
import { nowIso } from '../utils/format';

export interface BackupPayload {
  app: 'parkone';
  version: number;
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

const TABLE_NAMES = [
  'employees',
  'zones',
  'slots',
  'customers',
  'vehicles',
  'subscriptions',
  'sessions',
  'payments',
  'shifts',
  'incidents',
  'activityLogs',
  'operationReceipts',
  'documentSequences',
  'settings',
  'appMeta',
] as const;

export async function buildBackup(): Promise<BackupPayload> {
  const tables: Record<string, unknown[]> = {};
  for (const name of TABLE_NAMES) {
    tables[name] = await db.table(name).toArray();
  }
  return { app: 'parkone', version: 1, exportedAt: nowIso(), tables };
}

export async function importBackup(text: string): Promise<void> {
  const payload = JSON.parse(text) as BackupPayload;
  if (payload?.app !== 'parkone' || !payload.tables) {
    throw new Error('File sao lưu không đúng định dạng ParkOne.');
  }
  await db.transaction('rw', db.tables, async () => {
    for (const name of TABLE_NAMES) {
      const rows = payload.tables[name];
      if (!Array.isArray(rows)) continue;
      const table = db.table(name);
      await table.clear();
      if (rows.length > 0) {
        await table.bulkAdd(rows as object[]);
      }
    }
  });
}

export async function resetToSeed(): Promise<void> {
  await db.delete();
}
