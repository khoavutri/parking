/** Vai trò sử dụng ứng dụng */
export type RoleId = 'MANAGER' | 'ATTENDANT' | 'CASHIER';

export interface Actor {
  employeeId: string;
  name: string;
  role: RoleId;
}

export interface Employee {
  id: string;
  code: string;
  name: string;
  role: RoleId;
  phone: string;
  active: boolean;
}

export type VehicleType = 'CAR' | 'MOTORBIKE';

export interface Zone {
  id: string;
  code: string;
  name: string;
  vehicleType: VehicleType;
  floor: string;
  active: boolean;
}

export type SlotBaseStatus = 'AVAILABLE' | 'MAINTENANCE';

export interface Slot {
  id: string;
  code: string;
  zoneId: string;
  baseStatus: SlotBaseStatus;
  note?: string;
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  phone: string;
  normalizedPhone: string;
  searchName: string;
  createdAt: string;
  note?: string;
}

export interface Vehicle {
  id: string;
  plate: string;
  normalizedPlate: string;
  vehicleType: VehicleType;
  customerId?: string;
  brandModel?: string;
  color?: string;
  active: boolean;
}

export type SubscriptionPlanId = '1M' | '3M' | '6M' | '12M';
/** ACTIVE | CANCELLED — trạng thái "sắp hết hạn / hết hạn" suy ra từ ngày */
export type SubscriptionStatus = 'ACTIVE' | 'CANCELLED';

export interface Subscription {
  id: string;
  code: string;
  customerId: string;
  vehicleId: string;
  plan: SubscriptionPlanId;
  startDate: string;
  endDate: string;
  priceVnd: number;
  status: SubscriptionStatus;
  createdAt: string;
  note?: string;
}

export type TicketType = 'HOURLY' | 'SUBSCRIPTION';
export type SessionStatus = 'IN' | 'OUT';

export interface ParkingSession {
  id: string;
  code: string;
  plate: string;
  normalizedPlate: string;
  vehicleType: VehicleType;
  zoneId: string;
  slotId: string;
  customerId?: string;
  subscriptionId?: string;
  ticketType: TicketType;
  checkInAt: string;
  checkOutAt?: string;
  status: SessionStatus;
  feeVnd?: number;
  paymentId?: string;
  lostTicket: boolean;
  note?: string;
}

export type PaymentMethod = 'CASH' | 'TRANSFER' | 'CARD';
export type PaymentType = 'SESSION' | 'SUBSCRIPTION' | 'INCIDENT';

export interface Payment {
  id: string;
  code: string;
  type: PaymentType;
  sessionId?: string;
  subscriptionId?: string;
  incidentId?: string;
  description: string;
  amountVnd: number;
  method: PaymentMethod;
  at: string;
  cashierId?: string;
  shiftId?: string;
  note?: string;
}

export type ShiftStatus = 'OPEN' | 'CLOSED';

export interface Shift {
  id: string;
  code: string;
  employeeId: string;
  openedAt: string;
  closedAt?: string;
  openingCashVnd: number;
  countedCashVnd?: number;
  status: ShiftStatus;
  note?: string;
}

export type IncidentType = 'LOST_TICKET' | 'OVERSTAY' | 'COLLISION' | 'EQUIPMENT' | 'OTHER';
export type IncidentStatus = 'NEW' | 'RESOLVED';

export interface Incident {
  id: string;
  code: string;
  sessionId?: string;
  plate?: string;
  type: IncidentType;
  description: string;
  feeVnd?: number;
  status: IncidentStatus;
  createdAt: string;
  resolvedAt?: string;
  handledById?: string;
  resolution?: string;
}

export interface ActivityLog {
  id: string;
  at: string;
  actorName: string;
  summary: string;
  entityType: string;
  entityId: string;
}

export interface OperationReceipt {
  id: string;
  operationType: string;
  resultEntityIds: string[];
  completedAt: string;
  summary?: string;
}

export interface SettingRecord {
  key: string;
  value: unknown;
  updatedAt?: string;
}

export interface AppMetaRecord {
  key: string;
  value: unknown;
}

export interface DocumentSequence {
  id: string;
  documentType: string;
  period: string;
  nextValue: number;
}

// ---------- Cấu hình bảng giá ----------

export interface VehiclePricing {
  freeMinutes: number;
  firstRateVnd: number;
  firstRateHours: number;
  extraPerHourVnd: number;
  dayCapVnd: number;
}

export interface PricingConfig {
  car: VehiclePricing;
  motorbike: VehiclePricing;
  lostTicket: Record<VehicleType, number>;
}

export interface SubscriptionPlanDef {
  id: SubscriptionPlanId;
  name: string;
  months: number;
  price: Record<VehicleType, number>;
}

export interface ParkingInfo {
  name: string;
  address: string;
  phone: string;
  openTime: string;
  closeTime: string;
  slogan?: string;
}

export interface AiConfig {
  autoPlateEnabled: boolean;
  confidenceThreshold: number;
}

export interface PrintConfig {
  ticketFooter?: string;
  receiptFooter?: string;
}

/** Kết quả tính phí một phiên gửi xe */
export interface FeeBreakdown {
  minutes: number;
  hours: number;
  isFree: boolean;
  baseVnd: number;
  extraHours: number;
  extraVnd: number;
  rawVnd: number;
  capVnd: number;
  totalVnd: number;
}
