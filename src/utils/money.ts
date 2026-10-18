export function roundVnd(value: number): number {
  return Math.round(value);
}

export function formatMoney(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(Math.round(value));
  return `${sign}${abs.toLocaleString('vi-VN')} ₫`;
}

export function formatMoneyShort(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toLocaleString('vi-VN', { maximumFractionDigits: 0 })} nghìn`;
  return formatMoney(value);
}

/** Đọc chuỗi người dùng nhập (có thể chứa dấu chấm, phẩy) thành số VND */
export function parseMoneyInput(input?: string | number | null): number | undefined {
  if (input == null || input === '') return undefined;
  if (typeof input === 'number') return Math.round(input);
  const cleaned = input.replace(/[^\d-]/g, '');
  if (!cleaned || cleaned === '-') return undefined;
  const n = Number(cleaned);
  return Number.isNaN(n) ? undefined : Math.round(n);
}

export function formatQuantity(value?: number | null, maxFractionDigits = 3): string {
  if (value == null || Number.isNaN(value)) return '—';
  return value.toLocaleString('vi-VN', { maximumFractionDigits: maxFractionDigits });
}
