import { useMemo, useState } from 'react';
import { Alert, Button, Card, Checkbox, Input, Modal, Select, Segmented, Space, Table, Typography, Form, InputNumber } from 'antd';
import { AlertOutlined, CheckCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs from 'dayjs';
import { db } from '../../db/database';
import { useRole } from '../../app/RoleContext';
import { useAction } from '../../hooks/useAction';
import { createIncident, resolveIncident, suggestedIncidentFee } from '../../services/incidents';
import { INCIDENT_TYPE_META } from '../../utils/status';
import { IncidentStatusTag, IncidentTypeTag } from '../../components/StatusTag';
import { formatDateTime } from '../../utils/format';
import { formatMoney } from '../../utils/money';
import { matchesSearch } from '../../utils/text';
import type { Incident, IncidentType } from '../../types';

type FilterKey = 'ALL' | 'NEW' | 'RESOLVED';

interface CreateFormValues {
  type: IncidentType;
  plate?: string;
  sessionId?: string;
  description: string;
  feeVnd: number;
  collect: boolean;
}

export function IncidentsPage() {
  const { actor } = useRole();
  const incidents = useLiveQuery(() => db.incidents.orderBy('createdAt').reverse().toArray(), [], []);
  const payments = useLiveQuery(() => db.payments.toArray(), [], []);
  const activeSessions = useLiveQuery(() => db.sessions.where('status').equals('IN').toArray(), [], []);
  const employees = useLiveQuery(() => db.employees.toArray(), [], []);

  const [filter, setFilter] = useState<FilterKey>('ALL');
  const [keyword, setKeyword] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [resolveTarget, setResolveTarget] = useState<Incident | null>(null);
  const [resolveText, setResolveText] = useState('');
  const [form] = Form.useForm<CreateFormValues>();

  const { loading: creating, run: runCreate } = useAction();
  const { loading: resolving, run: runResolve } = useAction();

  const employeeById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const incidentPaymentMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of payments) {
      if (p.type === 'INCIDENT' && p.incidentId) {
        map.set(p.incidentId, (map.get(p.incidentId) ?? 0) + p.amountVnd);
      }
    }
    return map;
  }, [payments]);

  const rows = useMemo(() => {
    return incidents
      .filter((i) => (filter === 'ALL' ? true : i.status === filter))
      .filter((i) => matchesSearch([i.code, i.plate, i.description, INCIDENT_TYPE_META[i.type].label], keyword));
  }, [incidents, filter, keyword]);

  const stats = useMemo(() => {
    const today = incidents.filter((i) => dayjs(i.createdAt).isSame(dayjs(), 'day'));
    const collected = payments.filter((p) => p.type === 'INCIDENT').reduce((s, p) => s + p.amountVnd, 0);
    return {
      open: incidents.filter((i) => i.status === 'NEW').length,
      today: today.length,
      resolved: incidents.filter((i) => i.status === 'RESOLVED').length,
      collected,
    };
  }, [incidents, payments]);

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({ type: 'LOST_TICKET', feeVnd: 200000, collect: true });
    void suggestedIncidentFee('LOST_TICKET', 'CAR').then((fee) => form.setFieldValue('feeVnd', fee));
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    const values = await form.validateFields();
    await runCreate(
      () =>
        createIncident(actor, {
          type: values.type,
          plate: values.plate,
          sessionId: values.sessionId,
          description: values.description,
          feeVnd: values.feeVnd,
          collect: values.collect,
          vehicleType: activeSessions.find((s) => s.id === values.sessionId)?.vehicleType ?? 'CAR',
        }),
      {
        successMessage: 'Đã ghi nhận sự cố.',
        onSuccess: () => setCreateOpen(false),
      },
    );
  };

  const submitResolve = async () => {
    if (!resolveTarget) return;
    await runResolve(() => resolveIncident(actor, resolveTarget.id, resolveText), {
      successMessage: 'Đã đánh dấu xử lý sự cố.',
      onSuccess: () => {
        setResolveTarget(null);
        setResolveText('');
      },
    });
  };

  return (
    <div>
      <div className="page-toolbar" style={{ justifyContent: 'space-between' }}>
        <Segmented<FilterKey>
          value={filter}
          onChange={(v) => setFilter(v)}
          options={[
            { value: 'ALL', label: 'Tất cả' },
            { value: 'NEW', label: `Chưa xử lý (${stats.open})` },
            { value: 'RESOLVED', label: 'Đã xử lý' },
          ]}
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          Tạo sự cố
        </Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
        <Card size="small">
          <div className="text-muted" style={{ fontSize: 12.5 }}>
            <AlertOutlined /> Chưa xử lý
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: stats.open > 0 ? '#d64545' : '#12332f' }}>{stats.open}</div>
        </Card>
        <Card size="small">
          <div className="text-muted" style={{ fontSize: 12.5 }}>
            Sự cố hôm nay
          </div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{stats.today}</div>
        </Card>
        <Card size="small">
          <div className="text-muted" style={{ fontSize: 12.5 }}>
            <CheckCircleOutlined /> Đã xử lý
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#2f9e44' }}>{stats.resolved}</div>
        </Card>
        <Card size="small">
          <div className="text-muted" style={{ fontSize: 12.5 }}>
            Phụ phí đã thu
          </div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{formatMoney(stats.collected)}</div>
        </Card>
      </div>

      <div className="page-toolbar">
        <Input.Search
          placeholder="Tìm mã sự cố, biển số, nội dung..."
          style={{ width: 280 }}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          allowClear
        />
        <Typography.Text type="secondary">{rows.length} sự cố</Typography.Text>
      </div>

      <Card size="small">
        <Table<Incident>
          rowKey="id"
          dataSource={rows}
          pagination={{ pageSize: 12, showSizeChanger: false }}
          columns={[
            {
              title: 'Mã',
              dataIndex: 'code',
              width: 132,
              render: (code: string) => <span className="text-strong">{code}</span>,
            },
            { title: 'Loại', width: 110, render: (_, row) => <IncidentTypeTag type={row.type} /> },
            {
              title: 'Biển số',
              width: 130,
              render: (_, row) => row.plate ?? <span className="text-muted">—</span>,
            },
            {
              title: 'Nội dung',
              render: (_, row) => (
                <div>
                  <div>{row.description}</div>
                  {row.resolution ? <div className="text-muted" style={{ fontSize: 12 }}>↳ {row.resolution}</div> : null}
                </div>
              ),
            },
            {
              title: 'Phụ phí',
              width: 130,
              render: (_, row) => {
                const paid = incidentPaymentMap.get(row.id) ?? 0;
                if (!row.feeVnd && paid === 0) return <span className="text-muted">—</span>;
                return (
                  <div>
                    <div className="text-strong">{formatMoney(row.feeVnd ?? 0)}</div>
                    {paid > 0 ? <div className="text-muted" style={{ fontSize: 11.5 }}>Đã thu: {formatMoney(paid)}</div> : null}
                  </div>
                );
              },
            },
            {
              title: 'Thời gian',
              width: 140,
              render: (_, row) => (
                <div>
                  <div>{formatDateTime(row.createdAt)}</div>
                  {row.resolvedAt ? <div className="text-muted" style={{ fontSize: 11.5 }}>Xử lý: {formatDateTime(row.resolvedAt)}</div> : null}
                </div>
              ),
            },
            {
              title: 'Trạng thái',
              width: 110,
              render: (_, row) => <IncidentStatusTag status={row.status} />,
            },
            {
              title: 'Người xử lý',
              width: 130,
              render: (_, row) => (row.handledById ? employeeById.get(row.handledById)?.name ?? '—' : <span className="text-muted">—</span>),
            },
            {
              title: '',
              width: 110,
              render: (_, row) =>
                row.status === 'NEW' ? (
                  <Button
                    type="link"
                    size="small"
                    onClick={() => {
                      setResolveTarget(row);
                      setResolveText('');
                    }}
                  >
                    Xử lý
                  </Button>
                ) : null,
            },
          ]}
        />
      </Card>

      <Modal
        open={createOpen}
        title="Ghi nhận sự cố"
        okText="Lưu sự cố"
        cancelText="Đóng"
        okButtonProps={{ loading: creating }}
        onCancel={() => setCreateOpen(false)}
        onOk={() => void submitCreate()}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item name="type" label="Loại sự cố" rules={[{ required: true, message: 'Chọn loại sự cố' }]}>
            <Select
              options={Object.entries(INCIDENT_TYPE_META).map(([value, meta]) => ({ value, label: meta.label }))}
              onChange={(value: IncidentType) => {
                void suggestedIncidentFee(value).then((fee) => form.setFieldValue('feeVnd', fee));
              }}
            />
          </Form.Item>
          <Form.Item name="sessionId" label="Gắn với phiên gửi xe (tuỳ chọn)">
            <Select
              allowClear
              placeholder="Chọn xe đang trong bãi nếu có"
              options={activeSessions.map((s) => ({ value: s.id, label: `${s.plate} — ${s.code}` }))}
              showSearch
              optionFilterProp="label"
              onChange={(value?: string) => {
                const session = activeSessions.find((s) => s.id === value);
                if (session) {
                  form.setFieldValue('plate', session.plate);
                  void suggestedIncidentFee(form.getFieldValue('type') as IncidentType, session.vehicleType).then((fee) =>
                    form.setFieldValue('feeVnd', fee),
                  );
                }
              }}
            />
          </Form.Item>
          <Form.Item name="plate" label="Biển số (tuỳ chọn)">
            <Input placeholder="VD: 30A-123.45" style={{ textTransform: 'uppercase' }} />
          </Form.Item>
          <Form.Item name="description" label="Mô tả sự cố" rules={[{ required: true, min: 5, message: 'Mô tả ít nhất 5 ký tự' }]}>
            <Input.TextArea rows={3} placeholder="VD: Khách báo mất vé, chưa xuất trình giấy tờ..." />
          </Form.Item>
          <Form.Item name="feeVnd" label="Phụ phí (VND)">
            <InputNumber<number> style={{ width: '100%' }} min={0} step={10000} formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')} parser={(v) => Number((v ?? '0').replace(/\./g, ''))} />
          </Form.Item>
          <Form.Item name="collect" valuePropName="checked">
            <Checkbox>Lập phiếu thu phụ phí ngay (ghi vào giao dịch hôm nay)</Checkbox>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={!!resolveTarget}
        title={`Xử lý sự cố ${resolveTarget?.code ?? ''}`}
        okText="Đánh dấu đã xử lý"
        cancelText="Đóng"
        okButtonProps={{ loading: resolving }}
        onCancel={() => setResolveTarget(null)}
        onOk={() => void submitResolve()}
      >
        <Space orientation="vertical" size={10} style={{ width: '100%' }}>
          <Alert type="info" showIcon title={resolveTarget?.description} />
          <Input.TextArea
            rows={3}
            placeholder="Mô tả cách xử lý (VD: Đã thu phụ phí, cho xe ra sau xác minh...)"
            value={resolveText}
            onChange={(e) => setResolveText(e.target.value)}
          />
        </Space>
      </Modal>
    </div>
  );
}
