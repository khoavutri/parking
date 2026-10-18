import dayjs from 'dayjs';

export const DATE_FORMAT = 'DD/MM/YYYY';
export const DATETIME_FORMAT = 'DD/MM/YYYY HH:mm';
export const TIME_FORMAT = 'HH:mm';
export const DATE_KEY_FORMAT = 'YYYY-MM-DD';

export function nowIso(): string {
  return new Date().toISOString();
}

export function todayKey(): string {
  return dayjs().format(DATE_KEY_FORMAT);
}

export function toDateKey(value: string | Date | dayjs.Dayjs): string {
  return dayjs(value).format(DATE_KEY_FORMAT);
}

export function formatDate(value?: string | Date | null): string {
  if (!value) return '—';
  const d = dayjs(value);
  return d.isValid() ? d.format(DATE_FORMAT) : '—';
}

export function formatDateTime(value?: string | Date | null): string {
  if (!value) return '—';
  const d = dayjs(value);
  return d.isValid() ? d.format(DATETIME_FORMAT) : '—';
}

export function formatTime(value?: string | null): string {
  if (!value) return '—';
  const d = dayjs(value);
  return d.isValid() ? d.format(TIME_FORMAT) : '—';
}

/** Khoảng [đầu ngày, cuối ngày] của một ngày (theo giờ local) */
export function dayRange(date: string | Date | dayjs.Dayjs): [string, string] {
  const d = dayjs(date);
  return [d.startOf('day').toISOString(), d.endOf('day').toISOString()];
}

export function startOfDayIso(date: string | Date | dayjs.Dayjs): string {
  return dayjs(date).startOf('day').toISOString();
}

export function endOfDayIso(date: string | Date | dayjs.Dayjs): string {
  return dayjs(date).endOf('day').toISOString();
}

/** Định dạng thời lượng từ số phút */
export function formatMinutes(minutes?: number | null): string {
  if (minutes == null) return '—';
  if (minutes < 60) return `${minutes} phút`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} giờ ${m} phút` : `${h} giờ`;
}

/** Định dạng thời lượng từ hai mốc thời gian, hiển thị ngắn gọn (2g 15p) */
export function formatDuration(from?: string | null, to?: string | null): string {
  if (!from) return '—';
  const end = to ? dayjs(to) : dayjs();
  const minutes = Math.max(0, end.diff(dayjs(from), 'minute'));
  if (minutes < 60) return `${minutes} phút`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}g ${m}p` : `${h} giờ`;
}

export function isOverdue(value?: string | null, ref: dayjs.Dayjs = dayjs()): boolean {
  if (!value) return false;
  return dayjs(value).isBefore(ref);
}

export function isSameDay(a?: string | null, b?: string | Date): boolean {
  if (!a) return false;
  return dayjs(a).isSame(dayjs(b), 'day');
}

/** Định dạng dung lượng byte cho phần thiết lập lưu trữ */
export function formatBytes(bytes?: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
