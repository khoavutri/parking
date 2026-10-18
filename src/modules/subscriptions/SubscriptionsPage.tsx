import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  Modal,
  Progress,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { IdcardOutlined, PlusOutlined, SyncOutlined, StopOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs from 'dayjs';
import { db } from '../../db/database';
import { useRole } from '../../app/RoleContext';
import { useAction } from '../../hooks/useAction';
import { cancelSubscription, renewSubscription, sellSubscription } from '../../services/subscriptions';
import { ensureVehicle } from '../../services/customers';
import { DEFAULT_SUBSCRIPTION_PLANS, getSetting, SETTING_KEYS } from '../../services/settings';
import { SubscriptionStatusTag } from '../../components/StatusTag';
import { PLAN_LABEL, VEHICLE_TYPE_LABEL, subscriptionState } from '../../utils/status';
import { formatDate } from '../../utils/format';
import { formatMoney } from '../../utils/money';
import { matchesSearch } from '../../utils/text';
import type { PaymentMethod, Subscription, SubscriptionPlanId, VehicleType } from '../../types';

type FilterKey = 'ALL' | 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'CANCELLED';

interface SellFormValues {
  customerId: string;
  vehicleId?: string;
  newPlate?: string;
  newVehicleType?: VehicleType;
  plan: SubscriptionPlanId;
  startDate: dayjs.Dayjs;
  method: PaymentMethod;
}

interface RenewFormValues {
  plan: SubscriptionPlanId;
  method: PaymentMethod;
}

export function SubscriptionsPage() {
  const { actor } = useRole();
  const [params, setParams] = useSearchParams();
  const initialFilter = params.get('filter') === 'expiring' ? 'EXPIRING' : 'ALL';
  const [filter, setFilter] = useState<FilterKey>(initialFilter);
  const [keyword, setKeyword] = useState('');
  const [sellOpen, setSellOpen] = useState(false);
  const [renewTarget, setRenewTarget] = useState<Subscription | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Subscription | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [sellForm] = Form.useForm<SellFormValues>();
  const [renewForm] = Form.useForm<RenewFormValues>();

  const { loading: selling, run: runSell } = useAction();
  const { loading: renewing, run: runRenew } = useAction();
  const { loading: cancelling, run: runCancel } = useAction();

  const subscriptions = useLiveQuery(() => db.subscriptions.toArray(), [], []);
  const customers = useLiveQuery(() => db.customers.toArray(), [], []);
  const vehicles = useLiveQuery(() => db.vehicles.toArray(), [], []);
  const plans = useLiveQuery(() => getSetting(SETTING_KEYS.SUBSCRIPTION_PLANS, DEFAULT_SUBSCRIPTION_PLANS), [], DEFAULT_SUBSCRIPTION_PLANS);

  const customerById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const vehicleById = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);

  const rows = useMemo(() => {
    return subscriptions
      .map((s) => ({ sub: s, state: subscriptionState(s) }))
      .filter(({ state }) => {
        if (filter === 'ALL' || filter === 'CANCELLED') return true;
        if (filter === 'ACTIVE') return state.key === 'ACTIVE';
        if (filter === 'EXPIRING') return state.key === 'EXPIRING';
        if (filter === 'EXPIRED') return state.key === 'EXPIRED';
        return true;
      })
      .filter(({ sub }) => {
        const customer = customerById.get(sub.customerId);
        const vehicle = vehicleById.get(sub.vehicleId);
        return matchesSearch([sub.code, customer?.name, vehicle?.plate], keyword);
      })
      .sort((a, b) => (a.sub.endDate < b.sub.endDate ? 1 : -1));
  }, [subscriptions, filter, keyword, customerById, vehicleById]);

  const stats = useMemo(() => {
    const active = subscriptions.filter((s) => ['ACTIVE', 'EXPIRING'].includes(subscriptionState(s).key)).length;
    const expiring = subscriptions.filter((s) => subscriptionState(s).key === 'EXPIRING').length;
    const expired = subscriptions.filter((s) => subscriptionState(s).key === 'EXPIRED').length;
    const revenue = subscriptions
      .filter((s) => dayjs(s.createdAt).isAfter(dayjs().startOf('month')))
      .reduce((sum, s) => sum + s.priceVnd, 0);
    return { active, expiring, expired, revenue };
  }, [subscriptions]);

  const sellVehicleType = Form.useWatch('newVehicleType', sellForm);
  const sellCustomerId = Form.useWatch('customerId', sellForm);
  const sellPlan = Form.useWatch('plan', sellForm);
  const hasNewPlate = Boolean(Form.useWatch('newPlate', sellForm));

  const customerVehicles = useMemo(
    () => (sellCustomerId ? vehicles.filter((v) => v.customerId === sellCustomerId) : []),
    [sellCustomerId, vehicles],
  );

  const selectedPlanPrice = useMemo(() => {
    if (!sellPlan) return null;
    const plan = plans.find((p) => p.id === sellPlan);
    if (!plan) return null;
    return { plan, price: plan.price[(sellVehicleType ?? 'CAR') as VehicleType] };
  }, [sellPlan, sellVehicleType, plans]);

  const openSell = () => {
    sellForm.resetFields();
    sellForm.setFieldsValue({ plan: '1M', startDate: dayjs(), method: 'CASH', newVehicleType: 'CAR' });
    setSellOpen(true);
  };

  const submitSell = async () => {
    const values = await sellForm.validateFields();
    await runSell(
      async () => {
        let vehicleId = values.vehicleId;
        if (!vehicleId) {
          if (!values.newPlate || values.newPlate.trim().length < 5) {
            throw new Error('Chọn xe có sẵn hoặc nhập biển số xe mới.');
          }
          const vehicle = await ensureVehicle(actor, values.newPlate, values.newVehicleType ?? 'CAR', values.customerId);
          vehicleId = vehicle.id;
        }
        return sellSubscription(actor, {
          customerId: values.customerId,
          vehicleId,
          plan: values.plan,
          startDate: values.startDate.toISOString(),
          method: values.method,
        });
      },
      {
        successMessage: 'Đã bán vé tháng và ghi nhận thanh toán.',
        onSuccess: () => setSellOpen(false),
      },
    );
  };

  const openRenew = (sub: Subscription) => {
    renewForm.resetFields();
    renewForm.setFieldsValue({ plan: sub.plan, method: 'CASH' });
    setRenewTarget(sub);
  };

  const submitRenew = async () => {
    if (!renewTarget) return;
    const values = await renewForm.validateFields();
    await runRenew(() => renewSubscription(actor, renewTarget.id, values.plan, values.method), {
      successMessage: 'Đã gia hạn vé tháng.',
      onSuccess: () => setRenewTarget(null),
    });
  };

  const submitCancel = async () => {
    if (!cancelTarget) return;
    await runCancel(() => cancelSubscription(actor, cancelTarget.id, cancelReason), {
      successMessage: 'Đã huỷ vé tháng.',
      onSuccess: () => {
        setCancelTarget(null);
        setCancelReason('');
      },
    });
  };

  const renewVehicle = renewTarget ? vehicleById.get(renewTarget.vehicleId) : null;

  return (
    <div>
      <div className="page-toolbar" style={{ justifyContent: 'space-between' }}>
        <Segmented<FilterKey>
          value={filter}
          onChange={(v) => {
            setFilter(v);
            const p = new URLSearchParams(params);
            if (v === 'EXPIRING') p.set('filter', 'expiring');
            else p.delete('filter');
            setParams(p, { replace: true });
          }}
          options={[
            { value: 'ALL', label: 'Tất cả' },
            { value: 'ACTIVE', label: `Hiệu lực (${stats.active})` },
            { value: 'EXPIRING', label: `Sắp hết hạn (${stats.expiring})` },
            { value: 'EXPIRED', label: `Hết hạn (${stats.expired})` },
            { value: 'CANCELLED', label: 'Đã huỷ' },
          ]}
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={openSell}>
          Bán vé tháng
        </Button>
      </div>

      <div className="page-toolbar">
        <Input.Search
          placeholder="Tìm mã vé, khách hàng, biển số..."
          style={{ width: 280 }}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          allowClear
        />
        <Tag icon={<IdcardOutlined />} color="cyan">
          Doanh thu vé tháng tháng này: {formatMoney(stats.revenue)}
        </Tag>
      </div>

      {stats.expiring > 0 ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          title={`${stats.expiring} vé tháng sắp hết hạn trong 7 ngày tới`}
          description="Chủ động gọi điện nhắc khách gia hạn để giữ chân khách gửi xe."
        />
      ) : null}

      <Card size="small">
        <Table<{ sub: Subscription; state: ReturnType<typeof subscriptionState> }>
          rowKey={({ sub }) => sub.id}
          dataSource={rows}
          pagination={{ pageSize: 12, showSizeChanger: false }}
          columns={[
            {
              title: 'Mã vé',
              width: 132,
              render: ({ sub }) => <span className="text-strong">{sub.code}</span>,
            },
            {
              title: 'Khách hàng',
              render: ({ sub }) => {
                const customer = customerById.get(sub.customerId);
                return (
                  <div>
                    <div>{customer?.name ?? '—'}</div>
                    <div className="text-muted" style={{ fontSize: 12 }}>{customer?.phone}</div>
                  </div>
                );
              },
            },
            {
              title: 'Xe',
              width: 150,
              render: ({ sub }) => {
                const vehicle = vehicleById.get(sub.vehicleId);
                return (
                  <div>
                    <div className="text-strong">{vehicle?.plate ?? '—'}</div>
                    <div className="text-muted" style={{ fontSize: 12 }}>
                      {vehicle ? VEHICLE_TYPE_LABEL[vehicle.vehicleType] : ''}
                    </div>
                  </div>
                );
              },
            },
            {
              title: 'Gói',
              width: 100,
              render: ({ sub }) => <Tag color="blue">{PLAN_LABEL[sub.plan]}</Tag>,
            },
            {
              title: 'Giá',
              width: 110,
              render: ({ sub }) => formatMoney(sub.priceVnd),
            },
            {
              title: 'Hiệu lực',
              width: 170,
              render: ({ sub }) => (
                <span>
                  {formatDate(sub.startDate)} → {formatDate(sub.endDate)}
                </span>
              ),
            },
            {
              title: 'Còn lại',
              width: 140,
              render: ({ state }) => {
                if (state.key === 'CANCELLED') return <span className="text-muted">—</span>;
                if (state.daysLeft < 0) return <span style={{ color: '#d64545' }}>Quá {Math.abs(state.daysLeft)} ngày</span>;
                return (
                  <Progress
                    percent={Math.min(100, Math.round((state.daysLeft / 30) * 100))}
                    size="small"
                    strokeColor={state.daysLeft <= 7 ? '#e8930c' : '#0f766e'}
                    format={() => `${state.daysLeft} ngày`}
                  />
                );
              },
            },
            {
              title: 'Trạng thái',
              width: 120,
              render: ({ sub }) => <SubscriptionStatusTag subscription={sub} />,
            },
            {
              title: '',
              width: 180,
              render: ({ sub, state }) =>
                state.key === 'CANCELLED' ? null : (
                  <Space size={4}>
                    <Button type="link" size="small" icon={<SyncOutlined />} onClick={() => openRenew(sub)}>
                      Gia hạn
                    </Button>
                    <Button
                      type="link"
                      size="small"
                      danger
                      icon={<StopOutlined />}
                      onClick={() => {
                        setCancelTarget(sub);
                        setCancelReason('');
                      }}
                    >
                      Huỷ
                    </Button>
                  </Space>
                ),
            },
          ]}
        />
      </Card>

      <Modal
        open={sellOpen}
        title="Bán vé tháng"
        okText="Xác nhận bán vé"
        cancelText="Đóng"
        okButtonProps={{ loading: selling }}
        onCancel={() => setSellOpen(false)}
        onOk={() => void submitSell()}
        destroyOnHidden
        width={560}
      >
        <Form form={sellForm} layout="vertical" requiredMark={false}>
          <Form.Item name="customerId" label="Khách hàng" rules={[{ required: true, message: 'Chọn khách hàng' }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Tìm theo tên hoặc số điện thoại"
              options={customers.map((c) => ({ value: c.id, label: `${c.name} — ${c.phone}` }))}
              onChange={() => sellForm.setFieldValue('vehicleId', undefined)}
            />
          </Form.Item>
          <Form.Item name="vehicleId" label="Xe đã đăng ký của khách" rules={[{ required: !hasNewPlate, message: 'Chọn xe hoặc nhập biển số mới' }]}>
            <Select
              allowClear
              placeholder="Chọn xe có sẵn"
              options={customerVehicles.map((v) => ({ value: v.id, label: `${v.plate} — ${v.brandModel ?? VEHICLE_TYPE_LABEL[v.vehicleType]}` }))}
            />
          </Form.Item>
          <Space style={{ width: '100%' }} size={8} align="start">
            <Form.Item name="newPlate" label="Hoặc nhập biển số xe mới">
              <Input placeholder="VD: 29-B2 456.78" style={{ width: 240, textTransform: 'uppercase' }} />
            </Form.Item>
            <Form.Item name="newVehicleType" label="Loại xe mới">
              <Segmented
                options={[
                  { value: 'CAR', label: 'Ô tô' },
                  { value: 'MOTORBIKE', label: 'Xe máy' },
                ]}
              />
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }} size={8} align="start">
            <Form.Item name="plan" label="Gói vé" rules={[{ required: true }]} style={{ minWidth: 220 }}>
              <Select
                options={plans.map((p) => ({ value: p.id, label: `${p.name} — ${formatMoney(p.price[(sellVehicleType ?? 'CAR') as VehicleType])}` }))}
              />
            </Form.Item>
            <Form.Item name="startDate" label="Ngày bắt đầu" rules={[{ required: true, message: 'Chọn ngày bắt đầu' }]}>
              <DatePicker format="DD/MM/YYYY" allowClear={false} />
            </Form.Item>
          </Space>
          <Form.Item name="method" label="Hình thức thanh toán" rules={[{ required: true }]}>
            <Segmented
              options={[
                { value: 'CASH', label: 'Tiền mặt' },
                { value: 'TRANSFER', label: 'Chuyển khoản' },
                { value: 'CARD', label: 'Thẻ' },
              ]}
            />
          </Form.Item>
          {selectedPlanPrice ? (
            <Alert
              type="info"
              showIcon
              title={`Giá vé: ${formatMoney(selectedPlanPrice.price)} cho ${selectedPlanPrice.plan.months} tháng (${
                VEHICLE_TYPE_LABEL[(sellVehicleType ?? 'CAR') as VehicleType]
              })`}
            />
          ) : null}
        </Form>
      </Modal>

      <Modal
        open={!!renewTarget}
        title={`Gia hạn vé ${renewTarget?.code ?? ''}`}
        okText="Xác nhận gia hạn"
        cancelText="Đóng"
        okButtonProps={{ loading: renewing }}
        onCancel={() => setRenewTarget(null)}
        onOk={() => void submitRenew()}
        destroyOnHidden
      >
        <Form form={renewForm} layout="vertical" requiredMark={false}>
          <Form.Item label="Xe">
            <Input value={renewVehicle ? `${renewVehicle.plate} — ${customerById.get(renewVehicle.customerId ?? '')?.name ?? ''}` : ''} disabled />
          </Form.Item>
          <Form.Item name="plan" label="Gói gia hạn" rules={[{ required: true }]}>
            <Select
              options={plans.map((p) => ({
                value: p.id,
                label: `${p.name} — ${formatMoney(p.price[(renewVehicle?.vehicleType ?? 'CAR') as VehicleType])}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="method" label="Hình thức thanh toán" rules={[{ required: true }]}>
            <Segmented
              options={[
                { value: 'CASH', label: 'Tiền mặt' },
                { value: 'TRANSFER', label: 'Chuyển khoản' },
                { value: 'CARD', label: 'Thẻ' },
              ]}
            />
          </Form.Item>
          <Typography.Text type="secondary">
            Thời gian mới được cộng tiếp từ ngày hết hạn hiện tại (hoặc từ hôm nay nếu đã hết hạn).
          </Typography.Text>
        </Form>
      </Modal>

      <Modal
        open={!!cancelTarget}
        title={`Huỷ vé tháng ${cancelTarget?.code ?? ''}`}
        okText="Xác nhận huỷ"
        okButtonProps={{ danger: true, loading: cancelling }}
        cancelText="Đóng"
        onCancel={() => setCancelTarget(null)}
        onOk={() => void submitCancel()}
      >
        <Space orientation="vertical" size={10} style={{ width: '100%' }}>
          <Alert type="warning" showIcon title="Vé sẽ không còn hiệu lực kể từ thời điểm huỷ." />
          <Input.TextArea rows={2} placeholder="Lý do huỷ (không bắt buộc)" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
        </Space>
      </Modal>
    </div>
  );
}
