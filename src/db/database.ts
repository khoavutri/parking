import Dexie, { type EntityTable } from 'dexie';
import type {
  ActivityLog,
  AppMetaRecord,
  Customer,
  DocumentSequence,
  Employee,
  Incident,
  OperationReceipt,
  ParkingSession,
  Payment,
  SettingRecord,
  Shift,
  Slot,
  Subscription,
  Vehicle,
  Zone,
} from '../types';

export const DB_NAME = 'parkone';
export const SCHEMA_VERSION = 1;

type ParkOneDB = Dexie & {
  employees: EntityTable<Employee, 'id'>;
  zones: EntityTable<Zone, 'id'>;
  slots: EntityTable<Slot, 'id'>;
  customers: EntityTable<Customer, 'id'>;
  vehicles: EntityTable<Vehicle, 'id'>;
  subscriptions: EntityTable<Subscription, 'id'>;
  sessions: EntityTable<ParkingSession, 'id'>;
  payments: EntityTable<Payment, 'id'>;
  shifts: EntityTable<Shift, 'id'>;
  incidents: EntityTable<Incident, 'id'>;
  activityLogs: EntityTable<ActivityLog, 'id'>;
  operationReceipts: EntityTable<OperationReceipt, 'id'>;
  documentSequences: EntityTable<DocumentSequence, 'id'>;
  settings: EntityTable<SettingRecord, 'key'>;
  appMeta: EntityTable<AppMetaRecord, 'key'>;
};

export const db = new Dexie(DB_NAME) as ParkOneDB;

db.version(SCHEMA_VERSION).stores({
  employees: 'id, &code, role, active',
  zones: 'id, &code, vehicleType, active',
  slots: 'id, &code, zoneId, baseStatus',
  customers: 'id, &code, searchName, normalizedPhone, phone',
  vehicles: 'id, normalizedPlate, customerId, vehicleType, active',
  subscriptions: 'id, &code, customerId, vehicleId, status, endDate',
  sessions: 'id, &code, normalizedPlate, status, slotId, zoneId, checkInAt, subscriptionId',
  payments: 'id, &code, type, at, shiftId, sessionId, subscriptionId',
  shifts: 'id, &code, employeeId, status, openedAt',
  incidents: 'id, &code, type, status, createdAt, plate',
  activityLogs: 'id, at, entityType, entityId',
  operationReceipts: 'id, operationType, completedAt',
  documentSequences: 'id, documentType, period',
  settings: 'key',
  appMeta: 'key',
});

export function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = (error as { name?: string }).name ?? '';
  return name === 'QuotaExceededError' || name === 'ConstraintError';
}
