import dayjs from 'dayjs';
import { db } from '../db/database';
import { newId } from '../utils/ids';
import { nowIso, formatDate } from '../utils/format';
import { formatMoney } from '../utils/money';
import type { Actor, Payment, PaymentMethod, Subscription, SubscriptionPlanId } from '../types';
import { assertRule, NotFoundError } from './errors';
import { assertAction } from './permissions';
import { logActivity, nextCode } from './core';
import { DEFAULT_SUBSCRIPTION_PLANS, getSetting, SETTING_KEYS } from './settings';

async function currentOpenShiftId(employeeId: string): Promise<string | undefined> {
  const own = await db.shifts.where('employeeId').equals(employeeId).and((s) => s.status === 'OPEN').first();
  if (own) return own.id;
  const any = await db.shifts.where('status').equals('OPEN').first();
  return any?.id;
}

export interface SellSubscriptionInput {
  customerId: string;
  vehicleId: string;
  plan: SubscriptionPlanId;
  startDate: string;
  method?: PaymentMethod;
  note?: string;
}

export async function sellSubscription(actor: Actor, input: SellSubscriptionInput): Promise<Subscription> {
  assertAction(actor, 'subscription.manage');
  const customer = await db.customers.get(input.customerId);
  if (!customer) throw new NotFoundError('Không tìm thấy khách hàng. Tạo khách trước khi bán vé tháng.');
  const vehicle = await db.vehicles.get(input.vehicleId);
  if (!vehicle) throw new NotFoundError('Không tìm thấy xe. Thêm xe cho khách trước khi bán vé tháng.');
  const plans = await getSetting(SETTING_KEYS.SUBSCRIPTION_PLANS, DEFAULT_SUBSCRIPTION_PLANS);
  const plan = plans.find((p) => p.id === input.plan);
  assertRule(plan, 'Gói vé tháng không hợp lệ.');

  const activeCount = await db.subscriptions
    .where('vehicleId')
    .equals(vehicle.id)
    .and((s) => s.status === 'ACTIVE' && dayjs(s.endDate).isAfter(dayjs()))
    .count();
  assertRule(activeCount === 0, `Xe ${vehicle.plate} đang còn vé tháng hiệu lực. Dùng chức năng Gia hạn nếu muốn cộng thêm thời gian.`);

  const start = dayjs(input.startDate).startOf('day');
  const end = start.add(plan.months, 'month');
  const priceVnd = plan.price[vehicle.vehicleType];
  const now = nowIso();
  const shiftId = await currentOpenShiftId(actor.employeeId);

  let subscription!: Subscription;
  await db.transaction('rw', db.subscriptions, db.payments, db.documentSequences, db.activityLogs, async () => {
    subscription = {
      id: newId(),
      code: await nextCode('SUBSCRIPTION', dayjs().format('YYMMDD')),
      customerId: customer.id,
      vehicleId: vehicle.id,
      plan: plan.id,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      priceVnd,
      status: 'ACTIVE',
      createdAt: now,
      note: input.note?.trim() || undefined,
    };
    await db.subscriptions.add(subscription);
    const payment: Payment = {
      id: newId(),
      code: await nextCode('PAYMENT', dayjs().format('YYMMDD')),
      type: 'SUBSCRIPTION',
      subscriptionId: subscription.id,
      description: `Bán vé tháng ${plan.name} — ${vehicle.plate} (${customer.name})`,
      amountVnd: priceVnd,
      method: input.method ?? 'CASH',
      at: now,
      cashierId: actor.employeeId,
      shiftId,
    };
    await db.payments.add(payment);
    await logActivity({
      entityType: 'SUBSCRIPTION',
      entityId: subscription.id,
      actorName: actor.name,
      summary: `Bán vé tháng ${plan.name} cho xe ${vehicle.plate} — ${formatMoney(priceVnd)}`,
    });
  });
  return subscription;
}

export async function renewSubscription(actor: Actor, subscriptionId: string, planId: SubscriptionPlanId, method?: PaymentMethod): Promise<Subscription> {
  assertAction(actor, 'subscription.manage');
  const subscription = await db.subscriptions.get(subscriptionId);
  if (!subscription) throw new NotFoundError('Không tìm thấy vé tháng.');
  assertRule(subscription.status === 'ACTIVE', 'Vé tháng đã bị huỷ, không thể gia hạn. Hãy bán vé mới nếu cần.');
  const vehicle = await db.vehicles.get(subscription.vehicleId);
  if (!vehicle) throw new NotFoundError('Không tìm thấy xe gắn với vé tháng.');
  const plans = await getSetting(SETTING_KEYS.SUBSCRIPTION_PLANS, DEFAULT_SUBSCRIPTION_PLANS);
  const plan = plans.find((p) => p.id === planId);
  assertRule(plan, 'Gói vé tháng không hợp lệ.');

  const base = dayjs(subscription.endDate).isAfter(dayjs()) ? dayjs(subscription.endDate) : dayjs();
  const newEnd = base.add(plan.months, 'month');
  const priceVnd = plan.price[vehicle.vehicleType];
  const now = nowIso();
  const shiftId = await currentOpenShiftId(actor.employeeId);

  await db.transaction('rw', db.subscriptions, db.payments, db.documentSequences, db.activityLogs, async () => {
    await db.subscriptions.update(subscriptionId, { plan: plan.id, endDate: newEnd.toISOString(), priceVnd, status: 'ACTIVE' });
    const payment: Payment = {
      id: newId(),
      code: await nextCode('PAYMENT', dayjs().format('YYMMDD')),
      type: 'SUBSCRIPTION',
      subscriptionId,
      description: `Gia hạn vé tháng ${plan.name} — ${vehicle.plate} (đến ${formatDate(newEnd.toISOString())})`,
      amountVnd: priceVnd,
      method: method ?? 'CASH',
      at: now,
      cashierId: actor.employeeId,
      shiftId,
    };
    await db.payments.add(payment);
    await logActivity({
      entityType: 'SUBSCRIPTION',
      entityId: subscriptionId,
      actorName: actor.name,
      summary: `Gia hạn vé tháng ${plan.name} cho xe ${vehicle.plate} đến ${formatDate(newEnd.toISOString())} — ${formatMoney(priceVnd)}`,
    });
  });
  return (await db.subscriptions.get(subscriptionId))!;
}

export async function cancelSubscription(actor: Actor, subscriptionId: string, note?: string): Promise<void> {
  assertAction(actor, 'subscription.manage');
  const subscription = await db.subscriptions.get(subscriptionId);
  if (!subscription) throw new NotFoundError('Không tìm thấy vé tháng.');
  assertRule(subscription.status === 'ACTIVE', 'Vé tháng đã bị huỷ trước đó.');
  await db.transaction('rw', db.subscriptions, db.activityLogs, async () => {
    await db.subscriptions.update(subscriptionId, { status: 'CANCELLED', note: note?.trim() || subscription.note });
    await logActivity({
      entityType: 'SUBSCRIPTION',
      entityId: subscriptionId,
      actorName: actor.name,
      summary: `Huỷ vé tháng ${subscription.code}${note?.trim() ? ` — lý do: ${note.trim()}` : ''}`,
    });
  });
}

export async function activeSubscriptionForVehicle(vehicleId: string): Promise<Subscription | undefined> {
  const subs = await db.subscriptions.where('vehicleId').equals(vehicleId).toArray();
  return subs.filter((s) => s.status === 'ACTIVE' && dayjs(s.endDate).isAfter(dayjs())).sort((a, b) => (a.endDate < b.endDate ? 1 : -1))[0];
}
