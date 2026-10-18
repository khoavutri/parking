import dayjs from 'dayjs';
import { db } from '../db/database';
import type { ActivityLog, Customer, ParkingSession, Slot, Subscription, Vehicle } from '../types';
import { subscriptionState } from '../utils/status';

export interface OverstayRow {
  session: ParkingSession;
  slot?: Slot;
  hours: number;
}

export interface ExpiringRow {
  subscription: Subscription;
  vehicle?: Vehicle;
  customer?: Customer;
  daysLeft: number;
}

export interface DashboardData {
  activeCount: number;
  totalSlots: number;
  availableSlots: number;
  maintenanceSlots: number;
  checkedInToday: number;
  checkedOutToday: number;
  revenueTodayVnd: number;
  revenueYesterdayVnd: number;
  revenue7dVnd: number;
  revenueMonthVnd: number;
  activeSubscriptions: number;
  expiringRows: ExpiringRow[];
  overstayRows: OverstayRow[];
  hourlyFlows: Array<{ hour: number; inCount: number; outCount: number }>;
  revenueByDay: Array<{ key: string; label: string; vnd: number }>;
  mix30d: { sessionVnd: number; subscriptionVnd: number; incidentVnd: number };
  openIncidents: number;
  recentLogs: ActivityLog[];
}

export async function getDashboardData(): Promise<DashboardData> {
  const now = dayjs();
  const startToday = now.startOf('day');
  const startYesterday = now.subtract(1, 'day').startOf('day');
  const start7d = now.subtract(6, 'day').startOf('day');
  const start30d = now.subtract(29, 'day').startOf('day');
  const startMonth = now.startOf('month');

  const [sessions, slots, payments, subscriptions, incidents, logs, customers, vehicles] = await Promise.all([
    db.sessions.toArray(),
    db.slots.toArray(),
    db.payments.toArray(),
    db.subscriptions.toArray(),
    db.incidents.toArray(),
    db.activityLogs.orderBy('at').reverse().limit(9).toArray(),
    db.customers.toArray(),
    db.vehicles.toArray(),
  ]);

  const activeSessions = sessions.filter((s) => s.status === 'IN');
  const maintenanceSlots = slots.filter((s) => s.baseStatus === 'MAINTENANCE').length;
  const usableSlots = slots.length - maintenanceSlots;
  const occupiedSlotIds = new Set(activeSessions.map((s) => s.slotId));
  const availableSlots = Math.max(0, usableSlots - occupiedSlotIds.size);

  const checkedInToday = sessions.filter((s) => dayjs(s.checkInAt).isAfter(startToday)).length;
  const checkedOutToday = sessions.filter((s) => s.checkOutAt && dayjs(s.checkOutAt).isAfter(startToday)).length;

  const revenueTodayVnd = payments.filter((p) => dayjs(p.at).isAfter(startToday)).reduce((sum, p) => sum + p.amountVnd, 0);
  const revenueYesterdayVnd = payments
    .filter((p) => dayjs(p.at).isAfter(startYesterday) && dayjs(p.at).isBefore(startToday))
    .reduce((sum, p) => sum + p.amountVnd, 0);
  const revenue7dVnd = payments.filter((p) => dayjs(p.at).isAfter(start7d)).reduce((sum, p) => sum + p.amountVnd, 0);
  const revenueMonthVnd = payments.filter((p) => dayjs(p.at).isAfter(startMonth)).reduce((sum, p) => sum + p.amountVnd, 0);

  const activeSubs = subscriptions.filter((s) => s.status === 'ACTIVE' && dayjs(s.endDate).isAfter(now));
  const expiringRows: ExpiringRow[] = subscriptions
    .filter((s) => {
      const state = subscriptionState(s);
      return state.key === 'EXPIRING' || state.key === 'EXPIRED';
    })
    .map((s) => {
      const vehicle = vehicles.find((v) => v.id === s.vehicleId);
      const customer = vehicle?.customerId ? customers.find((c) => c.id === vehicle.customerId) : undefined;
      return { subscription: s, vehicle, customer, daysLeft: subscriptionState(s).daysLeft };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 6);

  const overstayRows: OverstayRow[] = activeSessions
    .filter((s) => now.diff(dayjs(s.checkInAt), 'hour') >= 24)
    .map((s) => ({ session: s, slot: slots.find((x) => x.id === s.slotId), hours: now.diff(dayjs(s.checkInAt), 'hour') }))
    .sort((a, b) => b.hours - a.hours);

  const hourlyFlows = Array.from({ length: 17 }, (_, i) => {
    const hour = i + 6;
    const inCount = sessions.filter((s) => dayjs(s.checkInAt).isSame(now, 'day') && dayjs(s.checkInAt).hour() === hour).length;
    const outCount = sessions.filter((s) => s.checkOutAt && dayjs(s.checkOutAt).isSame(now, 'day') && dayjs(s.checkOutAt).hour() === hour).length;
    return { hour, inCount, outCount };
  });

  const revenueByDay = Array.from({ length: 7 }, (_, i) => {
    const day = now.subtract(6 - i, 'day');
    const vnd = payments
      .filter((p) => dayjs(p.at).isSame(day, 'day'))
      .reduce((sum, p) => sum + p.amountVnd, 0);
    return { key: day.format('YYYY-MM-DD'), label: day.format('DD/MM'), vnd };
  });

  const payments30d = payments.filter((p) => dayjs(p.at).isAfter(start30d));
  const mix30d = {
    sessionVnd: payments30d.filter((p) => p.type === 'SESSION').reduce((s, p) => s + p.amountVnd, 0),
    subscriptionVnd: payments30d.filter((p) => p.type === 'SUBSCRIPTION').reduce((s, p) => s + p.amountVnd, 0),
    incidentVnd: payments30d.filter((p) => p.type === 'INCIDENT').reduce((s, p) => s + p.amountVnd, 0),
  };

  return {
    activeCount: activeSessions.length,
    totalSlots: slots.length,
    availableSlots,
    maintenanceSlots,
    checkedInToday,
    checkedOutToday,
    revenueTodayVnd,
    revenueYesterdayVnd,
    revenue7dVnd,
    revenueMonthVnd,
    activeSubscriptions: activeSubs.length,
    expiringRows,
    overstayRows,
    hourlyFlows,
    revenueByDay,
    mix30d,
    openIncidents: incidents.filter((i) => i.status === 'NEW').length,
    recentLogs: logs,
  };
}
