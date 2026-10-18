import { useMemo, useState } from 'react';
import { Button, Card, DatePicker, Input, Segmented, Select, Space, Table, Tag, Typography } from 'antd';
import { CarOutlined, ExportOutlined, LoginOutlined, LogoutOutlined, WarningOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs, { type Dayjs } from 'dayjs';
import { db } from '../../db/database';
import { computeFee } from '../../services/parking';
import { DEFAULT_PRICING, getSetting, SETTING_KEYS } from '../../services/settings';
import { PaymentMethodTag } from '../../components/StatusTag';
import { PAYMENT_METHOD_LABEL, VEHICLE_TYPE_LABEL } from '../../utils/status';
import { formatDateTime, formatDuration } from '../../utils/format';
import { formatMoney } from '../../utils/money';
import { matchesSearch, normalizeText } from '../../utils/text';
import { exportCsv } from '../../utils/csv';
import type { ParkingSession, Payment, VehicleType } from '../../types';

const { RangePicker } = DatePicker;

type TabKey = 'active' | 'history';

const OVERSTAY_HOURS = 24;

export function SessionsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab: TabKey = params.get('tab') === 'history' ? 'history' : 'active';
  const overstayOnly = params.get('overstay') === '1';
  const [keyword, setKeyword] = useState(params.get('q') ?? '');
  const [vehicleFilter, setVehicleFilter] = useState<VehicleType | 'ALL'>('ALL');
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(6, 'day'), dayjs()]);

  const sessions = useLiveQuery(() => db.sessions.toArray(), [], []);
  const slots = useLiveQuery(() => db.slots.toArray(), [], []);
  const zones = useLiveQuery(() => db.zones.toArray(), [], []);
  const payments = useLiveQuery(() => db.payments.toArray(), [], []);
  const employees = useLiveQuery(() => db.employees.toArray(), [], []);
  const pricing = useLiveQuery(() => getSetting(SETTING_KEYS.PRICING, DEFAULT_PRICING), [], DEFAULT_PRICING);

  const slotById = useMemo(() => new Map(slots.map((s) => [s.id, s])), [slots]);
  const zoneById = useMemo(() => new Map(zones.map((z) => [z.id, z])), [zones]);
  const paymentById = useMemo(() => new Map(payments.map((p) => [p.id, p])), [payments]);
  const employeeById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const summary = useMemo(() => {
    const active = sessions.filter((s) => s.status === 'IN');
    const overstay = active.filter((s) => dayjs().diff(dayjs(s.checkInAt), 'hour') >= OVERSTAY_HOURS).length;
    const todayOut = sessions.filter((s) => s.checkOutAt && dayjs(s.checkOutAt).isSame(dayjs(), 'day')).length;
    const todayIn = sessions.filter((s) => dayjs(s.checkInAt).isSame(dayjs(), 'day')).length;
    return { active: active.length, overstay, todayIn, todayOut };
  }, [sessions]);

  const activeRows = useMemo(() => {
    const rows = sessions
      .filter((s) => s.status === 'IN')
      .filter((s) => (vehicleFilter === 'ALL' ? true : s.vehicleType === vehicleFilter))
      .filter((s) => (overstayOnly ? dayjs().diff(dayjs(s.checkInAt), 'hour') >= OVERSTAY_HOURS : true))
      .filter((s) => matchesSearch([s.plate, s.code, slotById.get(s.slotId)?.code], keyword));
    return rows.sort((a, b) => (a.checkInAt < b.checkInAt ? 1 : -1));
  }, [sessions, vehicleFilter, overstayOnly, keyword, slotById]);

  const historyRows = useMemo(() => {
    const kw = normalizeText(keyword);
    return sessions
      .filter((s) => s.status === 'OUT')
      .filter((s) => s.checkOutAt && dayjs(s.checkOutAt).isAfter(range[0].startOf('day')) && dayjs(s.checkOutAt).isBefore(range[1].endOf('day')))
      .filter((s) => (vehicleFilter === 'ALL' ? true : s.vehicleType === vehicleFilter))
      .filter((s) => !kw || normalizeText(s.plate).includes(kw) || normalizeText(s.code).includes(kw))
      .sort((a, b) => ((a.checkOutAt ?? '') < (b.checkOutAt ?? '') ? 1 : -1));
  }, [sessions, range, vehicleFilter, keyword]);

  const setTab = (next: TabKey) => {
    const p = new URLSearchParams(params);
    if (next === 'history') p.set('tab', 'history');
    else p.delete('tab');
    if (p.get('overstay')) p.delete('overstay');
    setParams(p, { replace: true });
  };

  const exportHistory = () => {
    exportCsv(
      `phien-gui-xe-${dayjs().format('YYYYMMDD')}.csv`,
      ['Mã phiếu', 'Biển số', 'Loại xe', 'Chỗ', 'Giờ vào', 'Giờ ra', 'Thời lượng (phút)', 'Phí (VND)', 'Hình thức', 'Thu ngân'],
      historyRows.map((s) => {
        const payment = s.paymentId ? paymentById.get(s.paymentId) : undefined;
        return [
          s.code,
          s.plate,
          VEHICLE_TYPE_LABEL[s.vehicleType],
          slotById.get(s.slotId)?.code ?? '',
          formatDateTime(s.checkInAt),
          formatDateTime(s.checkOutAt),
          s.feeVnd ?? 0,
          payment ? PAYMENT_METHOD_LABEL[payment.method] : 'Không thu phí',
          payment?.cashierId ? employeeById.get(payment.cashierId)?.name ?? '' : '',
        ];
      }),
    );
  };

  return (
    <div>
      <div className="page-toolbar" style={{ justifyContent: 'space-between' }}>
        <Segmented<TabKey>
          value={tab}
          onChange={(v) => setTab(v)}
          options={[
            { value: 'active', label: <span><CarOutlined /> &nbsp;Đang gửi ({summary.active})</span> },
            { value: 'history', label: <span><LogoutOutlined /> &nbsp;Lịch sử</span> },
          ]}
        />
        <Space>
          {summary.todayIn > 0 ? <Tag color="cyan" icon={<LoginOutlined />}>Vào hôm nay: {summary.todayIn}</Tag> : null}
          {summary.todayOut > 0 ? <Tag color="green">Ra hôm nay: {summary.todayOut}</Tag> : null}
          {summary.overstay > 0 ? <Tag color="red" icon={<WarningOutlined />}>Quá 24h: {summary.overstay}</Tag> : null}
        </Space>
      </div>

      <div className="page-toolbar">
        <Input.Search
          placeholder="Tìm biển số, mã phiếu, mã chỗ..."
          style={{ width: 260 }}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          allowClear
        />
        <Select<VehicleType | 'ALL'>
          value={vehicleFilter}
          onChange={(v) => setVehicleFilter(v)}
          options={[
            { value: 'ALL', label: 'Tất cả loại xe' },
            { value: 'CAR', label: 'Ô tô' },
            { value: 'MOTORBIKE', label: 'Xe máy' },
          ]}
          style={{ width: 170 }}
        />
        {tab === 'active' ? (
          <Button type={overstayOnly ? 'primary' : 'default'} danger={overstayOnly} onClick={() => {
            const p = new URLSearchParams(params);
            if (overstayOnly) p.delete('overstay');
            else p.set('overstay', '1');
            setParams(p, { replace: true });
          }}>
            Chỉ xe quá 24h
          </Button>
        ) : (
          <>
            <RangePicker
              value={range}
              onChange={(values) => {
                if (values?.[0] && values[1]) setRange([values[0], values[1]]);
              }}
              format="DD/MM/YYYY"
              allowClear={false}
            />
            <Button icon={<ExportOutlined />} onClick={exportHistory}>
              Xuất CSV
            </Button>
          </>
        )}
        <Typography.Text type="secondary">
          {tab === 'active' ? `${activeRows.length} phiên đang gửi` : `${historyRows.length} phiên trong khoảng chọn`}
        </Typography.Text>
      </div>

      <Card size="small">
        {tab === 'active' ? (
          <Table<ParkingSession>
            rowKey="id"
            dataSource={activeRows}
            pagination={{ pageSize: 12, showSizeChanger: false }}
            columns={[
              {
                title: 'Biển số',
                dataIndex: 'plate',
                render: (plate: string, row) => (
                  <div>
                    <div className="text-strong">{plate}</div>
                    <div className="text-muted" style={{ fontSize: 11.5 }}>
                      {row.code}
                    </div>
                  </div>
                ),
              },
              { title: 'Loại xe', render: (_, row) => VEHICLE_TYPE_LABEL[row.vehicleType], width: 90 },
              {
                title: 'Chỗ đỗ',
                width: 110,
                render: (_, row) => (
                  <span>
                    <strong>{slotById.get(row.slotId)?.code ?? '—'}</strong>
                    <div className="text-muted" style={{ fontSize: 11.5 }}>
                      {zoneById.get(row.zoneId) ? `Khu ${zoneById.get(row.zoneId)!.code}` : ''}
                    </div>
                  </span>
                ),
              },
              { title: 'Giờ vào', render: (_, row) => formatDateTime(row.checkInAt), width: 140 },
              {
                title: 'Thời gian gửi',
                width: 130,
                render: (_, row) => {
                  const over = dayjs().diff(dayjs(row.checkInAt), 'hour') >= OVERSTAY_HOURS;
                  return (
                    <span style={over ? { color: '#d64545', fontWeight: 600 } : undefined}>
                      {formatDuration(row.checkInAt, new Date().toISOString())}
                      {over ? ' ⚠' : ''}
                    </span>
                  );
                },
              },
              {
                title: 'Hình thức',
                width: 100,
                render: (_, row) => (row.ticketType === 'SUBSCRIPTION' ? <Tag color="green">Vé tháng</Tag> : <Tag>Vé lượt</Tag>),
              },
              {
                title: 'Phí tạm tính',
                width: 120,
                render: (_, row) => {
                  if (row.ticketType === 'SUBSCRIPTION') return <span className="text-muted">Miễn phí</span>;
                  const fee = computeFee(row.checkInAt, new Date().toISOString(), row.vehicleType, pricing);
                  return <span className="text-strong">{formatMoney(fee.totalVnd)}</span>;
                },
              },
              {
                title: '',
                width: 96,
                render: (_, row) => (
                  <Button type="link" size="small" onClick={() => navigate(`/gate?tab=out&plate=${encodeURIComponent(row.plate)}`)}>
                    Cho ra
                  </Button>
                ),
              },
            ]}
          />
        ) : (
          <Table<ParkingSession>
            rowKey="id"
            dataSource={historyRows}
            pagination={{ pageSize: 15, showSizeChanger: false }}
            columns={[
              {
                title: 'Biển số',
                render: (_, row) => (
                  <div>
                    <div className="text-strong">{row.plate}</div>
                    <div className="text-muted" style={{ fontSize: 11.5 }}>
                      {row.code}
                    </div>
                  </div>
                ),
              },
              { title: 'Loại xe', render: (_, row) => VEHICLE_TYPE_LABEL[row.vehicleType], width: 86 },
              { title: 'Chỗ', width: 64, render: (_, row) => slotById.get(row.slotId)?.code ?? '—' },
              { title: 'Vào', render: (_, row) => formatDateTime(row.checkInAt), width: 138 },
              { title: 'Ra', render: (_, row) => formatDateTime(row.checkOutAt), width: 138 },
              { title: 'Thời lượng', width: 100, render: (_, row) => formatDuration(row.checkInAt, row.checkOutAt) },
              {
                title: 'Phí',
                width: 110,
                render: (_, row) => <span className="text-strong">{formatMoney(row.feeVnd ?? 0)}</span>,
              },
              {
                title: 'Thanh toán',
                width: 120,
                render: (_, row) => {
                  const payment = row.paymentId ? paymentById.get(row.paymentId) : undefined;
                  return payment ? <PaymentMethodTag method={payment.method} /> : <span className="text-muted">Không thu</span>;
                },
              },
              {
                title: 'Ghi chú',
                render: (_, row) => {
                  const payment: Payment | undefined = row.paymentId ? paymentById.get(row.paymentId) : undefined;
                  return (
                    <span className="text-muted" style={{ fontSize: 12 }}>
                      {row.lostTicket ? 'Mất vé · ' : ''}
                      {payment?.cashierId ? employeeById.get(payment.cashierId)?.name : ''}
                    </span>
                  );
                },
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
