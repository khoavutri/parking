import { Tag } from 'antd';
import type { StatusMeta } from '../utils/status';
import {
  INCIDENT_STATUS_META,
  INCIDENT_TYPE_META,
  PAYMENT_METHOD_LABEL,
  SESSION_STATUS_META,
  SHIFT_STATUS_META,
  statusMeta,
  subscriptionState,
} from '../utils/status';
import type { IncidentStatus, IncidentType, PaymentMethod, SessionStatus, ShiftStatus, Subscription } from '../types';

const META_BY_KIND = {
  session: SESSION_STATUS_META,
  incidentType: INCIDENT_TYPE_META,
  incidentStatus: INCIDENT_STATUS_META,
  shift: SHIFT_STATUS_META,
} as const;

export function StatusTag({ kind, status, prefix }: { kind: keyof typeof META_BY_KIND; status?: string | null; prefix?: string }) {
  const meta: StatusMeta = statusMeta(META_BY_KIND[kind], status);
  return (
    <Tag color={meta.color} style={{ marginInlineEnd: 0 }}>
      {prefix ? `${prefix}: ` : ''}
      {meta.label}
    </Tag>
  );
}

export function SessionStatusTag({ status }: { status: SessionStatus }) {
  return <StatusTag kind="session" status={status} />;
}

export function IncidentTypeTag({ type }: { type: IncidentType }) {
  return <StatusTag kind="incidentType" status={type} />;
}

export function IncidentStatusTag({ status }: { status: IncidentStatus }) {
  return <StatusTag kind="incidentStatus" status={status} />;
}

export function ShiftStatusTag({ status }: { status: ShiftStatus }) {
  return <StatusTag kind="shift" status={status} />;
}

export function SubscriptionStatusTag({ subscription }: { subscription: Pick<Subscription, 'status' | 'endDate'> }) {
  const state = subscriptionState(subscription);
  return (
    <Tag color={state.meta.color} style={{ marginInlineEnd: 0 }}>
      {state.meta.label}
    </Tag>
  );
}

export function PaymentMethodTag({ method }: { method: PaymentMethod }) {
  const color = method === 'CASH' ? 'green' : method === 'TRANSFER' ? 'blue' : 'purple';
  return (
    <Tag color={color} style={{ marginInlineEnd: 0 }}>
      {PAYMENT_METHOD_LABEL[method]}
    </Tag>
  );
}
