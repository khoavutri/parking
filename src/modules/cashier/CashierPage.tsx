import { useMemo, useState } from 'react';
import { Alert, Button, Card, DatePicker, Input, InputNumber, Modal, Segmented, Select, Space, Statistic, Table, Tag, Typography } from 'antd';
import { ExportOutlined, PlusOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs, { type Dayjs } from 'dayjs';
import { db } from '../../db/database';
import { useRole } from '../../app/RoleContext';
import { useAction } from '../../hooks/useAction';
import { closeShift, getShiftSummary, openShift, type ShiftSummary } from '../../services/finance';
import { PaymentMethodTag, ShiftStatusTag } from '../../components/StatusTag';
import { PAYMENT_METHOD_LABEL, PAYMENT_TYPE_LABEL } from '../../utils/status';
import { formatDateTime } from '../../utils/format';
import { formatMoney } from '../../utils/money';
import { exportCsv } from '../../utils/csv';
import { matchesSearch } from '../../utils/text';
import type { Payment, Shift } from '../../types';

const { RangePicker } = DatePicker;

type TabKey = 'transactions' | 'shifts' | 'recon';

export function CashierPage() {
  const { actor } = useRole();
  const [tab, setTab] = useState<TabKey>('transactions');
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs(), dayjs()]);
  const [keyword, setKeyword] = useState('');
  const [openShiftModal, setOpenShiftModal] = useState(false);
  const [openShiftEmployee, setOpenShiftEmployee] = useState<string | undefined>();
  const [openShiftCash, setOpenShiftCash] = useState<number>(2000000);
  const [closeTarget, setCloseTarget] = useState<Shift | null>(null);
  const [closeSummary, setCloseSummary] = useState<ShiftSummary | null>(null);
  const [countedCash, setCountedCash] = useState<number | null>(null);
  const [reconDate, setReconDate] = useState<Dayjs>(dayjs());

  const { loading: opening, run: runOpen } = useAction();
  const { loading: closing, run: runClose } = useAction();

  const payments = useLiveQuery(() => db.payments.toArray(), [], []);
  const shifts = useLiveQuery(() => db.shifts.orderBy('openedAt').reverse().toArray(), [], []);
  const employees = useLiveQuery(() => db.employees.filter((e) => e.role === 'CASHIER' || e.role === 'MANAGER').toArray(), [], []);

  const employeeById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const shiftById = useMemo(() => new Map(shifts.map((s) => [s.id, s])), [shifts]);

  const rangePayments = useMemo(
    () =>
      payments
        .filter((p) => dayjs(p.at).isAfter(range[0].startOf('day')) && dayjs(p.at).isBefore(range[1].endOf('day')))
        .filter((p) => matchesSearch([p.code, p.description], keyword))
        .sort((a, b) => (a.at < b.at ? 1 : -1)),
    [payments, range, keyword],
  );

  const methodTotals = useMemo(() => {
    const sum = (m: Payment['method']) => rangePayments.filter((p) => p.method === m).reduce((s, p) => s + p.amountVnd, 0);
    return {
      cash: sum('CASH'),
      transfer: sum('TRANSFER'),
      card: sum('CARD'),
      total: rangePayments.reduce((s, p) => s + p.amountVnd, 0),
    };
  }, [rangePayments]);

  const openShifts = shifts.filter((s) => s.status === 'OPEN');

  const shiftRows = useMemo(
    () =>
      shifts.slice(0, 40).map((shift) => {
        const paymentsOfShift = payments.filter((p) => p.shiftId === shift.id);
        const revenue = paymentsOfShift.reduce((s, p) => s + p.amountVnd, 0);
        const cash = paymentsOfShift.filter((p) => p.method === 'CASH').reduce((s, p) => s + p.amountVnd, 0);
        const expectedCash = shift.openingCashVnd + cash;
        const diff = shift.countedCashVnd != null ? shift.countedCashVnd - expectedCash : null;
        return { shift, revenue, count: paymentsOfShift.length, expectedCash, diff };
      }),
    [shifts, payments],
  );

  const reconRows = useMemo(() => {
    const start = reconDate.startOf('day');
    const end = reconDate.endOf('day');
    const shiftsOfDay = shifts.filter((s) => dayjs(s.openedAt).isAfter(start) && dayjs(s.openedAt).isBefore(end));
    return shiftsOfDay
      .map((shift) => {
        const paymentsOfShift = payments.filter((p) => p.shiftId === shift.id);
        const cash = paymentsOfShift.filter((p) => p.method === 'CASH').reduce((s, p) => s + p.amountVnd, 0);
        const transfer = paymentsOfShift.filter((p) => p.method === 'TRANSFER').reduce((s, p) => s + p.amountVnd, 0);
        const card = paymentsOfShift.filter((p) => p.method === 'CARD').reduce((s, p) => s + p.amountVnd, 0);
        const expectedCash = shift.openingCashVnd + cash;
        return {
          shift,
          cash,
          transfer,
          card,
          total: cash + transfer + card,
          expectedCash,
          diff: shift.countedCashVnd != null ? shift.countedCashVnd - expectedCash : null,
        };
      })
      .sort((a, b) => (a.shift.openedAt < b.shift.openedAt ? 1 : -1));
  }, [shifts, payments, reconDate]);

  const openCloseModal = async (shift: Shift) => {
    setCloseTarget(shift);
    setCountedCash(null);
    setCloseSummary(await getShiftSummary(shift.id));
  };

  const submitOpenShift = async () => {
    if (!openShiftEmployee) return;
    await runOpen(() => openShift(actor, { employeeId: openShiftEmployee, openingCashVnd: openShiftCash }), {
      successMessage: 'Đã mở ca trực.',
      onSuccess: () => setOpenShiftModal(false),
    });
  };

  const submitCloseShift = async () => {
    if (!closeTarget) return;
    await runClose(() => closeShift(actor, closeTarget.id, countedCash), {
      successMessage: 'Đã đóng ca trực và ghi nhận đối soát.',
      onSuccess: () => {
        setCloseTarget(null);
        setCloseSummary(null);
      },
    });
  };

  const exportTransactions = () => {
    exportCsv(
      `giao-dich-${range[0].format('YYYYMMDD')}-${range[1].format('YYYYMMDD')}.csv`,
      ['Mã', 'Thời gian', 'Loại', 'Diễn giải', 'Số tiền (VND)', 'Hình thức', 'Thu ngân', 'Ca'],
      rangePayments.map((p) => [
        p.code,
        formatDateTime(p.at),
        PAYMENT_TYPE_LABEL[p.type],
        p.description,
        p.amountVnd,
        PAYMENT_METHOD_LABEL[p.method],
        p.cashierId ? employeeById.get(p.cashierId)?.name ?? '' : '',
        p.shiftId ? shiftById.get(p.shiftId)?.code ?? '' : '',
      ]),
    );
  };

  return (
    <div>
      <div className="page-toolbar" style={{ justifyContent: 'space-between' }}>
        <Segmented<TabKey>
          value={tab}
          onChange={(v) => setTab(v)}
          options={[
            { value: 'transactions', label: 'Giao dịch' },
            { value: 'shifts', label: `Ca trực (${openShifts.length} đang mở)` },
            { value: 'recon', label: 'Đối soát' },
          ]}
        />
        <Space>
          {tab === 'shifts' ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setOpenShiftModal(true); setOpenShiftEmployee(undefined); setOpenShiftCash(2000000); }}>
              Mở ca trực
            </Button>
          ) : null}
        </Space>
      </div>

      {tab === 'transactions' ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
            <Card size="small">
              <Statistic title="Tổng thu trong kỳ" value={methodTotals.total} formatter={(v) => formatMoney(Number(v))} />
            </Card>
            <Card size="small">
              <Statistic title="Tiền mặt" value={methodTotals.cash} formatter={(v) => formatMoney(Number(v))} />
            </Card>
            <Card size="small">
              <Statistic title="Chuyển khoản" value={methodTotals.transfer} formatter={(v) => formatMoney(Number(v))} />
            </Card>
            <Card size="small">
              <Statistic title="Thẻ" value={methodTotals.card} formatter={(v) => formatMoney(Number(v))} />
            </Card>
          </div>

          <div className="page-toolbar">
            <RangePicker
              value={range}
              onChange={(values) => {
                if (values?.[0] && values[1]) setRange([values[0], values[1]]);
              }}
              format="DD/MM/YYYY"
              allowClear={false}
            />
            <Input.Search
              placeholder="Tìm mã, diễn giải..."
              style={{ width: 240 }}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              allowClear
            />
            <Button icon={<ExportOutlined />} onClick={exportTransactions}>
              Xuất CSV
            </Button>
            <Typography.Text type="secondary">{rangePayments.length} giao dịch</Typography.Text>
          </div>

          <Card size="small">
            <Table<Payment>
              rowKey="id"
              dataSource={rangePayments}
              pagination={{ pageSize: 15, showSizeChanger: false }}
              columns={[
                { title: 'Mã', dataIndex: 'code', width: 132 },
                { title: 'Thời gian', width: 138, render: (_, row) => formatDateTime(row.at) },
                {
                  title: 'Loại',
                  width: 118,
                  render: (_, row) => {
                    const color = row.type === 'SUBSCRIPTION' ? 'blue' : row.type === 'INCIDENT' ? 'orange' : 'cyan';
                    return <Tag color={color}>{PAYMENT_TYPE_LABEL[row.type]}</Tag>;
                  },
                },
                { title: 'Diễn giải', dataIndex: 'description' },
                {
                  title: 'Số tiền',
                  width: 120,
                  render: (_, row) => <span className="text-strong">{formatMoney(row.amountVnd)}</span>,
                },
                { title: 'Hình thức', width: 120, render: (_, row) => <PaymentMethodTag method={row.method} /> },
                {
                  title: 'Thu ngân',
                  width: 130,
                  render: (_, row) => (row.cashierId ? employeeById.get(row.cashierId)?.name ?? '—' : '—'),
                },
                {
                  title: 'Ca',
                  width: 128,
                  render: (_, row) => (row.shiftId ? shiftById.get(row.shiftId)?.code ?? '—' : <span className="text-muted">—</span>),
                },
              ]}
            />
          </Card>
        </>
      ) : null}

      {tab === 'shifts' ? (
        <Card size="small">
          {openShifts.length > 0 ? (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 10 }}
              title={`Đang có ${openShifts.length} ca mở: ${openShifts.map((s) => employeeById.get(s.employeeId)?.name ?? '').join(', ')}`}
            />
          ) : null}
          <Table
            rowKey={({ shift }) => shift.id}
            dataSource={shiftRows}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            columns={[
              { title: 'Mã ca', width: 128, render: ({ shift }) => <span className="text-strong">{shift.code}</span> },
              {
                title: 'Nhân viên',
                width: 150,
                render: ({ shift }) => employeeById.get(shift.employeeId)?.name ?? '—',
              },
              { title: 'Mở lúc', width: 138, render: ({ shift }) => formatDateTime(shift.openedAt) },
              { title: 'Đóng lúc', width: 138, render: ({ shift }) => (shift.closedAt ? formatDateTime(shift.closedAt) : <span className="text-muted">—</span>) },
              { title: 'Đầu ca', width: 110, render: ({ shift }) => formatMoney(shift.openingCashVnd) },
              {
                title: 'Doanh thu ca',
                width: 125,
                render: ({ revenue }) => <span className="text-strong">{formatMoney(revenue)}</span>,
              },
              { title: 'Số GD', width: 70, render: ({ count }) => count },
              {
                title: 'Tiền mặt dự kiến',
                width: 130,
                render: ({ expectedCash }) => formatMoney(expectedCash),
              },
              {
                title: 'Thực đếm',
                width: 110,
                render: ({ shift }) => (shift.countedCashVnd != null ? formatMoney(shift.countedCashVnd) : <span className="text-muted">—</span>),
              },
              {
                title: 'Lệch',
                width: 110,
                render: ({ diff }) =>
                  diff == null ? (
                    <span className="text-muted">—</span>
                  ) : diff === 0 ? (
                    <Tag color="green">Khớp</Tag>
                  ) : (
                    <Tag color={diff > 0 ? 'orange' : 'red'}>{diff > 0 ? '+' : ''}{formatMoney(diff)}</Tag>
                  ),
              },
              { title: 'Trạng thái', width: 105, render: ({ shift }) => <ShiftStatusTag status={shift.status} /> },
              {
                title: '',
                width: 90,
                render: ({ shift }) =>
                  shift.status === 'OPEN' ? (
                    <Button type="link" size="small" onClick={() => void openCloseModal(shift)}>
                      Đóng ca
                    </Button>
                  ) : null,
              },
            ]}
          />
        </Card>
      ) : null}

      {tab === 'recon' ? (
        <>
          <div className="page-toolbar">
            <DatePicker value={reconDate} onChange={(v) => v && setReconDate(v)} format="DD/MM/YYYY" allowClear={false} />
            <Typography.Text type="secondary">Chọn ngày để xem đối soát theo ca và phương thức thanh toán.</Typography.Text>
          </div>
          <Card size="small">
            <Table
              rowKey={({ shift }) => shift.id}
              dataSource={reconRows}
              pagination={false}
              locale={{ emptyText: 'Không có ca trực nào trong ngày này.' }}
              columns={[
                { title: 'Ca', width: 128, render: ({ shift }) => shift.code },
                { title: 'Nhân viên', render: ({ shift }) => employeeById.get(shift.employeeId)?.name ?? '—' },
                { title: 'Tiền mặt', width: 130, render: ({ cash }) => formatMoney(cash) },
                { title: 'Chuyển khoản', width: 130, render: ({ transfer }) => formatMoney(transfer) },
                { title: 'Thẻ', width: 110, render: ({ card }) => formatMoney(card) },
                { title: 'Tổng thu ca', width: 135, render: ({ total }) => <span className="text-strong">{formatMoney(total)}</span> },
                { title: 'Tiền mặt dự kiến', width: 140, render: ({ expectedCash }) => formatMoney(expectedCash) },
                {
                  title: 'Lệch quỹ',
                  width: 120,
                  render: ({ diff }) =>
                    diff == null ? <span className="text-muted">Chưa đóng</span> : diff === 0 ? <Tag color="green">Khớp</Tag> : <Tag color="red">{formatMoney(diff)}</Tag>,
                },
              ]}
              summary={(rows) => {
                const total = rows.reduce((s, r) => s + r.total, 0);
                const cash = rows.reduce((s, r) => s + r.cash, 0);
                return (
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={2}>
                      <strong>Tổng ngày {reconDate.format('DD/MM/YYYY')}</strong>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={2}>{formatMoney(cash)}</Table.Summary.Cell>
                    <Table.Summary.Cell index={3} colSpan={2} />
                    <Table.Summary.Cell index={5}>
                      <strong>{formatMoney(total)}</strong>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={6} colSpan={2} />
                  </Table.Summary.Row>
                );
              }}
            />
          </Card>
        </>
      ) : null}

      <Modal
        open={openShiftModal}
        title="Mở ca trực"
        okText="Mở ca"
        cancelText="Đóng"
        okButtonProps={{ loading: opening, disabled: !openShiftEmployee }}
        onCancel={() => setOpenShiftModal(false)}
        onOk={() => void submitOpenShift()}
      >
        <Space orientation="vertical" size={10} style={{ width: '100%' }}>
          <div>
            <div className="text-muted" style={{ marginBottom: 4 }}>Nhân viên trực ca</div>
            <Select
              style={{ width: '100%' }}
              placeholder="Chọn nhân viên"
              value={openShiftEmployee}
              onChange={setOpenShiftEmployee}
              options={employees.map((e) => ({ value: e.id, label: `${e.name} — ${e.code}` }))}
            />
          </div>
          <div>
            <div className="text-muted" style={{ marginBottom: 4 }}>Tiền mặt đầu ca (VND)</div>
            <InputNumber
              style={{ width: '100%' }}
              value={openShiftCash}
              onChange={(v) => setOpenShiftCash(v ?? 0)}
              min={0}
              step={500000}
              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
              parser={(v) => Number((v ?? '0').replace(/\./g, ''))}
            />
          </div>
          <Alert type="info" showIcon title="Doanh thu ca được tính tự động từ các giao dịch phát sinh trong ca." />
        </Space>
      </Modal>

      <Modal
        open={!!closeTarget}
        title={`Đóng ca ${closeTarget?.code ?? ''}`}
        okText="Xác nhận đóng ca"
        cancelText="Đóng"
        okButtonProps={{ loading: closing }}
        onCancel={() => setCloseTarget(null)}
        onOk={() => void submitCloseShift()}
      >
        {closeSummary ? (
          <Space orientation="vertical" size={10} style={{ width: '100%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '4px 0', color: '#6b7a8d' }}>Số giao dịch</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{closeSummary.count}</td>
                </tr>
                <tr>
                  <td style={{ padding: '4px 0', color: '#6b7a8d' }}>Tiền mặt thu trong ca</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatMoney(closeSummary.cashVnd)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '4px 0', color: '#6b7a8d' }}>Chuyển khoản</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatMoney(closeSummary.transferVnd)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '4px 0', color: '#6b7a8d' }}>Thẻ</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatMoney(closeSummary.cardVnd)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '4px 0', color: '#6b7a8d' }}>Tổng doanh thu ca</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatMoney(closeSummary.totalVnd)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '4px 0', color: '#6b7a8d' }}>Tiền mặt dự kiến trong két</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatMoney(closeSummary.expectedCashVnd)}</td>
                </tr>
              </tbody>
            </table>
            <div>
              <div className="text-muted" style={{ marginBottom: 4 }}>Tiền mặt thực đếm (VND) — bắt buộc để đối soát</div>
              <InputNumber
                style={{ width: '100%' }}
                value={countedCash}
                onChange={(v) => setCountedCash(v)}
                min={0}
                step={100000}
                formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                parser={(v) => Number((v ?? '0').replace(/\./g, ''))}
                placeholder="Nhập số tiền đếm được"
              />
            </div>
            {countedCash != null ? (
              <Alert
                type={countedCash === closeSummary.expectedCashVnd ? 'success' : countedCash > closeSummary.expectedCashVnd ? 'warning' : 'error'}
                showIcon
                title={
                  countedCash === closeSummary.expectedCashVnd
                    ? 'Khớp quỹ.'
                    : `Lệch ${formatMoney(countedCash - closeSummary.expectedCashVnd)} so với dự kiến.`
                }
              />
            ) : null}
          </Space>
        ) : (
          <Card loading />
        )}
      </Modal>
    </div>
  );
}
