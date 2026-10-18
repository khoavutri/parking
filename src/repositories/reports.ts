import dayjs from 'dayjs';
import { db } from '../db/database';
import type { SessionStatus, VehicleType } from '../types';
import { subscriptionState } from '../utils/status';

export interface RevenueByDayRow {
  key: string;
  label: string;
  sessionVnd: number;
  subscriptionVnd: number;
  incidentVnd: number;
  totalVnd: number;
  count: number;
}

export async function getRevenueByDay(days: number): Promise<RevenueByDayRow[]> {
  const payments = await db.payments.toArray();
  const now = dayjs();
  return Array.from({ length: days }, (_, i) => {
    const day = now.subtract(days - 1 - i, 'day');
    const rows = payments.filter((p) => dayjs(p.at).isSame(day, 'day'));
    const sessionVnd = rows.filter((p) => p.type === 'SESSION').reduce((s, p) => s + p.amountVnd, 0);
    const subscriptionVnd = rows.filter((p) => p.type === 'SUBSCRIPTION').reduce((s, p) => s + p.amountVnd, 0);
    const incidentVnd = rows.filter((p) => p.type === 'INCIDENT').reduce((s, p) => s + p.amountVnd, 0);
    return {
      key: day.format('YYYY-MM-DD'),
      label: day.format('DD/MM'),
      sessionVnd,
      subscriptionVnd,
      incidentVnd,
      totalVnd: sessionVnd + subscriptionVnd + incidentVnd,
      count: rows.length,
    };
  });
}

export interface FlowStats {
  byHour: Array<{ hour: number; inCount: number; outCount: number }>;
  byWeekday: Array<{ label: string; inCount: number; outCount: number }>;
  byVehicle: { carIn: number; carOut: number; motoIn: number; motoOut: number };
  peakHour?: number;
}

export async function getFlowStats(days: number): Promise<FlowStats> {
  const sessions = await db.sessions.toArray();
  const start = dayjs().subtract(days - 1, 'day').startOf('day');
  const inRange = sessions.filter((s) => dayjs(s.checkInAt).isAfter(start));

  const byHour = Array.from({ length: 17 }, (_, i) => {
    const hour = i + 6;
    return {
      hour,
      inCount: inRange.filter((s) => dayjs(s.checkInAt).hour() === hour).length,
      outCount: inRange.filter((s) => s.checkOutAt && dayjs(s.checkOutAt).hour() === hour).length,
    };
  });
  const peak = byHour.reduce((best, cur) => (cur.inCount > best.inCount ? cur : best), byHour[0]);

  const weekdayLabels = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  const byWeekday = Array.from({ length: 7 }, (_, i) => {
    const label = weekdayLabels[i];
    return {
      label,
      inCount: inRange.filter((s) => dayjs(s.checkInAt).day() === i).length,
      outCount: inRange.filter((s) => s.checkOutAt && dayjs(s.checkOutAt).day() === i).length,
    };
  });

  const vehicleCounts = (vt: VehicleType, direction: 'IN' | 'OUT') =>
    inRange.filter((s) => s.vehicleType === vt && (direction === 'IN' || s.checkOutAt)).length;

  return {
    byHour,
    byWeekday,
    byVehicle: {
      carIn: vehicleCounts('CAR', 'IN'),
      carOut: inRange.filter((s) => s.vehicleType === 'CAR' && s.status === 'OUT').length,
      motoIn: vehicleCounts('MOTORBIKE', 'IN'),
      motoOut: inRange.filter((s) => s.vehicleType === 'MOTORBIKE' && s.status === 'OUT').length,
    },
    peakHour: peak.hour,
  };
}

export interface SubscriptionStats {
  byPlan: Array<{ plan: string; count: number; revenueVnd: number }>;
  activeCount: number;
  monthlyRevenue: Array<{ label: string; vnd: number }>;
  topCustomers: Array<{ name: string; phone: string; totalVnd: number }>;
  occupancyByZone: Array<{ zoneName: string; occupied: number; total: number }>;
}

export async function getSubscriptionStats(): Promise<SubscriptionStats> {
  const [subscriptions, payments, customers, vehicles, zones, slots, sessions] = await Promise.all([
    db.subscriptions.toArray(),
    db.payments.toArray(),
    db.customers.toArray(),
    db.vehicles.toArray(),
    db.zones.toArray(),
    db.slots.toArray(),
    db.sessions.toArray(),
  ]);

  const planLabels: Record<string, string> = { '1M': '1 tháng', '3M': '3 tháng', '6M': '6 tháng', '12M': '12 tháng' };
  const byPlan = ['1M', '3M', '6M', '12M'].map((plan) => {
    const rows = subscriptions.filter((s) => s.plan === plan && subscriptionState(s).key !== 'CANCELLED');
    return {
      plan: planLabels[plan],
      count: rows.filter((s) => subscriptionState(s).key === 'ACTIVE' || subscriptionState(s).key === 'EXPIRING').length,
      revenueVnd: rows.reduce((sum, s) => sum + s.priceVnd, 0),
    };
  });

  const now = dayjs();
  const monthlyRevenue = Array.from({ length: 6 }, (_, i) => {
    const month = now.subtract(5 - i, 'month');
    const vnd = payments
      .filter((p) => p.type === 'SUBSCRIPTION' && dayjs(p.at).isSame(month, 'month'))
      .reduce((s, p) => s + p.amountVnd, 0);
    return { label: month.format('MM/YYYY'), vnd };
  });

  const topCustomers = customers
    .map((c) => {
      const plateIds = vehicles.filter((v) => v.customerId === c.id).map((v) => v.id);
      const totals = payments
        .filter((p) => (p.type === 'SUBSCRIPTION' && p.subscriptionId && subscriptions.some((s) => s.id === p.subscriptionId && plateIds.includes(s.vehicleId))) || p.type === 'SESSION')
        .filter((p) => {
          if (p.type !== 'SESSION') return true;
          const vehiclePlates = vehicles.filter((v) => v.customerId === c.id).map((v) => v.normalizedPlate);
          const session = sessions.find((s) => s.id === p.sessionId);
          return session ? vehiclePlates.includes(session.normalizedPlate) : false;
        })
        .reduce((s, p) => s + p.amountVnd, 0);
      return { name: c.name, phone: c.phone, totalVnd: totals };
    })
    .filter((c) => c.totalVnd > 0)
    .sort((a, b) => b.totalVnd - a.totalVnd)
    .slice(0, 6);

  const activeSessions = sessions.filter((s: { status: SessionStatus }) => s.status === 'IN');
  const occupancyByZone = zones.map((zone) => {
    const zoneSlots = slots.filter((s) => s.zoneId === zone.id && s.baseStatus === 'AVAILABLE');
    const occupied = activeSessions.filter((s) => s.zoneId === zone.id).length;
    return { zoneName: zone.name, occupied, total: zoneSlots.length };
  });

  return {
    byPlan,
    activeCount: subscriptions.filter((s) => subscriptionState(s).key === 'ACTIVE' || subscriptionState(s).key === 'EXPIRING').length,
    monthlyRevenue,
    topCustomers,
    occupancyByZone,
  };
}
