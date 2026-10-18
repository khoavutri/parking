import type { Actor, RoleId } from '../types';
import { PermissionError } from './errors';

export type Action =
  | 'session.checkin'
  | 'session.checkout'
  | 'session.move'
  | 'session.note'
  | 'subscription.manage'
  | 'incident.manage'
  | 'shift.manage'
  | 'pricing.manage'
  | 'customer.manage'
  | 'settings.manage'
  | 'backup.manage'
  | 'data.reset';

const ROLE_ACTIONS: Record<RoleId, Action[] | 'ALL'> = {
  MANAGER: 'ALL',
  ATTENDANT: ['session.checkin', 'session.checkout', 'session.move', 'session.note', 'incident.manage'],
  CASHIER: ['session.checkout', 'subscription.manage', 'shift.manage', 'incident.manage', 'customer.manage'],
};

export const ACTION_LABEL: Record<Action, string> = {
  'session.checkin': 'cho xe vào',
  'session.checkout': 'cho xe ra / thu phí',
  'session.move': 'chuyển chỗ đỗ',
  'session.note': 'ghi chú phiên gửi xe',
  'subscription.manage': 'quản lý vé tháng',
  'incident.manage': 'xử lý sự cố',
  'shift.manage': 'mở/đóng ca trực',
  'pricing.manage': 'thay đổi bảng giá',
  'customer.manage': 'quản lý khách hàng',
  'settings.manage': 'thay đổi thiết lập',
  'backup.manage': 'sao lưu / khôi phục dữ liệu',
  'data.reset': 'khôi phục dữ liệu mẫu',
};

export function can(role: RoleId, action: Action): boolean {
  const allowed = ROLE_ACTIONS[role];
  if (allowed === 'ALL') return true;
  return allowed.includes(action);
}

export function assertPermission(role: RoleId, action: Action, message?: string): void {
  if (!can(role, action)) {
    throw new PermissionError(message ?? `Vai trò hiện tại không được phép ${ACTION_LABEL[action]}. Hãy chuyển vai trò phù hợp ở góc phải trên.`);
  }
}

export function assertAction(actor: Actor, action: Action, message?: string): void {
  assertPermission(actor.role, action, message);
}

export const DEFAULT_PAGE_BY_ROLE: Record<RoleId, string> = {
  MANAGER: '/dashboard',
  ATTENDANT: '/gate',
  CASHIER: '/cashier',
};

export function canViewRoute(role: RoleId, pathname: string): boolean {
  const rules: Array<{ prefix: string; roles: RoleId[] }> = [
    { prefix: '/dashboard', roles: ['MANAGER', 'ATTENDANT', 'CASHIER'] },
    { prefix: '/gate', roles: ['MANAGER', 'ATTENDANT', 'CASHIER'] },
    { prefix: '/sessions', roles: ['MANAGER', 'ATTENDANT', 'CASHIER'] },
    { prefix: '/map', roles: ['MANAGER', 'ATTENDANT', 'CASHIER'] },
    { prefix: '/incidents', roles: ['MANAGER', 'ATTENDANT', 'CASHIER'] },
    { prefix: '/customers', roles: ['MANAGER', 'CASHIER'] },
    { prefix: '/subscriptions', roles: ['MANAGER', 'CASHIER'] },
    { prefix: '/cashier', roles: ['MANAGER', 'CASHIER'] },
    { prefix: '/reports', roles: ['MANAGER'] },
    { prefix: '/pricing', roles: ['MANAGER'] },
    { prefix: '/settings', roles: ['MANAGER'] },
  ];
  const rule = rules.find((r) => pathname.startsWith(r.prefix));
  if (!rule) return true;
  return rule.roles.includes(role);
}
