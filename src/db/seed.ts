import dayjs, { type Dayjs } from 'dayjs';
import { db, SCHEMA_VERSION } from './database';
import { newId } from '../utils/ids';
import { buildSearchName, normalizePhone, normalizePlate } from '../utils/text';
import { computeFee } from '../services/parking';
import {
  DEFAULT_AI_CONFIG,
  DEFAULT_PARKING_INFO,
  DEFAULT_PRICING,
  DEFAULT_PRINT_CONFIG,
  DEFAULT_SUBSCRIPTION_PLANS,
  SETTING_KEYS,
} from '../services/settings';
import type {
  ActivityLog,
  Customer,
  DocumentSequence,
  Employee,
  Incident,
  ParkingSession,
  Payment,
  PaymentMethod,
  PricingConfig,
  Shift,
  Slot,
  Subscription,
  SubscriptionPlanId,
  Vehicle,
  VehicleType,
  Zone,
} from '../types';

export const SEED_VERSION = '1';
const SEED_FLAG = 'parkone.seeding';

// ---------- Sinh ngẫu nhiên có kiểm soát (ổn định giữa các lần seed) ----------
let rngState = 20261018;
function rnd(): number {
  rngState = (rngState * 1103515245 + 12345) % 2147483648;
  return rngState / 2147483648;
}
function rndInt(min: number, max: number): number {
  return min + Math.floor(rnd() * (max - min + 1));
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}
function weighted<T>(pairs: ReadonlyArray<[T, number]>): T {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let roll = rnd() * total;
  for (const [value, weight] of pairs) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return pairs[pairs.length - 1][0];
}
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Nhân sự ----------
const EMPLOYEES: Array<Pick<Employee, 'id' | 'code' | 'name' | 'role' | 'phone'>> = [
  { id: 'emp-manager', code: 'NV-001', name: 'Đỗ Văn Khánh', role: 'MANAGER', phone: '0981112233' },
  { id: 'emp-att-1', code: 'NV-002', name: 'Nguyễn Thành Long', role: 'ATTENDANT', phone: '0982223344' },
  { id: 'emp-att-2', code: 'NV-003', name: 'Trần Văn Dũng', role: 'ATTENDANT', phone: '0983334455' },
  { id: 'emp-att-3', code: 'NV-004', name: 'Phạm Hải Yến', role: 'ATTENDANT', phone: '0984445566' },
  { id: 'emp-cashier-1', code: 'NV-005', name: 'Lê Thu Trang', role: 'CASHIER', phone: '0985556677' },
  { id: 'emp-cashier-2', code: 'NV-006', name: 'Hoàng Minh Châu', role: 'CASHIER', phone: '0986667788' },
  { id: 'emp-tech', code: 'NV-007', name: 'Bùi Đức Anh', role: 'ATTENDANT', phone: '0987778899' },
];

const ZONES: Zone[] = [
  { id: 'zone-a', code: 'A', name: 'Khu A — Ô tô (tầng 1)', vehicleType: 'CAR', floor: 'Tầng 1', active: true },
  { id: 'zone-b', code: 'B', name: 'Khu B — Ô tô (cánh phải)', vehicleType: 'CAR', floor: 'Tầng 1', active: true },
  { id: 'zone-m', code: 'M', name: 'Khu M — Xe máy (tầng B1)', vehicleType: 'MOTORBIKE', floor: 'Tầng B1', active: true },
];

const SLOTS: Slot[] = [
  ...Array.from({ length: 24 }, (_, i) => ({ id: `slot-a${i + 1}`, code: `A${i + 1}`, zoneId: 'zone-a', baseStatus: 'AVAILABLE' as const })),
  ...Array.from({ length: 16 }, (_, i) => ({ id: `slot-b${i + 1}`, code: `B${i + 1}`, zoneId: 'zone-b', baseStatus: 'AVAILABLE' as const })),
  ...Array.from({ length: 40 }, (_, i) => ({ id: `slot-m${i + 1}`, code: `M${i + 1}`, zoneId: 'zone-m', baseStatus: 'AVAILABLE' as const })),
];
// Hai chỗ đang bảo trì để minh hoạ
const MAINTENANCE_SLOT_IDS = new Set(['slot-a18', 'slot-m7']);

