import { useMemo, useState } from 'react';
import { Button, Card, Segmented, Select, Space, Statistic, Table, Typography } from 'antd';
import { ExportOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs from 'dayjs';
import { db } from '../../db/database';
import { getFlowStats, getRevenueByDay, getSubscriptionStats } from '../../repositories/reports';
import { MiniBarChart, RatioBar } from '../../components/charts';
import { formatMoney } from '../../utils/money';
import { exportCsv } from '../../utils/csv';

type TabKey = 'revenue' | 'flow' | 'customers';

export function ReportsPage() {
  const [tab, setTab] = useState<TabKey>('revenue');
  const [days, setDays] = useState<number>(30);

  const revenueRows = useLiveQuery(() => getRevenueByDay(days), [days], []);
  const flow = useLiveQuery(() => getFlowStats(days), [days]);
  const subs = useLiveQuery(() => getSubscriptionStats(), []);
  const payments = useLiveQuery(() => db.payments.toArray(), [], []);

  const totals = useMemo(() => {
    const start = dayjs().subtract(days - 1, 'day').startOf('day');
    const rows = payments.filter((p) => dayjs(p.at).isAfter(start));
    return {
      sessionVnd: rows.filter((p) => p.type === 'SESSION').reduce((s, p) => s + p.amountVnd, 0),
      subscriptionVnd: rows.filter((p) => p.type === 'SUBSCRIPTION').reduce((s, p) => s + p.amountVnd, 0),
      incidentVnd: rows.filter((p) => p.type === 'INCIDENT').reduce((s, p) => s + p.amountVnd, 0),
      all: rows.reduce((s, p) => s + p.amountVnd, 0),
    };
  }, [payments, days]);

  const bestDay = useMemo(() => revenueRows.reduce((best, row) => (row.totalVnd > best.totalVnd ? row : best), revenueRows[0] ?? { label: '—', totalVnd: 0 }), [revenueRows]);

  return (
    <div>
      <div className="page-toolbar" style={{ justifyContent: 'space-between' }}>
        <Segmented<TabKey>
          value={tab}
          onChange={(v) => setTab(v)}
          options={[
            { value: 'revenue', label: 'Doanh thu' },
            { value: 'flow', label: 'Lưu lượng' },
            { value: 'customers', label: 'Khách & vé' },
          ]}
        />
        <Space>
          <Select
            value={days}
            onChange={(v) => setDays(v)}
            options={[
              { value: 7, label: '7 ngày' },
              { value: 14, label: '14 ngày' },
              { value: 30, label: '30 ngày' },
            ]}
            style={{ width: 130 }}
          />
        </Space>
      </div>

      {tab === 'revenue' ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 12 }}>
            <Card size="small">
              <Statistic title={`Tổng doanh thu ${days} ngày`} value={totals.all} formatter={(v) => formatMoney(Number(v))} />
            </Card>
            <Card size="small">
              <Statistic title="Từ vé lượt" value={totals.sessionVnd} formatter={(v) => formatMoney(Number(v))} />
            </Card>
            <Card size="small">
              <Statistic title="Từ vé tháng" value={totals.subscriptionVnd} formatter={(v) => formatMoney(Number(v))} />
            </Card>
            <Card size="small">
              <Statistic title="Phụ phí sự cố" value={totals.incidentVnd} formatter={(v) => formatMoney(Number(v))} />
            </Card>
            <Card size="small">
              <Statistic title="Ngày cao nhất" value={bestDay.totalVnd} formatter={(v) => formatMoney(Number(v))} />
              <div className="text-muted" style={{ fontSize: 12 }}>{bestDay.label}</div>
            </Card>
          </div>

          <Card
            size="small"
            title={`Doanh thu theo ngày (${days} ngày)`}
            style={{ marginBottom: 12 }}
            extra={
              <Button
                size="small"
                icon={<ExportOutlined />}
                onClick={() =>
                  exportCsv(
                    `doanh-thu-${days}ngay.csv`,
                    ['Ngày', 'Vé lượt (VND)', 'Vé tháng (VND)', 'Phụ phí (VND)', 'Tổng (VND)', 'Số giao dịch'],
                    revenueRows.map((r) => [r.label, r.sessionVnd, r.subscriptionVnd, r.incidentVnd, r.totalVnd, r.count]),
                  )
                }
              >
                Xuất CSV
              </Button>
            }
          >
            <MiniBarChart
              items={revenueRows.map((r) => ({ label: r.label, value: r.totalVnd, tooltip: `${r.label}: ${formatMoney(r.totalVnd)}` }))}
              height={140}
              formatValue={(v) => formatMoney(v)}
            />
          </Card>

          <Card size="small" title="Chi tiết theo ngày">
            <Table
              rowKey="key"
              size="small"
              dataSource={revenueRows}
              pagination={{ pageSize: 10, showSizeChanger: false }}
              columns={[
                { title: 'Ngày', dataIndex: 'label', width: 110 },
                { title: 'Vé lượt', width: 130, render: (_, r) => formatMoney(r.sessionVnd) },
                { title: 'Vé tháng', width: 130, render: (_, r) => formatMoney(r.subscriptionVnd) },
                { title: 'Phụ phí', width: 120, render: (_, r) => formatMoney(r.incidentVnd) },
                { title: 'Số giao dịch', width: 110, dataIndex: 'count' },
                { title: 'Tổng', render: (_, r) => <span className="text-strong">{formatMoney(r.totalVnd)}</span> },
              ]}
            />
          </Card>
        </>
      ) : null}

      {tab === 'flow' && flow ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 12 }}>
            <Card size="small">
              <Statistic title={`Lượt vào ${days} ngày`} value={flow.byVehicle.carIn + flow.byVehicle.motoIn} formatter={(v) => `${Number(v).toLocaleString('vi-VN')} lượt`} />
            </Card>
            <Card size="small">
              <Statistic title={`Lượt ra ${days} ngày`} value={flow.byVehicle.carOut + flow.byVehicle.motoOut} formatter={(v) => `${Number(v).toLocaleString('vi-VN')} lượt`} />
            </Card>
            <Card size="small">
              <Statistic title="Ô tô (vào / ra)" value={flow.byVehicle.carIn} suffix={`/ ${flow.byVehicle.carOut}`} />
            </Card>
            <Card size="small">
              <Statistic title="Xe máy (vào / ra)" value={flow.byVehicle.motoIn} suffix={`/ ${flow.byVehicle.motoOut}`} />
            </Card>
            <Card size="small">
              <Statistic title="Giờ cao điểm" value={`${flow.peakHour ?? 0}h`} />
              <div className="text-muted" style={{ fontSize: 12 }}>Theo lượt xe vào</div>
            </Card>
          </div>

          <Card size="small" title={`Lưu lượng theo giờ (tổng hợp ${days} ngày)`} style={{ marginBottom: 12 }}>
            <MiniBarChart
              items={flow.byHour.map((h) => ({
                label: `${h.hour}h`,
                value: h.inCount,
                value2: h.outCount,
                tooltip: (
                  <span>
                    {h.hour}h — vào <strong>{h.inCount}</strong> · ra <strong>{h.outCount}</strong>
                  </span>
                ),
              }))}
              height={140}
              formatValue={(v) => `${v} lượt`}
              legend={[
                { label: 'Xe vào', color: '#0f766e' },
                { label: 'Xe ra', color: '#5eead4' },
              ]}
            />
          </Card>

          <Card size="small" title="Lưu lượng theo ngày trong tuần">
            <MiniBarChart
              items={flow.byWeekday.map((d) => ({
                label: d.label,
                value: d.inCount,
                value2: d.outCount,
                tooltip: (
                  <span>
                    {d.label} — vào <strong>{d.inCount}</strong> · ra <strong>{d.outCount}</strong>
                  </span>
                ),
              }))}
              height={120}
              formatValue={(v) => `${v} lượt`}
              legend={[
                { label: 'Xe vào', color: '#0f766e' },
                { label: 'Xe ra', color: '#5eead4' },
              ]}
            />
          </Card>
        </>
      ) : null}

      {tab === 'customers' && subs ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
            <Card size="small">
              <Statistic title="Vé tháng đang hiệu lực" value={subs.activeCount} formatter={(v) => `${v} vé`} />
            </Card>
            {subs.byPlan.map((p) => (
              <Card size="small" key={p.plan}>
                <Statistic title={`Gói ${p.plan} — đang dùng`} value={p.count} formatter={(v) => `${v} vé`} />
                <div className="text-muted" style={{ fontSize: 12 }}>
                  Doanh thu lũy kế: {formatMoney(p.revenueVnd)}
                </div>
              </Card>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12, alignItems: 'start' }}>
            <Card size="small" title="Doanh thu vé tháng theo tháng" style={{ marginBottom: 12 }}>
              <MiniBarChart
                items={subs.monthlyRevenue.map((m) => ({ label: m.label, value: m.vnd, tooltip: `${m.label}: ${formatMoney(m.vnd)}` }))}
                height={120}
                formatValue={(v) => formatMoney(v)}
                defaultColor="#0ea5e9"
                defaultColor2="#bae6fd"
              />
            </Card>
            <Card size="small" title="Tỷ lệ lấp đầy theo khu" style={{ marginBottom: 12 }}>
              {subs.occupancyByZone.map((z) => (
                <RatioBar
                  key={z.zoneName}
                  label={z.zoneName.replace(' — ', '\n')}
                  value={z.occupied}
                  total={z.total}
                  suffix={`${z.occupied}/${z.total}`}
                />
              ))}
            </Card>
          </div>

          <Card
            size="small"
            title="Top khách hàng theo chi tiêu"
            extra={
              <Button
                size="small"
                icon={<ExportOutlined />}
                onClick={() =>
                  exportCsv(
                    'top-khach-hang.csv',
                    ['Khách hàng', 'Điện thoại', 'Tổng chi tiêu (VND)'],
                    subs.topCustomers.map((c) => [c.name, c.phone, c.totalVnd]),
                  )
                }
              >
                Xuất CSV
              </Button>
            }
          >
            <Table
              rowKey="phone"
              size="small"
              dataSource={subs.topCustomers}
              pagination={false}
              columns={[
                { title: 'Khách hàng', dataIndex: 'name' },
                { title: 'Điện thoại', dataIndex: 'phone', width: 140 },
                { title: 'Tổng chi tiêu', width: 150, render: (_, r) => <span className="text-strong">{formatMoney(r.totalVnd)}</span> },
              ]}
            />
          </Card>
        </>
      ) : null}

      <Typography.Text type="secondary" style={{ display: 'block', marginTop: 12, fontSize: 12.5 }}>
        Số liệu tổng hợp trực tiếp từ dữ liệu đang lưu trên trình duyệt — dùng nút Xuất CSV để mở bằng Excel.
      </Typography.Text>
    </div>
  );
}
