/** Bỏ dấu tiếng Việt và chuẩn hóa chữ thường để tìm kiếm */
export function normalizeText(input?: string | null): string {
  if (!input) return '';
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/** Chuẩn hóa biển số: bỏ khoảng trắng, dấu chấm, gạch; giữ chữ và số, viết hoa */
export function normalizePlate(input?: string | null): string {
  if (!input) return '';
  return input
    .toUpperCase()
    .replace(/[\s.\-_]/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

/** Hiển thị biển số đã nhập (giữ nguyên cách nhập đã trim) */
export function displayPlate(input?: string | null): string {
  if (!input) return '—';
  return input.trim().toUpperCase();
}

/** Chuẩn hóa số điện thoại: chỉ giữ chữ số, +84 -> 0 */
export function normalizePhone(input?: string | null): string {
  if (!input) return '';
  let digits = input.replace(/[^\d+]/g, '');
  if (digits.startsWith('+84')) digits = '0' + digits.slice(3);
  return digits.replace(/\D/g, '');
}

export function isValidPhone(phone: string): boolean {
  const n = normalizePhone(phone);
  return n.length >= 9 && n.length <= 11;
}

export function buildSearchName(name: string): string {
  return normalizeText(name);
}

export function matchesSearch(haystack: Array<string | undefined | null>, keyword: string): boolean {
  const kw = normalizeText(keyword);
  if (!kw) return true;
  const kwPlate = normalizePlate(keyword);
  return haystack.some((v) => {
    if (!v) return false;
    const text = normalizeText(v);
    if (text.includes(kw)) return true;
    const platelike = normalizePlate(v);
    return kwPlate.length > 0 && platelike.includes(kwPlate);
  });
}

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Phỏng đoán loại xe theo dạng biển số: dạng "29-B2 456.78" nghiêng về xe máy */
export function guessVehicleType(plate: string): 'CAR' | 'MOTORBIKE' {
  const s = plate.toUpperCase().trim();
  if (/^\d{2}\s*-\s*[A-Z]\d/.test(s)) return 'MOTORBIKE';
  return 'CAR';
}