// ---------- Khách hàng & xe ----------
const CUSTOMER_ROWS: Array<{ id: string; code: string; name: string; phone: string; note?: string }> = [
  { id: 'cus-01', code: 'KH-001', name: 'Trần Anh Tuấn', phone: '0912345671' },
  { id: 'cus-02', code: 'KH-002', name: 'Công ty TNHH Thắng Lợi', phone: '0912345672', note: 'Liên hệ anh Nguyễn Văn Thắng — 2 xe' },
  { id: 'cus-03', code: 'KH-003', name: 'Công ty In Sao Việt', phone: '0912345673', note: 'Liên hệ anh Lê Quang Huy — 2 xe' },
  { id: 'cus-04', code: 'KH-004', name: 'Phạm Thu Hà', phone: '0912345674' },
  { id: 'cus-05', code: 'KH-005', name: 'Nguyễn Hoàng Nam', phone: '0912345675' },
  { id: 'cus-06', code: 'KH-006', name: 'Vũ Thị Ngọc Anh', phone: '0912345676' },
  { id: 'cus-07', code: 'KH-007', name: 'Đặng Minh Quân', phone: '0912345677' },
  { id: 'cus-08', code: 'KH-008', name: 'Bùi Thanh Mai', phone: '0912345678' },
  { id: 'cus-09', code: 'KH-009', name: 'Hoàng Đức Long', phone: '0912345679' },
  { id: 'cus-10', code: 'KH-010', name: 'Lý Khánh Linh', phone: '0912345680' },
  { id: 'cus-11', code: 'KH-011', name: 'Trịnh Văn Sơn', phone: '0912345681' },
  { id: 'cus-12', code: 'KH-012', name: 'Công ty Dược Phú Thịnh', phone: '0912345682', note: 'Liên hệ chị Đỗ Thuỳ Dương' },
  { id: 'cus-13', code: 'KH-013', name: 'Ngô Bảo Châu', phone: '0912345683' },
  { id: 'cus-14', code: 'KH-014', name: 'Trần Đức Mạnh', phone: '0912345684' },
];

const VEHICLE_ROWS: Array<{ id: string; plate: string; vehicleType: VehicleType; customerId: string; brandModel: string; color: string }> = [
  { id: 'veh-01', plate: '30A-123.45', vehicleType: 'CAR', customerId: 'cus-01', brandModel: 'Toyota Camry', color: 'Đen' },
  { id: 'veh-02', plate: '30E-456.78', vehicleType: 'CAR', customerId: 'cus-02', brandModel: 'Ford Ranger', color: 'Trắng' },
  { id: 'veh-03', plate: '30F-234.56', vehicleType: 'CAR', customerId: 'cus-02', brandModel: 'Hyundai Accent', color: 'Bạc' },
  { id: 'veh-04', plate: '29H-345.67', vehicleType: 'CAR', customerId: 'cus-03', brandModel: 'Mazda CX-5', color: 'Đỏ' },
  { id: 'veh-05', plate: '29H-456.32', vehicleType: 'CAR', customerId: 'cus-03', brandModel: 'Kia Morning', color: 'Trắng' },
  { id: 'veh-06', plate: '51F-345.67', vehicleType: 'CAR', customerId: 'cus-04', brandModel: 'Toyota Vios', color: 'Trắng' },
  { id: 'veh-07', plate: '30G-678.90', vehicleType: 'CAR', customerId: 'cus-05', brandModel: 'Honda CR-V', color: 'Xám' },
  { id: 'veh-08', plate: '29A-567.89', vehicleType: 'CAR', customerId: 'cus-06', brandModel: 'VinFast VF5', color: 'Xanh' },
  { id: 'veh-09', plate: '30K-890.12', vehicleType: 'CAR', customerId: 'cus-07', brandModel: 'Mercedes C200', color: 'Đen' },
  { id: 'veh-10', plate: '51G-901.23', vehicleType: 'CAR', customerId: 'cus-08', brandModel: 'Mitsubishi Xpander', color: 'Bạc' },
  { id: 'veh-11', plate: '29C-789.01', vehicleType: 'CAR', customerId: 'cus-09', brandModel: 'Hyundai Tucson', color: 'Xanh đen' },
  { id: 'veh-12', plate: '30L-111.22', vehicleType: 'CAR', customerId: 'cus-10', brandModel: 'Honda City', color: 'Trắng' },
  { id: 'veh-13', plate: '29X-222.33', vehicleType: 'CAR', customerId: 'cus-11', brandModel: 'Toyota Fortuner', color: 'Đen' },
  { id: 'veh-14', plate: '30S-333.44', vehicleType: 'CAR', customerId: 'cus-12', brandModel: 'Chevrolet Captiva', color: 'Xám' },
  { id: 'veh-15', plate: '29-B2 456.78', vehicleType: 'MOTORBIKE', customerId: 'cus-04', brandModel: 'Honda Vision', color: 'Trắng' },
  { id: 'veh-16', plate: '29-F3 567.89', vehicleType: 'MOTORBIKE', customerId: 'cus-05', brandModel: 'Honda SH 150i', color: 'Đen' },
  { id: 'veh-17', plate: '30-G4 678.90', vehicleType: 'MOTORBIKE', customerId: 'cus-06', brandModel: 'Yamaha Janus', color: 'Hồng' },
  { id: 'veh-18', plate: '29-H5 789.01', vehicleType: 'MOTORBIKE', customerId: 'cus-07', brandModel: 'Honda Lead', color: 'Nâu' },
  { id: 'veh-19', plate: '30-K6 890.12', vehicleType: 'MOTORBIKE', customerId: 'cus-08', brandModel: 'Honda Air Blade', color: 'Đen đỏ' },
  { id: 'veh-20', plate: '29-L7 901.23', vehicleType: 'MOTORBIKE', customerId: 'cus-09', brandModel: 'Yamaha Exciter', color: 'Xanh' },
  { id: 'veh-21', plate: '30-M8 012.34', vehicleType: 'MOTORBIKE', customerId: 'cus-13', brandModel: 'Honda Winner X', color: 'Đen' },
  { id: 'veh-22', plate: '29-N9 111.22', vehicleType: 'MOTORBIKE', customerId: 'cus-14', brandModel: 'Honda Future', color: 'Xám' },
  { id: 'veh-23', plate: '30-P1 222.33', vehicleType: 'MOTORBIKE', customerId: 'cus-01', brandModel: 'Honda Cub 81', color: 'Nâu' },
  { id: 'veh-24', plate: '29-Q2 333.44', vehicleType: 'MOTORBIKE', customerId: 'cus-10', brandModel: 'Yamaha Grande', color: 'Trắng' },
  { id: 'veh-25', plate: '30-R3 444.55', vehicleType: 'MOTORBIKE', customerId: 'cus-11', brandModel: 'Honda Vario', color: 'Đỏ đen' },
  { id: 'veh-26', plate: '29-S4 555.66', vehicleType: 'MOTORBIKE', customerId: 'cus-12', brandModel: 'Honda Vision', color: 'Xanh ngọc' },
];

