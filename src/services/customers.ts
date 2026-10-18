import dayjs from 'dayjs';
import { db } from '../db/database';
import { newId } from '../utils/ids';
import { nowIso } from '../utils/format';
import { buildSearchName, isValidPhone, normalizePhone, normalizePlate } from '../utils/text';
import type { Actor, Customer, Vehicle, VehicleType } from '../types';
import { assertRule, BusinessError, NotFoundError } from './errors';
import { assertAction } from './permissions';
import { logActivity, nextCode } from './core';

export interface CustomerInput {
  name: string;
  phone: string;
  note?: string;
}

export async function createCustomer(actor: Actor, input: CustomerInput): Promise<Customer> {
  assertAction(actor, 'customer.manage');
  assertRule(input.name.trim().length >= 2, 'Tên khách hàng quá ngắn.');
  assertRule(isValidPhone(input.phone), 'Số điện thoại chưa hợp lệ.');
  const normalizedPhone = normalizePhone(input.phone);
  const existing = await db.customers.where('normalizedPhone').equals(normalizedPhone).first();
  if (existing) {
    throw new BusinessError(`Số điện thoại này đã thuộc khách "${existing.name}" (${existing.code}). Mở hồ sơ khách cũ để thêm xe.`, 'DUPLICATE_PHONE');
  }
  let customer!: Customer;
  await db.transaction('rw', db.customers, db.documentSequences, db.activityLogs, async () => {
    customer = {
      id: newId(),
      code: await nextCode('CUSTOMER'),
      name: input.name.trim(),
      phone: input.phone.trim(),
      normalizedPhone,
      searchName: buildSearchName(input.name),
      createdAt: nowIso(),
      note: input.note?.trim() || undefined,
    };
    await db.customers.add(customer);
    await logActivity({
      entityType: 'CUSTOMER',
      entityId: customer.id,
      actorName: actor.name,
      summary: `Tạo khách hàng ${customer.name} (${customer.code})`,
    });
  });
  return customer;
}

export async function updateCustomer(actor: Actor, customerId: string, input: CustomerInput): Promise<void> {
  assertAction(actor, 'customer.manage');
  const customer = await db.customers.get(customerId);
  if (!customer) throw new NotFoundError('Không tìm thấy khách hàng.');
  assertRule(isValidPhone(input.phone), 'Số điện thoại chưa hợp lệ.');
  const normalizedPhone = normalizePhone(input.phone);
  const duplicate = await db.customers.where('normalizedPhone').equals(normalizedPhone).first();
  assertRule(!duplicate || duplicate.id === customerId, `Số điện thoại đang thuộc khách "${duplicate?.name}".`);
  await db.transaction('rw', db.customers, db.activityLogs, async () => {
    await db.customers.update(customerId, {
      name: input.name.trim(),
      phone: input.phone.trim(),
      normalizedPhone,
      searchName: buildSearchName(input.name),
      note: input.note?.trim() || undefined,
    });
    await logActivity({
      entityType: 'CUSTOMER',
      entityId: customerId,
      actorName: actor.name,
      summary: `Cập nhật khách hàng ${input.name.trim()}`,
    });
  });
}

export interface VehicleInput {
  plate: string;
  vehicleType: VehicleType;
  brandModel?: string;
  color?: string;
  customerId?: string;
}

export async function saveVehicle(actor: Actor, vehicleId: string | null, input: VehicleInput): Promise<Vehicle> {
  assertAction(actor, input.customerId ? 'customer.manage' : 'session.checkin');
  const plate = input.plate.trim().toUpperCase().replace(/\s+/g, ' ');
  assertRule(plate.length >= 5, 'Biển số chưa hợp lệ.');
  const normalizedPlate = normalizePlate(plate);
  const duplicate = await db.vehicles.where('normalizedPlate').equals(normalizedPlate).first();
  if (duplicate && duplicate.id !== vehicleId) {
    throw new BusinessError(`Biển số ${plate} đã thuộc hồ sơ khác trong hệ thống.`, 'DUPLICATE_PLATE');
  }
  let vehicle!: Vehicle;
  await db.transaction('rw', db.vehicles, db.activityLogs, async () => {
    if (vehicleId) {
      await db.vehicles.update(vehicleId, {
        plate,
        normalizedPlate,
        vehicleType: input.vehicleType,
        brandModel: input.brandModel?.trim() || undefined,
        color: input.color?.trim() || undefined,
        customerId: input.customerId || undefined,
      });
      vehicle = (await db.vehicles.get(vehicleId))!;
      await logActivity({
        entityType: 'VEHICLE',
        entityId: vehicleId,
        actorName: actor.name,
        summary: `Cập nhật xe ${plate}${input.brandModel ? ` — ${input.brandModel}` : ''}`,
      });
    } else {
      vehicle = {
        id: newId(),
        plate,
        normalizedPlate,
        vehicleType: input.vehicleType,
        customerId: input.customerId || undefined,
        brandModel: input.brandModel?.trim() || undefined,
        color: input.color?.trim() || undefined,
        active: true,
      };
      await db.vehicles.add(vehicle);
      await logActivity({
        entityType: 'VEHICLE',
        entityId: vehicle.id,
        actorName: actor.name,
        summary: `Thêm xe ${plate}${input.customerId ? '' : ' (khách vãng lai)'}`,
      });
    }
  });
  return vehicle;
}

/** Đảm bảo xe tồn tại theo biển số, dùng khi bán vé tháng nhanh */
export async function ensureVehicle(actor: Actor, plate: string, vehicleType: VehicleType, customerId: string): Promise<Vehicle> {
  const normalizedPlate = normalizePlate(plate);
  const existing = await db.vehicles.where('normalizedPlate').equals(normalizedPlate).first();
  if (existing) {
    if (existing.customerId && existing.customerId !== customerId) {
      throw new BusinessError(`Xe ${existing.plate} đang thuộc hồ sơ khách khác. Kiểm tra lại biển số.`, 'PLATE_OWNED');
    }
    if (!existing.customerId) {
      await db.vehicles.update(existing.id, { customerId });
    }
    return (await db.vehicles.get(existing.id))!;
  }
  return saveVehicle(actor, null, { plate, vehicleType, customerId });
}

export function vehicleLabel(vehicle: Pick<Vehicle, 'plate' | 'brandModel'>): string {
  return vehicle.brandModel ? `${vehicle.plate} · ${vehicle.brandModel}` : vehicle.plate;
}

export async function customerSearch(keyword: string, limit = 8): Promise<Customer[]> {
  const all = await db.customers.toArray();
  const normalized = buildSearchName(keyword);
  const digits = normalizePhone(keyword);
  return all
    .filter((c) => (normalized ? c.searchName.includes(normalized) : false) || (digits.length >= 3 ? c.normalizedPhone.includes(digits) : false))
    .slice(0, limit);
}

export function customerSince(customer: Customer): number {
  return dayjs(customer.createdAt).valueOf();
}
