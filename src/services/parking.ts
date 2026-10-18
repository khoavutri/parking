import dayjs from 'dayjs';
import { db } from '../db/database';
import { newId } from '../utils/ids';
import { nowIso } from '../utils/format';
import { formatMoney } from '../utils/money';
import { normalizePlate } from '../utils/text';
import type { Actor, FeeBreakdown, Incident, ParkingSession, Payment, PaymentMethod, PricingConfig, SlotBaseStatus, TicketType, VehicleType } from '../types';
import { assertRule, BusinessError, NotFoundError } from './errors';
import { assertAction } from './permissions';
import { getOperationReceipt, logActivity, nextCode, saveOperationReceipt } from './core';
import { DEFAULT_PRICING, getSetting, SETTING_KEYS } from './settings';

/** Tính phí một phiên gửi xe theo bảng giá hiện hành */
export function computeFee(checkInAt: string, checkOutAt: string, vehicleType: VehicleType, pricing: PricingConfig): FeeBreakdown {
  const rule = vehicleType === 'CAR' ? pricing.car : pricing.motorbike;
  const minutes = Math.max(0, dayjs(checkOutAt).diff(dayjs(checkInAt), 'minute'));
  if (minutes <= rule.freeMinutes) {
    return { minutes, hours: 0, isFree: true, baseVnd: 0, extraHours: 0, extraVnd: 0, rawVnd: 0, capVnd: 0, totalVnd: 0 };
  }
  const hours = Math.max(1, Math.ceil(minutes / 60));
  const baseVnd = rule.firstRateVnd;
  const extraHours = Math.max(0, hours - rule.firstRateHours);
  const extraVnd = extraHours * rule.extraPerHourVnd;
  const rawVnd = baseVnd + extraVnd;
  const capVnd = rule.dayCapVnd * Math.max(1, Math.ceil(hours / 24));
  const totalVnd = Math.min(rawVnd, capVnd);
  return { minutes, hours, isFree: false, baseVnd, extraHours, extraVnd, rawVnd, capVnd, totalVnd };
}

export async function findActiveSessionByPlate(plate: string): Promise<ParkingSession | undefined> {
  const normalized = normalizePlate(plate);
  if (!normalized) return undefined;
  return db.sessions.where('normalizedPlate').equals(normalized).and((s) => s.status === 'IN').first();
}

export async function findActiveSessionBySlot(slotId: string): Promise<ParkingSession | undefined> {
  return db.sessions.where('slotId').equals(slotId).and((s) => s.status === 'IN').first();
}

export interface CheckInInput {
  plate: string;
  vehicleType: VehicleType;
  slotId: string;
  note?: string;
}

