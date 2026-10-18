import dayjs from 'dayjs';
import { db } from '../db/database';
import { newId } from '../utils/ids';
import { nowIso } from '../utils/format';
import { formatMoney } from '../utils/money';
import type { Actor, PaymentMethod, Shift } from '../types';
import { assertRule, NotFoundError } from './errors';
import { assertAction } from './permissions';
import { logActivity, nextCode } from './core';

export interface ShiftSummary {
  shiftId: string;
  count: number;
  cashVnd: number;
  transferVnd: number;
  cardVnd: number;
  totalVnd: number;
  expectedCashVnd: number;
}

export async function getShiftSummary(shiftId: string): Promise<ShiftSummary> {
  const shift = await db.shifts.get(shiftId);
  const payments = await db.payments.where('shiftId').equals(shiftId).toArray();
  const cashVnd = payments.filter((p) => p.method === 'CASH').reduce((s, p) => s + p.amountVnd, 0);
  const transferVnd = payments.filter((p) => p.method === 'TRANSFER').reduce((s, p) => s + p.amountVnd, 0);
  const cardVnd = payments.filter((p) => p.method === 'CARD').reduce((s, p) => s + p.amountVnd, 0);
  const opening = shift?.openingCashVnd ?? 0;
  return {
    shiftId,
    count: payments.length,
    cashVnd,
    transferVnd,
    cardVnd,
    totalVnd: cashVnd + transferVnd + cardVnd,
    expectedCashVnd: opening + cashVnd,
  };
}

export interface OpenShiftInput {
  employeeId: string;
  openingCashVnd: number;
}

export async function openShift(actor: Actor, input: OpenShiftInput): Promise<Shift> {
  assertAction(actor, 'shift.manage');
  const existing = await db.shifts.where('employeeId').equals(input.employeeId).and((s) => s.status === 'OPEN').first();
  assertRule(!existing, 'Nhân viên này đang có ca mở. Đóng ca cũ trước khi mở ca mới.');
  const now = nowIso();
  let shift!: Shift;
  await db.transaction('rw', db.shifts, db.documentSequences, db.activityLogs, async () => {
    shift = {
      id: newId(),
      code: await nextCode('SHIFT', dayjs().format('YYMMDD')),
      employeeId: input.employeeId,
      openedAt: now,
      openingCashVnd: input.openingCashVnd,
      status: 'OPEN',
    };
    await db.shifts.add(shift);
    await logActivity({
      entityType: 'SHIFT',
      entityId: shift.id,
      actorName: actor.name,
      summary: `Mở ca ${shift.code} — tiền đầu ca ${formatMoney(input.openingCashVnd)}`,
    });
  });
  return shift;
}

export interface CloseShiftResult {
  shift: Shift;
  summary: ShiftSummary;
  countedCashVnd: number | null;
  diffVnd: number | null;
}

export async function closeShift(actor: Actor, shiftId: string, countedCashVnd: number | null, note?: string): Promise<CloseShiftResult> {
  assertAction(actor, 'shift.manage');
  const shift = await db.shifts.get(shiftId);
  if (!shift) throw new NotFoundError('Không tìm thấy ca trực.');
  assertRule(shift.status === 'OPEN', 'Ca này đã đóng trước đó.');
  const summary = await getShiftSummary(shiftId);
  const diffVnd = countedCashVnd == null ? null : countedCashVnd - summary.expectedCashVnd;
  const now = nowIso();
  await db.transaction('rw', db.shifts, db.activityLogs, async () => {
    await db.shifts.update(shiftId, { status: 'CLOSED', closedAt: now, countedCashVnd: countedCashVnd ?? undefined, note: note?.trim() || undefined });
    await logActivity({
      entityType: 'SHIFT',
      entityId: shiftId,
      actorName: actor.name,
      summary: `Đóng ca ${shift.code} — doanh thu ${formatMoney(summary.totalVnd)}${diffVnd != null && diffVnd !== 0 ? ` — lệch quỹ ${formatMoney(diffVnd)}` : ''}`,
    });
  });
  const updated = (await db.shifts.get(shiftId))!;
  return { shift: updated, summary, countedCashVnd, diffVnd };
}

export async function findCurrentOpenShift(employeeId?: string): Promise<Shift | undefined> {
  if (employeeId) {
    const own = await db.shifts.where('employeeId').equals(employeeId).and((s) => s.status === 'OPEN').first();
    if (own) return own;
  }
  return db.shifts.where('status').equals('OPEN').first();
}

export interface IncidentPaymentInput {
  incidentId: string;
  amountVnd: number;
  method: PaymentMethod;
  description: string;
}

export async function recordIncidentPayment(actor: Actor, input: IncidentPaymentInput): Promise<void> {
  assertAction(actor, 'incident.manage');
  assertRule(input.amountVnd > 0, 'Số tiền phụ phí phải lớn hơn 0.');
  const shift = await findCurrentOpenShift(actor.employeeId);
  await db.transaction('rw', db.payments, db.documentSequences, db.activityLogs, async () => {
    const code = await nextCode('PAYMENT', dayjs().format('YYMMDD'));
    await db.payments.add({
      id: newId(),
      code,
      type: 'INCIDENT',
      incidentId: input.incidentId,
      description: input.description,
      amountVnd: input.amountVnd,
      method: input.method,
      at: nowIso(),
      cashierId: actor.employeeId,
      shiftId: shift?.id,
    });
    await logActivity({
      entityType: 'PAYMENT',
      entityId: input.incidentId,
      actorName: actor.name,
      summary: `Thu phụ phí sự cố — ${formatMoney(input.amountVnd)}`,
    });
  });
}
