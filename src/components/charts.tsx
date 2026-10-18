import { Tooltip } from 'antd';
import type { ReactNode } from 'react';
import styles from './charts.module.scss';

export interface BarItem {
  label: string;
  value: number;
  value2?: number;
  tooltip?: ReactNode;
  color?: string;
  color2?: string;
  sub?: string;
}

/**
 * Biểu đồ cột nhỏ tự vẽ bằng div — không cần thư viện chart.
 * Hỗ trợ 1 hoặc 2 chuỗi (xếp chồng) cho mỗi cột.
 */
export function MiniBarChart({
  items,
  height = 120,
  formatValue,
  defaultColor = '#0f766e',
  defaultColor2 = '#5eead4',
  legend,
}: {
  items: BarItem[];
  height?: number;
  formatValue?: (value: number) => string;
  defaultColor?: string;
  defaultColor2?: string;
  legend?: Array<{ label: string; color: string }>;
}) {
  const max = Math.max(1, ...items.map((i) => i.value + (i.value2 ?? 0)));
  const fmt = formatValue ?? ((v: number) => v.toLocaleString('vi-VN'));
  return (
    <div>
      <div className={styles.bars} style={{ height }}>
        {items.map((item) => {
          const total = item.value + (item.value2 ?? 0);
          const h = Math.max(total > 0 ? 6 : 2, Math.round((total / max) * 100));
          const h1 = total > 0 ? Math.round((h * item.value) / total) : h;
          const h2 = h - h1;
          return (
            <Tooltip
              key={item.label}
              title={
                item.tooltip ?? (
                  <span>
                    {item.label}: <strong>{fmt(item.value)}</strong>
                    {item.value2 != null ? (
                      <>
                        {' '}
                        · <strong>{fmt(item.value2)}</strong>
                      </>
                    ) : null}
                  </span>
                )
              }
            >
              <div className={styles.barCol}>
                <div className={styles.barStack} style={{ height: `${h}%` }}>
                  {h2 > 0 ? <div style={{ height: `${h2}%`, background: item.color2 ?? defaultColor2 }} /> : null}
                  <div style={{ height: `${h1}%`, background: item.color ?? defaultColor }} />
                </div>
                <div className={styles.barLabel}>{item.label}</div>
                {item.sub ? <div className={styles.barSub}>{item.sub}</div> : null}
              </div>
            </Tooltip>
          );
        })}
      </div>
      {legend ? (
        <div className={styles.legend}>
          {legend.map((l) => (
            <span key={l.label}>
              <i style={{ background: l.color }} /> {l.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Thanh tiến trình ngang dùng cho cơ cấu doanh thu, tỷ lệ lấp đầy... */
export function RatioBar({ label, value, total, color = '#0f766e', suffix }: { label: string; value: number; total: number; color?: string; suffix?: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className={styles.ratioRow}>
      <div className={styles.ratioLabel}>{label}</div>
      <div className={styles.ratioTrack}>
        <div className={styles.ratioFill} style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className={styles.ratioValue}>{suffix ?? `${pct}%`}</div>
    </div>
  );
}