export async function checkInVehicle(actor: Actor, input: CheckInInput, operationId?: string): Promise<ParkingSession> {
  assertAction(actor, 'session.checkin');
  const plate = input.plate.trim().toUpperCase().replace(/\s+/g, ' ');
  assertRule(plate.length >= 5, 'Biển số chưa hợp lệ. Nhập đầy đủ ví dụ 30A-123.45 hoặc 29-B2 456.78.', 'PLATE_INVALID');
  const normalizedPlate = normalizePlate(plate);

  const receipt = await getOperationReceipt(operationId);
  if (receipt) {
    const existing = await db.sessions.get(receipt.resultEntityIds[0]);
    if (existing) return existing;
  }

  const active = await findActiveSessionByPlate(plate);
  if (active) {
    const slot = await db.slots.get(active.slotId);
    throw new BusinessError(
      `Xe ${plate} đang trong bãi (chỗ ${slot?.code ?? '?'}, vào lúc ${dayjs(active.checkInAt).format('HH:mm DD/MM')}). Không thể cho vào lần nữa.`,
      'DUPLICATE_PLATE',
    );
  }

  const slot = await db.slots.get(input.slotId);
  if (!slot) throw new NotFoundError('Không tìm thấy chỗ đỗ đã chọn. Có thể sơ đồ bãi vừa thay đổi, hãy tải lại trang.');
  assertRule(slot.baseStatus === 'AVAILABLE', `Chỗ ${slot.code} đang bảo trì, chọn chỗ khác.`);
  const busy = await findActiveSessionBySlot(slot.id);
  assertRule(!busy, `Chỗ ${slot.code} vừa được xe khác sử dụng. Chọn chỗ khác giúp bạn.`);

  // Nhận diện khách vé tháng theo biển số
  let customerId: string | undefined;
  let subscriptionId: string | undefined;
  let ticketType: TicketType = 'HOURLY';
  const vehicle = await db.vehicles.where('normalizedPlate').equals(normalizedPlate).first();
  if (vehicle) {
    customerId = vehicle.customerId;
    const subs = await db.subscriptions.where('vehicleId').equals(vehicle.id).toArray();
    const activeSub = subs
      .filter((s) => s.status === 'ACTIVE' && dayjs(s.endDate).isAfter(dayjs()))
      .sort((a, b) => (a.endDate < b.endDate ? 1 : -1))[0];
    if (activeSub) {
      subscriptionId = activeSub.id;
      ticketType = 'SUBSCRIPTION';
    }
  }

  const now = nowIso();
  let session!: ParkingSession;
  await db.transaction('rw', db.sessions, db.documentSequences, db.activityLogs, async () => {
    const code = await nextCode('SESSION', dayjs().format('YYMMDD'));
    session = {
      id: newId(),
      code,
      plate,
      normalizedPlate,
      vehicleType: input.vehicleType,
      zoneId: slot.zoneId,
      slotId: slot.id,
      customerId,
      subscriptionId,
      ticketType,
      checkInAt: now,
      status: 'IN',
      lostTicket: false,
      note: input.note?.trim() || undefined,
    };
    await db.sessions.add(session);
    await logActivity({
      entityType: 'SESSION',
      entityId: session.id,
      actorName: actor.name,
      summary: `Xe vào ${plate} — chỗ ${slot.code}${ticketType === 'SUBSCRIPTION' ? ' (vé tháng)' : ''}`,
    });
  });
  await saveOperationReceipt(operationId, 'CHECK_IN', [session.id], `Xe vào ${plate}`);
  return session;
}

export interface CheckoutInput {
  sessionId: string;
  method: PaymentMethod;
  lostTicket?: boolean;
  note?: string;
}

export interface CheckoutResult {
  session: ParkingSession;
  fee: FeeBreakdown;
  surchargeVnd: number;
  totalVnd: number;
  coveredBySubscription: boolean;
  payment?: Payment;
  incident?: Incident;
}

export async function checkoutSession(actor: Actor, input: CheckoutInput, operationId?: string): Promise<CheckoutResult> {
  assertAction(actor, 'session.checkout');
  const session = await db.sessions.get(input.sessionId);
  if (!session) throw new NotFoundError('Không tìm thấy phiên gửi xe. Có thể phiên đã được xử lý ở tab khác.');
  assertRule(session.status === 'IN', `Phiên ${session.code} đã kết thúc trước đó.`);

  const pricing = await getSetting(SETTING_KEYS.PRICING, DEFAULT_PRICING);
  const checkOutAt = nowIso();
  const fee = computeFee(session.checkInAt, checkOutAt, session.vehicleType, pricing);
  const coveredBySubscription = session.ticketType === 'SUBSCRIPTION';
  const lost = Boolean(input.lostTicket);
  const surchargeVnd = lost ? pricing.lostTicket[session.vehicleType] ?? 0 : 0;
  const totalVnd = (coveredBySubscription ? 0 : fee.totalVnd) + surchargeVnd;

  let payment: Payment | undefined;
  let incident: Incident | undefined;

  const openShift =
    (await db.shifts.where('employeeId').equals(actor.employeeId).and((s) => s.status === 'OPEN').first()) ??
    (await db.shifts.where('status').equals('OPEN').first());

  await db.transaction('rw', db.sessions, db.payments, db.incidents, db.documentSequences, db.activityLogs, async () => {
    if (lost) {
      incident = {
        id: newId(),
        code: await nextCode('INCIDENT', dayjs().format('YYMMDD')),
        sessionId: session.id,
        plate: session.plate,
        type: 'LOST_TICKET',
        description: `Khách báo mất vé khi ra xe — thu phụ phí ${formatMoney(surchargeVnd)}.`,
        feeVnd: surchargeVnd,
        status: 'RESOLVED',
        createdAt: checkOutAt,
        resolvedAt: checkOutAt,
        handledById: actor.employeeId,
        resolution: 'Thu phụ phí mất vé tại làn ra và cho xe ra theo xác minh chỗ đỗ.',
      };
      await db.incidents.add(incident);
    }
    if (totalVnd > 0) {
      payment = {
        id: newId(),
        code: await nextCode('PAYMENT', dayjs().format('YYMMDD')),
        type: 'SESSION',
        sessionId: session.id,
        incidentId: incident?.id,
        description: `Phí gửi xe ${session.plate} — ${session.code}${lost ? ' (mất vé)' : ''}`,
        amountVnd: totalVnd,
        method: input.method,
        at: checkOutAt,
        cashierId: actor.employeeId,
        shiftId: openShift?.id,
        note: input.note?.trim() || undefined,
      };
      await db.payments.add(payment);
    }
    await db.sessions.update(session.id, {
      status: 'OUT',
      checkOutAt,
      feeVnd: totalVnd,
      paymentId: payment?.id,
      lostTicket: lost,
    });
    await logActivity({
      entityType: 'SESSION',
      entityId: session.id,
      actorName: actor.name,
      summary: `Xe ra ${session.plate} — ${coveredBySubscription ? 'vé tháng, miễn phí' : `thu ${formatMoney(totalVnd)}`}`,
    });
  });

  const updated = (await db.sessions.get(session.id))!;
  await saveOperationReceipt(operationId, 'CHECK_OUT', [session.id], `Xe ra ${session.plate}`);
  return { session: updated, fee, surchargeVnd, totalVnd, coveredBySubscription, payment, incident };
}

