import { db } from '../db/database';
import { nowIso } from '../utils/format';
import type { Actor, AiConfig, ParkingInfo, PricingConfig, PrintConfig, SubscriptionPlanDef } from '../types';
import { assertAction } from './permissions';

export const SETTING_KEYS = {
  PARKING_INFO: 'parkingInfo',
  PRICING: 'pricing',
  SUBSCRIPTION_PLANS: 'subscriptionPlans',
  AI_CONFIG: 'aiConfig',
  PRINT_CONFIG: 'printConfig',
} as const;

export const DEFAULT_PRICING: PricingConfig = {
  car: { freeMinutes: 15, firstRateVnd: 25000, firstRateHours: 2, extraPerHourVnd: 15000, dayCapVnd: 200000 },
  motorbike: { freeMinutes: 15, firstRateVnd: 5000, firstRateHours: 4, extraPerHourVnd: 2000, dayCapVnd: 30000 },
  lostTicket: { CAR: 200000, MOTORBIKE: 50000 },
};

export const DEFAULT_SUBSCRIPTION_PLANS: SubscriptionPlanDef[] = [
  { id: '1M', name: '1 tháng', months: 1, price: { CAR: 1_000_000, MOTORBIKE: 100_000 } },
  { id: '3M', name: '3 tháng', months: 3, price: { CAR: 2_700_000, MOTORBIKE: 270_000 } },
  { id: '6M', name: '6 tháng', months: 6, price: { CAR: 5_000_000, MOTORBIKE: 500_000 } },
  { id: '12M', name: '12 tháng', months: 12, price: { CAR: 9_000_000, MOTORBIKE: 900_000 } },
];

export const DEFAULT_PARKING_INFO: ParkingInfo = {
  name: 'Bãi xe KhoaDev Tower',
  address: 'Số 25 đường Lê Văn Lương, Thanh Xuân, Hà Nội',
  phone: '024 1234 5678',
  openTime: '06:00',
  closeTime: '23:00',
  slogan: 'Gửi xe an tâm — vào ra thông minh',
};

export const DEFAULT_AI_CONFIG: AiConfig = {
  autoPlateEnabled: true,
  confidenceThreshold: 90,
};

export const DEFAULT_PRINT_CONFIG: PrintConfig = {
  ticketFooter: 'Vui lòng giữ phiếu để làm thủ tục ra xe. Mất phiếu phụ thu theo quy định của bãi xe.',
  receiptFooter: 'Cảm ơn quý khách đã sử dụng dịch vụ!',
};

export type { AiConfig, ParkingInfo, PricingConfig, PrintConfig, SubscriptionPlanDef } from '../types';

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const record = await db.settings.get(key);
  if (!record) return fallback;
  return record.value as T;
}

export async function upsertSetting(actor: Actor, key: string, value: unknown): Promise<void> {
  assertAction(actor, 'settings.manage');
  await db.transaction('rw', db.settings, async () => {
    await db.settings.put({ key, value, updatedAt: nowIso() });
  });
}
