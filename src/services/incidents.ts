import dayjs from 'dayjs';
import { db } from '../db/database';
import { newId } from '../utils/ids';
import { nowIso } from '../utils/format';
import type { Actor, Incident, IncidentType, PaymentMethod, VehicleType } from '../types';
import { assertRule, NotFoundError } from './errors';
import { assertAction } from './permissions';
import { logActivity, nextCode } from './core';
import { DEFAULT_PRICING, getSetting, SETTING_KEYS } from './settings';
import { recordIncidentPayment } from './finance';

export async function suggestedIncidentFee(type: IncidentType, vehicleType: VehicleType = 'CAR'): Promise<number> {
  const pricing = await getSetting(SETTING_KEYS.PRICING, DEFAULT_PRICING);
  if (type === 'LOST_TICKET') return pricing.lostTicket[vehicleType] ?? 0;
  if (type === 'OVERSTAY') return pricing[vehicleType === 'CAR' ? 'car' : 'motorbike'].dayCapVnd;
  return 0;
}

export interface CreateIncidentInput {
  sessionId?: string;
  plate?: string;
  type: IncidentType;
  description: string;
  feeVnd?: number;
  collect?: boolean;
  method?: PaymentMethod;
  vehicleType?: VehicleType;
}

export async function createIncident(actor: Actor, input: CreateIncidentInput): Promise<Incident> {
  assertAction(actor, 'incident.manage');
  assertRule(input.description.trim().length >= 5, 'Mô tả sự cố cần cụ thể hơn (ít nhất 5 ký tự).');
  const fee = input.feeVnd ?? (await suggestedIncidentFee(input.type, input.vehicleType ?? 'CAR'));
  const now = nowIso();
  let incident!: Incident;
  await db.transaction('rw', db.incidents, db.documentSequences, db.activityLogs, async () => {
    incident = {
      id: newId(),
      code: await nextCode('INCIDENT', dayjs().format('YYMMDD')),
      sessionId: input.sessionId,
      plate: input.plate?.trim().toUpperCase() || undefined,
      type: input.type,
      description: input.description.trim(),
      feeVnd: fee > 0 ? fee : undefined,
      status: 'NEW',
      createdAt: now,
    };
    await db.incidents.add(incident);
    await logActivity({
      entityType: 'INCIDENT',
      entityId: incident.id,
      actorName: actor.name,
      summary: `Sự cố ${incident.code}: ${input.description.trim()}`,
    });
  });
  if (input.collect && fee > 0) {
    await recordIncidentPayment(actor, {
      incidentId: incident.id,
      amountVnd: fee,
      method: input.method ?? 'CASH',
      description: `Phụ phí sự cố ${incident.code}${incident.plate ? ` — ${incident.plate}` : ''}`,
    });
  }
  return incident;
}

export async function resolveIncident(actor: Actor, incidentId: string, resolution: string): Promise<void> {
  assertAction(actor, 'incident.manage');
  const incident = await db.incidents.get(incidentId);
  if (!incident) throw new NotFoundError('Không tìm thấy sự cố.');
  assertRule(incident.status === 'NEW', 'Sự cố này đã được xử lý trước đó.');
  await db.transaction('rw', db.incidents, db.activityLogs, async () => {
    await db.incidents.update(incidentId, {
      status: 'RESOLVED',
      resolvedAt: nowIso(),
      handledById: actor.employeeId,
      resolution: resolution.trim() || 'Đã xử lý.',
    });
    await logActivity({
      entityType: 'INCIDENT',
      entityId: incidentId,
      actorName: actor.name,
      summary: `Xử lý sự cố ${incident.code}: ${resolution.trim() || 'đã xử lý'}`,
    });
  });
}