// ---------- Vé tháng dựng sẵn ----------
interface SeedSubscription {
  vehicleId: string;
  plan: SubscriptionPlanId;
  startDaysAgo: number;
  status: 'ACTIVE' | 'CANCELLED';
}

const SUBSCRIPTION_ROWS: SeedSubscription[] = [
  { vehicleId: 'veh-15', plan: '1M', startDaysAgo: 20, status: 'ACTIVE' },
  { vehicleId: 'veh-16', plan: '1M', startDaysAgo: 10, status: 'ACTIVE' },
  { vehicleId: 'veh-17', plan: '3M', startDaysAgo: 40, status: 'ACTIVE' },
  { vehicleId: 'veh-18', plan: '6M', startDaysAgo: 60, status: 'ACTIVE' },
  { vehicleId: 'veh-19', plan: '12M', startDaysAgo: 90, status: 'ACTIVE' },
  { vehicleId: 'veh-20', plan: '3M', startDaysAgo: 80, status: 'ACTIVE' },
  { vehicleId: 'veh-21', plan: '1M', startDaysAgo: 26, status: 'ACTIVE' },
  { vehicleId: 'veh-22', plan: '1M', startDaysAgo: 28, status: 'ACTIVE' },
  { vehicleId: 'veh-06', plan: '1M', startDaysAgo: 15, status: 'ACTIVE' },
  { vehicleId: 'veh-07', plan: '3M', startDaysAgo: 30, status: 'ACTIVE' },
  { vehicleId: 'veh-02', plan: '3M', startDaysAgo: 60, status: 'ACTIVE' },
  { vehicleId: 'veh-04', plan: '1M', startDaysAgo: 35, status: 'ACTIVE' },
  { vehicleId: 'veh-23', plan: '1M', startDaysAgo: 40, status: 'ACTIVE' },
  { vehicleId: 'veh-08', plan: '1M', startDaysAgo: 33, status: 'ACTIVE' },
  { vehicleId: 'veh-25', plan: '3M', startDaysAgo: 100, status: 'CANCELLED' },
];

// ---------- Sinh mã chứng từ đồng bộ với services ----------
const counters = new Map<string, number>();
function codeFor(prefix: string, date: Dayjs): string {
  const period = date.format('YYMMDD');
  const key = `${prefix}::${period}`;
  const next = (counters.get(key) ?? 0) + 1;
  counters.set(key, next);
  return `${prefix}-${period}-${String(next).padStart(4, '0')}`;
}