export async function moveSession(actor: Actor, sessionId: string, newSlotId: string): Promise<ParkingSession> {
  assertAction(actor, 'session.move');
  const session = await db.sessions.get(sessionId);
  if (!session) throw new NotFoundError('Không tìm thấy phiên gửi xe.');
  assertRule(session.status === 'IN', 'Phiên đã kết thúc, không thể chuyển chỗ.');
  const slot = await db.slots.get(newSlotId);
  if (!slot) throw new NotFoundError('Không tìm thấy chỗ đỗ mới.');
  assertRule(slot.baseStatus === 'AVAILABLE', `Chỗ ${slot.code} đang bảo trì.`);
  const busy = await findActiveSessionBySlot(slot.id);
  assertRule(!busy, `Chỗ ${slot.code} đang có xe, chọn chỗ khác.`);
  await db.transaction('rw', db.sessions, db.activityLogs, async () => {
    await db.sessions.update(sessionId, { slotId: slot.id, zoneId: slot.zoneId });
    await logActivity({
      entityType: 'SESSION',
      entityId: sessionId,
      actorName: actor.name,
      summary: `Chuyển xe ${session.plate} sang chỗ ${slot.code}`,
    });
  });
  return (await db.sessions.get(sessionId))!;
}

export async function updateSessionNote(actor: Actor, sessionId: string, note: string): Promise<void> {
  assertAction(actor, 'session.note');
  const session = await db.sessions.get(sessionId);
  if (!session) throw new NotFoundError('Không tìm thấy phiên gửi xe.');
  await db.transaction('rw', db.sessions, db.activityLogs, async () => {
    await db.sessions.update(sessionId, { note: note.trim() || undefined });
    await logActivity({
      entityType: 'SESSION',
      entityId: sessionId,
      actorName: actor.name,
      summary: `Ghi chú phiên ${session.plate}: ${note.trim() || '(xoá ghi chú)'}`,
    });
  });
}

export async function setSlotStatus(actor: Actor, slotId: string, status: SlotBaseStatus): Promise<void> {
  assertAction(actor, 'session.move');
  const slot = await db.slots.get(slotId);
  if (!slot) throw new NotFoundError('Không tìm thấy chỗ đỗ.');
  if (status === 'MAINTENANCE') {
    const busy = await findActiveSessionBySlot(slot.id);
    assertRule(!busy, `Chỗ ${slot.code} đang có xe, không thể chuyển sang bảo trì.`);
  }
  await db.transaction('rw', db.slots, db.activityLogs, async () => {
    await db.slots.update(slotId, { baseStatus: status });
    await logActivity({
      entityType: 'SLOT',
      entityId: slotId,
      actorName: actor.name,
      summary: status === 'MAINTENANCE' ? `Chỗ ${slot.code} chuyển sang bảo trì` : `Chỗ ${slot.code} hoạt động trở lại`,
    });
  });
}
