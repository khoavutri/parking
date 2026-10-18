import { db } from '../db/database';
import { newId } from '../utils/ids';
import { nowIso } from '../utils/format';
import type { ActivityLog, OperationReceipt } from '../types';

/** Tiền tố mã chứng từ theo loại */
export const DOC_PREFIX: Record<string, string> = {
  SESSION: 'PG',
  PAYMENT: 'HD',
  SUBSCRIPTION: 'VT',
  SHIFT: 'CA',
  INCIDENT: 'SC',
  CUSTOMER: 'KH',
};

/**
 * Cấp số chứng từ kế tiếp theo loại và kỳ (mặc định là năm hiện tại).
 * Phải được gọi bên trong transaction cùng thao tác ghi.
 */
export async function nextCode(documentType: string, period?: string): Promise<string> {
  const p = period ?? String(new Date().getFullYear());
  const id = `${documentType}::${p}`;
  const existing = await db.documentSequences.get(id);
  const next = existing?.nextValue ?? 1;
  await db.documentSequences.put({ id, documentType, period: p, nextValue: next + 1 });
  const prefix = DOC_PREFIX[documentType] ?? documentType;
  return `${prefix}-${p}-${String(next).padStart(4, '0')}`;
}

/** Đọc kết quả thao tác trước đó theo operationId (chống ghi trùng) */
export async function getOperationReceipt(operationId?: string): Promise<OperationReceipt | undefined> {
  if (!operationId) return undefined;
  return db.operationReceipts.get(operationId);
}

export async function saveOperationReceipt(
  operationId: string | undefined,
  operationType: string,
  resultEntityIds: string[],
  summary?: string,
): Promise<void> {
  if (!operationId) return;
  const receipt: OperationReceipt = {
    id: operationId,
    operationType,
    resultEntityIds,
    completedAt: nowIso(),
    summary,
  };
  await db.operationReceipts.put(receipt);
}

export interface LogInput {
  entityType: string;
  entityId: string;
  summary: string;
  actorName: string;
  at?: string;
}

export async function logActivity(input: LogInput): Promise<void> {
  const record: ActivityLog = {
    id: newId(),
    entityType: input.entityType,
    entityId: input.entityId,
    summary: input.summary,
    actorName: input.actorName,
    at: input.at ?? nowIso(),
  };
  await db.activityLogs.add(record);
}

export function registerSeedFlag(flag: 'seeding') {
  localStorage.setItem(`parkone.${flag}`, '1');
}

export function clearSeedFlag(flag: 'seeding') {
  localStorage.removeItem(`parkone.${flag}`);
}