function randomCarPlate(): string {
  const series = pick(['30A', '30E', '30F', '30G', '30H', '29D', '29H', '51F', '51G', '29X', '30S'] as const);
  const d3 = rndInt(100, 999);
  const d2 = rndInt(10, 99);
  return `${series}-${d3}.${d2}`;
}

function randomMotoPlate(): string {
  const province = rndInt(29, 30);
  const letter = pick(['B', 'F', 'G', 'H', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S'] as const);
  const seriesDigit = rndInt(1, 9);
  const d3 = rndInt(100, 999);
  const d2 = rndInt(10, 99);
  return `${province}-${letter}${seriesDigit} ${d3}.${d2}`;
}

export async function ensureSeed(): Promise<void> {
  const meta = await db.appMeta.get('seedVersion');
  if (meta?.value === SEED_VERSION) return;
  if (localStorage.getItem(SEED_FLAG)) return; // tab khác đang seed
  localStorage.setItem(SEED_FLAG, '1');
  try {
    await seedAll();
    await db.appMeta.put({ key: 'seedVersion', value: SEED_VERSION });
    await db.appMeta.put({ key: 'schemaVersion', value: SCHEMA_VERSION });
  } finally {
    localStorage.removeItem(SEED_FLAG);
  }
}

async function seedAll(): Promise<void> {
  rngState = 20261018;
  counters.clear();
  const now = dayjs();

  const employees: Employee[] = EMPLOYEES.map((e) => ({ ...e, active: true }));
  const slots: Slot[] = SLOTS.map((s) => (MAINTENANCE_SLOT_IDS.has(s.id) ? { ...s, baseStatus: 'MAINTENANCE', note: 'Chờ sửa vạch sơn' } : s));
  const customers: Customer[] = CUSTOMER_ROWS.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    phone: c.phone,
    normalizedPhone: normalizePhone(c.phone),
    searchName: buildSearchName(c.name),
    createdAt: now.subtract(120 + rndInt(0, 200), 'day').toISOString(),
    note: c.note,
  }));
  const vehicles: Vehicle[] = VEHICLE_ROWS.map((v) => ({
    id: v.id,
    plate: v.plate,
    normalizedPlate: normalizePlate(v.plate),
    vehicleType: v.vehicleType,
    customerId: v.customerId,
    brandModel: v.brandModel,
    color: v.color,
    active: true,
  }));
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));

  // ---------- Vé tháng + thanh toán bán vé ----------
  const subscriptions: Subscription[] = [];
  const payments: Payment[] = [];
  const plans = DEFAULT_SUBSCRIPTION_PLANS;
  for (const row of SUBSCRIPTION_ROWS) {
    const vehicle = vehicleById.get(row.vehicleId)!;
    const plan = plans.find((p) => p.id === row.plan)!;
    const start = now.subtract(row.startDaysAgo, 'day').startOf('day').add(rndInt(8, 18), 'hour');
    const end = dayjs(start).add(plan.months, 'month');
    const priceVnd = plan.price[vehicle.vehicleType];
    const sub: Subscription = {
      id: newId(),
      code: codeFor('VT', start),
      customerId: vehicle.customerId!,
      vehicleId: vehicle.id,
      plan: plan.id,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      priceVnd,
      status: row.status,
      createdAt: start.toISOString(),
      note: row.status === 'CANCELLED' ? 'Khách chuyển công tác, huỷ vé' : undefined,
    };
    subscriptions.push(sub);
    payments.push({
      id: newId(),
      code: codeFor('HD', start),
      type: 'SUBSCRIPTION',
      subscriptionId: sub.id,
      description: `Bán vé tháng ${plan.name} — ${vehicle.plate}${row.status === 'CANCELLED' ? ' (sau huỷ)' : ''}`,
      amountVnd: priceVnd,
      method: weighted<PaymentMethod>([
        ['CASH', 5],
        ['TRANSFER', 4],
        ['CARD', 1],
      ]),
      at: start.add(5, 'minute').toISOString(),
      cashierId: pick(['emp-cashier-1', 'emp-cashier-2']),
      shiftId: undefined,
    });
  }

  // ---------- Phiên đang gửi ----------
  const activeSessions: ParkingSession[] = [];
  const occupiedSlotIds = new Set<string>();
  const usedActivePlates = new Set<string>();
  const zoneSlots = {
    CAR: shuffle(slots.filter((s) => s.zoneId !== 'zone-m' && s.baseStatus === 'AVAILABLE')),
    MOTORBIKE: shuffle(slots.filter((s) => s.zoneId === 'zone-m' && s.baseStatus === 'AVAILABLE')),
  };
  const subVehicleIds = new Set(subscriptions.filter((s) => s.status === 'ACTIVE' && dayjs(s.endDate).isAfter(now)).map((s) => s.vehicleId));
  const activeSubByVehicle = new Map(
    subscriptions
      .filter((s) => s.status === 'ACTIVE' && dayjs(s.endDate).isAfter(now))
      .map((s) => [s.vehicleId, s]),
  );
  const knownCarVehicles = vehicles.filter((v) => v.vehicleType === 'CAR');
  const knownMotoVehicles = vehicles.filter((v) => v.vehicleType === 'MOTORBIKE');

  function takeSlot(vt: VehicleType, preferSubscription: boolean): Slot {
    const pool = zoneSlots[vt];
    for (let i = 0; i < pool.length; i += 1) {
      const candidate = pool[i];
      if (occupiedSlotIds.has(candidate.id)) continue;
      if (preferSubscription && candidate.zoneId !== 'zone-a' && candidate.zoneId !== 'zone-m') continue;
      occupiedSlotIds.add(candidate.id);
      return candidate;
    }
    const fallback = pool.find((s) => !occupiedSlotIds.has(s.id));
    if (!fallback) throw new Error('Hết chỗ để tạo dữ liệu mẫu');
    occupiedSlotIds.add(fallback.id);
    return fallback;
  }

  interface ActiveSpec {
    vt: VehicleType;
    minutesAgo: number;
    subscription?: boolean;
    knownVehicle?: Vehicle;
    overstay?: boolean;
  }

  const activeSpecs: ActiveSpec[] = [];
  // 3 phiên quá 24h (1 ô tô + 2 xe máy)
  activeSpecs.push({ vt: 'CAR', minutesAgo: rndInt(26 * 60, 44 * 60), overstay: true, knownVehicle: knownCarVehicles[12] });
  activeSpecs.push({ vt: 'MOTORBIKE', minutesAgo: rndInt(26 * 60, 40 * 60), overstay: true });
  activeSpecs.push({ vt: 'MOTORBIKE', minutesAgo: rndInt(25 * 60, 36 * 60), overstay: true });
  // Phiên đêm qua (vào hôm qua, chưa ra)
  for (let i = 0; i < 6; i += 1) {
    activeSpecs.push({ vt: rnd() < 0.65 ? 'MOTORBIKE' : 'CAR', minutesAgo: rndInt(14 * 60, 22 * 60) });
  }
  // Khách vé tháng đang gửi (5 phiên)
  const subActiveVehicles = [...subVehicleIds].map((id) => vehicleById.get(id)!).filter(Boolean);
  const carsWithSub = subActiveVehicles.filter((v) => v.vehicleType === 'CAR');
  const motosWithSub = subActiveVehicles.filter((v) => v.vehicleType === 'MOTORBIKE');
  for (const vehicle of [carsWithSub[0], carsWithSub[1], motosWithSub[0], motosWithSub[1], motosWithSub[2]].filter(Boolean)) {
    activeSpecs.push({ vt: vehicle.vehicleType, minutesAgo: rndInt(20, 480), subscription: true, knownVehicle: vehicle });
  }
  // Còn lại vào trong ngày hôm nay
  const minutesSinceStart = Math.max(90, now.diff(now.startOf('day'), 'minute'));
  const todayTarget = Math.min(30, Math.max(12, Math.floor(minutesSinceStart / 20)));
  for (let i = 0; i < todayTarget; i += 1) {
    const vt: VehicleType = rnd() < 0.62 ? 'MOTORBIKE' : 'CAR';
    const known = rnd() < 0.5;
    activeSpecs.push({
      vt,
      minutesAgo: rndInt(12, Math.max(20, minutesSinceStart - 10)),
      knownVehicle: known ? pick(vt === 'CAR' ? knownCarVehicles : knownMotoVehicles) : undefined,
    });
  }

  for (const spec of activeSpecs) {
    const slot = takeSlot(spec.vt, Boolean(spec.subscription));
    const vehicle = spec.knownVehicle;
    let plate = vehicle?.plate ?? (spec.vt === 'CAR' ? randomCarPlate() : randomMotoPlate());
    for (let attempt = 0; attempt < 3 && usedActivePlates.has(normalizePlate(plate)); attempt += 1) {
      plate = spec.vt === 'CAR' ? randomCarPlate() : randomMotoPlate();
    }
    usedActivePlates.add(normalizePlate(plate));
    const effectiveVehicle = vehicle && normalizePlate(vehicle.plate) === normalizePlate(plate) ? vehicle : undefined;
    const sub = spec.subscription && effectiveVehicle ? activeSubByVehicle.get(effectiveVehicle.id) : undefined;
    const checkInAt = now.subtract(spec.minutesAgo, 'minute');
    activeSessions.push({
      id: newId(),
      code: codeFor('PG', checkInAt),
      plate,
      normalizedPlate: normalizePlate(plate),
      vehicleType: spec.vt,
      zoneId: slot.zoneId,
      slotId: slot.id,
      customerId: effectiveVehicle?.customerId,
      subscriptionId: sub?.id,
      ticketType: spec.subscription && effectiveVehicle ? 'SUBSCRIPTION' : 'HOURLY',
      checkInAt: checkInAt.toISOString(),
      status: 'IN',
      lostTicket: false,
    });
  }

  // ---------- Lịch sử 14 ngày ----------
  const historySessions: ParkingSession[] = [];
  const pricing: PricingConfig = DEFAULT_PRICING;
  const methodPool: ReadonlyArray<[PaymentMethod, number]> = [
    ['CASH', 5],
    ['TRANSFER', 3],
    ['CARD', 1],
  ];

  for (let daysAgo = 13; daysAgo >= 0; daysAgo -= 1) {
    const day = now.subtract(daysAgo, 'day');
    const isToday = daysAgo === 0;
    const count = isToday ? rndInt(6, 12) : rndInt(15, 22);
    for (let i = 0; i < count; i += 1) {
      const vt: VehicleType = rnd() < 0.6 ? 'MOTORBIKE' : 'CAR';
      const asSub = rnd() < 0.18 && (vt === 'CAR' ? carsWithSub.length : motosWithSub.length) > 0;
      const vehicle = asSub ? pick(vt === 'CAR' ? carsWithSub : motosWithSub) : rnd() < 0.5 ? pick(vt === 'CAR' ? knownCarVehicles : knownMotoVehicles) : undefined;
      const plate = vehicle?.plate ?? (vt === 'CAR' ? randomCarPlate() : randomMotoPlate());
      const sub = asSub && vehicle ? activeSubByVehicle.get(vehicle.id) : undefined;
      const startHour = isToday ? rndInt(6, Math.min(21, Math.max(7, now.hour()))) : rndInt(6, 21);
      const checkIn = day.startOf('day').add(startHour, 'hour').add(rndInt(0, 59), 'minute');
      let durationMin = rndInt(18, 560);
      let checkOut = checkIn.add(durationMin, 'minute');
      if (checkOut.isAfter(now)) {
        const maxMinutes = now.diff(checkIn, 'minute');
        if (maxMinutes < 20) continue;
        durationMin = rndInt(10, Math.max(18, maxMinutes - 5));
        checkOut = checkIn.add(durationMin, 'minute');
      }
      const fee = computeFee(checkIn.toISOString(), checkOut.toISOString(), vt, pricing);
      const zoneId = vt === 'MOTORBIKE' ? 'zone-m' : rnd() < 0.6 ? 'zone-a' : 'zone-b';
      const slotId = zoneId === 'zone-m' ? `slot-m${rndInt(1, 40)}` : zoneId === 'zone-a' ? `slot-a${rndInt(1, 24)}` : `slot-b${rndInt(1, 16)}`;
      const sessionId = newId();
      let paymentId: string | undefined;
      const total = sub ? 0 : fee.totalVnd;
      if (total > 0) {
        const payment: Payment = {
          id: newId(),
          code: codeFor('HD', checkOut),
          type: 'SESSION',
          sessionId,
          description: `Phí gửi xe ${plate} — ${vt === 'CAR' ? 'ô tô' : 'xe máy'}`,
          amountVnd: total,
          method: weighted(methodPool),
          at: checkOut.toISOString(),
          cashierId: pick(['emp-cashier-1', 'emp-cashier-2']),
        };
        payments.push(payment);
        paymentId = payment.id;
      }
      historySessions.push({
        id: sessionId,
        code: codeFor('PG', checkIn),
        plate,
        normalizedPlate: normalizePlate(plate),
        vehicleType: vt,
        zoneId,
        slotId,
        customerId: vehicle?.customerId,
        subscriptionId: sub?.id,
        ticketType: sub ? 'SUBSCRIPTION' : 'HOURLY',
        checkInAt: checkIn.toISOString(),
        checkOutAt: checkOut.toISOString(),
        status: 'OUT',
        feeVnd: total,
        paymentId,
        lostTicket: false,
      });
    }
  }

  // ---------- Ca trực ----------
  const shifts: Shift[] = [];
  // Hai ngày trước và hôm qua: mỗi ngày 2 ca đã đóng
  for (const daysAgo of [2, 1]) {
    const day = now.subtract(daysAgo, 'day');
    const pair: Array<{ emp: string; from: number; to: number }> = [
      { emp: daysAgo === 2 ? 'emp-cashier-1' : 'emp-cashier-2', from: 6, to: 14 },
      { emp: daysAgo === 2 ? 'emp-cashier-2' : 'emp-cashier-1', from: 14, to: 22 },
    ];
    for (const p of pair) {
      const opened = day.startOf('day').add(p.from, 'hour');
      const closed = day.startOf('day').add(p.to, 'hour');
      const shiftId = newId();
      const shiftPayments = payments.filter((x) => x.type === 'SESSION' && dayjs(x.at).isAfter(opened) && dayjs(x.at).isBefore(closed));
      const cashSum = shiftPayments.filter((x) => x.method === 'CASH').reduce((s, x) => s + x.amountVnd, 0);
      for (const x of shiftPayments) x.shiftId = shiftId;
      const opening = 2_000_000;
      shifts.push({
        id: shiftId,
        code: codeFor('CA', opened),
        employeeId: p.emp,
        openedAt: opened.toISOString(),
        closedAt: closed.toISOString(),
        openingCashVnd: opening,
        countedCashVnd: opening + cashSum - (rnd() < 0.35 ? rndInt(1, 5) * 5000 : 0),
        status: 'CLOSED',
      });
    }
  }
  // Hôm nay: 1 ca đang mở
  const openedToday = now.subtract(Math.min(now.diff(now.startOf('day'), 'minute'), 480), 'minute');
  const todayShiftId = newId();
  const todayPayments = payments.filter((x) => x.type === 'SESSION' && dayjs(x.at).isAfter(openedToday));
  for (const x of todayPayments) x.shiftId = todayShiftId;
  shifts.push({
    id: todayShiftId,
    code: codeFor('CA', openedToday),
    employeeId: 'emp-cashier-1',
    openedAt: openedToday.toISOString(),
    openingCashVnd: 2_000_000,
    status: 'OPEN',
  });

  // ---------- Sự cố ----------
  const incidents: Incident[] = [
    {
      id: newId(),
      code: codeFor('SC', now.subtract(1, 'day')),
      plate: '29H-556.77',
      type: 'LOST_TICKET',
      description: 'Khách làm mất vé gửi xe máy, xác minh theo ảnh chỗ đỗ và giấy tờ xe.',
      feeVnd: 50000,
      status: 'RESOLVED',
      createdAt: now.subtract(1, 'day').hour(18).minute(20).toISOString(),
      resolvedAt: now.subtract(1, 'day').hour(18).minute(50).toISOString(),
      handledById: 'emp-att-1',
      resolution: 'Đã thu phụ phí 50.000đ và cho xe ra.',
    },
    {
      id: newId(),
      code: codeFor('SC', now.subtract(1, 'day')),
      plate: '30A-999.11',
      type: 'COLLISION',
      description: 'Xe bị trầy xước nhẹ ở cửa sau khi đỗ cạnh cột B14. Hai bên tự thoả thuận, bãi xác nhận hiện trường.',
      feeVnd: undefined,
      status: 'RESOLVED',
      createdAt: now.subtract(1, 'day').hour(10).minute(5).toISOString(),
      resolvedAt: now.subtract(1, 'day').hour(11).minute(30).toISOString(),
      handledById: 'emp-manager',
      resolution: 'Đã lập biên bản xác nhận hiện trường, hai chủ xe thoả thuận bồi thường ngoài.',
    },
    {
      id: newId(),
      code: codeFor('SC', now),
      sessionId: activeSessions[0]?.id,
      plate: activeSessions[0]?.plate,
      type: 'OVERSTAY',
      description: 'Xe đỗ quá 24 giờ, chưa thấy khách quay lại. Đã gọi điện theo số đăng ký, khách báo đang công tác.',
      feeVnd: undefined,
      status: 'NEW',
      createdAt: now.subtract(3, 'hour').toISOString(),
    },
    {
      id: newId(),
      code: codeFor('SC', now),
      type: 'EQUIPMENT',
      description: 'Đầu đọc thẻ ở làn vào bị treo, đã khởi động lại và hoạt động bình thường.',
      feeVnd: undefined,
      status: 'RESOLVED',
      createdAt: now.subtract(5, 'hour').toISOString(),
      resolvedAt: now.subtract(4, 'hour').toISOString(),
      handledById: 'emp-tech',
      resolution: 'Khởi động lại thiết bị, theo dõi thêm 2 giờ không lặp lại lỗi.',
    },
    {
      id: newId(),
      code: codeFor('SC', now),
      type: 'LOST_TICKET',
      plate: '30G-222.88',
      description: 'Khách báo mất vé, chưa xuất trình giấy tờ. Đang xác minh với ban quản lý toà nhà.',
      feeVnd: 50000,
      status: 'NEW',
      createdAt: now.subtract(40, 'minute').toISOString(),
    },
  ];

  // ---------- Nhật ký hoạt động ----------
  const logs: ActivityLog[] = [];
  const recentSessions = [...activeSessions].sort((a, b) => (a.checkInAt < b.checkInAt ? 1 : -1)).slice(0, 5);
  for (const s of recentSessions) {
    logs.push({
      id: newId(),
      at: s.checkInAt,
      actorName: pick(['Nguyễn Thành Long', 'Trần Văn Dũng', 'Phạm Hải Yến']),
      summary: `Xe vào ${s.plate}${s.ticketType === 'SUBSCRIPTION' ? ' (vé tháng)' : ''}`,
      entityType: 'SESSION',
      entityId: s.id,
    });
  }
  const recentOut = historySessions.slice(-4);
  for (const s of recentOut) {
    logs.push({
      id: newId(),
      at: s.checkOutAt!,
      actorName: pick(['Lê Thu Trang', 'Hoàng Minh Châu']),
      summary: `Xe ra ${s.plate} — thu ${(s.feeVnd ?? 0).toLocaleString('vi-VN')}đ`,
      entityType: 'SESSION',
      entityId: s.id,
    });
  }
  logs.push({
    id: newId(),
    at: shifts[shifts.length - 1].openedAt,
    actorName: 'Lê Thu Trang',
    summary: `Mở ca ${shifts[shifts.length - 1].code} — tiền đầu ca 2.000.000đ`,
    entityType: 'SHIFT',
    entityId: shifts[shifts.length - 1].id,
  });
  logs.push({
    id: newId(),
    at: now.subtract(4, 'hour').toISOString(),
    actorName: 'Bùi Đức Anh',
    summary: 'Xử lý sự cố đầu đọc thẻ làn vào — đã khởi động lại thiết bị',
    entityType: 'INCIDENT',
    entityId: incidents[3].id,
  });
  logs.push({
    id: newId(),
    at: now.subtract(1, 'day').hour(18).minute(50).toISOString(),
    actorName: 'Nguyễn Thành Long',
    summary: 'Thu phụ phí mất vé 50.000đ cho xe 29H-556.77',
    entityType: 'INCIDENT',
    entityId: incidents[0].id,
  });

  // ---------- Ghi tất cả vào Dexie ----------
  // Khóa bộ đếm phải khớp documentType mà nextCode() tra cứu lúc chạy (SESSION/PAYMENT/...)
  const PREFIX_TO_TYPE: Record<string, string> = {
    PG: 'SESSION',
    HD: 'PAYMENT',
    VT: 'SUBSCRIPTION',
    CA: 'SHIFT',
    SC: 'INCIDENT',
    KH: 'CUSTOMER',
  };
  const documentSequences: DocumentSequence[] = [...counters.entries()].map(([key, last]) => {
    const [prefix, period] = key.split('::');
    const documentType = PREFIX_TO_TYPE[prefix] ?? prefix;
    return { id: `${documentType}::${period}`, documentType, period, nextValue: last + 1 };
  });

  await db.transaction(
    'rw',
    [
      db.employees,
      db.zones,
      db.slots,
      db.customers,
      db.vehicles,
      db.subscriptions,
      db.sessions,
      db.payments,
      db.shifts,
      db.incidents,
      db.activityLogs,
      db.documentSequences,
      db.settings,
      db.appMeta,
    ],
    async () => {
      await db.employees.bulkAdd(employees);
      await db.zones.bulkAdd(ZONES);
      await db.slots.bulkAdd(slots);
      await db.customers.bulkAdd(customers);
      await db.vehicles.bulkAdd(vehicles);
      await db.subscriptions.bulkAdd(subscriptions);
      await db.sessions.bulkAdd([...activeSessions, ...historySessions]);
      await db.payments.bulkAdd(payments);
      await db.shifts.bulkAdd(shifts);
      await db.incidents.bulkAdd(incidents);
      await db.activityLogs.bulkAdd(logs);
      await db.documentSequences.bulkAdd(documentSequences);
      await db.settings.bulkAdd([
        { key: SETTING_KEYS.PARKING_INFO, value: DEFAULT_PARKING_INFO },
        { key: SETTING_KEYS.PRICING, value: DEFAULT_PRICING },
        { key: SETTING_KEYS.SUBSCRIPTION_PLANS, value: DEFAULT_SUBSCRIPTION_PLANS },
        { key: SETTING_KEYS.AI_CONFIG, value: DEFAULT_AI_CONFIG },
        { key: SETTING_KEYS.PRINT_CONFIG, value: DEFAULT_PRINT_CONFIG },
      ]);
    },
  );
}
