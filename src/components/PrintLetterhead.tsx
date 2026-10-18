import { useLiveQuery } from 'dexie-react-hooks';
import type { ReactNode } from 'react';
import { DEFAULT_PARKING_INFO, getSetting, SETTING_KEYS, type ParkingInfo } from '../services/settings';

/** Khối tiêu đề mẫu in: tên bãi, địa chỉ, liên hệ và phần bên phải (mã chứng từ, ngày) */
export function PrintLetterhead({ right }: { right?: ReactNode }) {
  const info = useLiveQuery(() => getSetting<ParkingInfo>(SETTING_KEYS.PARKING_INFO, DEFAULT_PARKING_INFO), [], DEFAULT_PARKING_INFO);
  return (
    <div className="print-header">
      <div>
        <strong>{info.name}</strong>
        <div>{info.address}</div>
        <div>
          ĐT: {info.phone} · Giờ hoạt động: {info.openTime}–{info.closeTime}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>{right}</div>
    </div>
  );
}
