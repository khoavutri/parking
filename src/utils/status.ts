import type {
  IncidentStatus,
  IncidentType,
  PaymentMethod,
  PaymentType,
  RoleId,
  SessionStatus,
  ShiftStatus,
  SubscriptionStatus,
  TicketType,
  VehicleType,
} from '../types';

export interface StatusMeta {
  label: string;
  color: string;
}

export function statusMeta(map: Record<string, StatusMeta>, key?: string | null): StatusMeta {
  if (!key) return { label: '—', color: 'default' };
  return map[key] ?? { label: key, color: 'default' };
}

export const ROLE_LABEL: Record<RoleId, string> = {
  MANAGER: 'Quản lý bãi',
  ATTENDANT: 'Nhân viên bãi',
  CASHIER: 'Thu ngân',
};

export const VEHICLE_TYPE_LABEL: Record<VehicleType, string> = {
  CAR: 'Ô tô',
  MOTORBIKE: 'Xe máy',
};

export const TICKET_TYPE_LABEL: Record<TicketType, string> = {
  HOURLY: 'Vé lượt',
  SUBSCRIPTION: 'Vé tháng',
};

export const SESSION_STATUS_META: Record<SessionStatus, StatusMeta> = {
  IN: { label: 'Đang gửi', color: 'blue' },
  OUT: { label: 'Đã ra', color: 'green' },
};

export const SUBSCRIPTION_STATUS_META: Record<SubscriptionStatus, StatusMeta> = {
  ACTIVE: { label: 'Hiệu lực', color: 'green' },
  CANCELLED: { label: 'Đã huỷ', color: 'default' },
};

export const PAYMENT_TYPE_LABEL: Record<PaymentType, string> = {
  SESSION: 'Phiên gửi xe',
  SUBSCRIPTION: 'Vé tháng',
  INCIDENT: 'Phụ phí',
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Tiền mặt',
  TRANSFER: 'Chuyển khoản',
  CARD: 'Thẻ',
};

export const INCIDENT_TYPE_META: Record<IncidentType, StatusMeta> = {
  LOST_TICKET: { label: 'Mất vé', color: 'red' },
  OVERSTAY: { label: 'Quá hạn', color: 'orange' },
  COLLISION: { label: 'Va chạm', color: 'volcano' },
  EQUIPMENT: { label: 'Thiết bị', color: 'purple' },
  OTHER: { label: 'Khác', color: 'default' },
};

export const INCIDENT_STATUS_META: Record<IncidentStatus, StatusMeta> = {
  NEW: { label: 'Mới', color: 'red' },
  RESOLVED: { label: 'Đã xử lý', color: 'green' },
};

export const SHIFT_STATUS_META: Record<ShiftStatus, StatusMeta> = {
  OPEN: { label: 'Đang mở', color: 'blue' },
  CLOSED: { label: 'Đã đóng', color: 'default' },
};

/** Trạng thái vé tháng suy ra từ ngày hiệu lực */
export function subscriptionState(sub: { status: SubscriptionStatus; endDate: string }): { key: string; meta: StatusMeta; daysLeft: number } {
  const end = new Date(sub.endDate).getTime();
  const daysLeft = Math.ceil((end - Date.now()) / 86_400_000);
  if (sub.status === 'CANCELLED') return { key: 'CANCELLED', meta: SUBSCRIPTION_STATUS_META.CANCELLED, daysLeft };
  if (daysLeft < 0) return { key: 'EXPIRED', meta: { label: 'Hết hạn', color: 'red' }, daysLeft };
  if (daysLeft <= 7) return { key: 'EXPIRING', meta: { label: 'Sắp hết hạn', color: 'orange' }, daysLeft };
  return { key: 'ACTIVE', meta: SUBSCRIPTION_STATUS_META.ACTIVE, daysLeft };
}

export const PLAN_LABEL: Record<string, string> = {
  '1M': '1 tháng',
  '3M': '3 tháng',
  '6M': '6 tháng',
  '12M': '12 tháng',
};
