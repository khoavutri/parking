import { useMemo, useState } from 'react';
import { Button, Card, Descriptions, Drawer, Form, Input, Modal, Segmented, Space, Table, Tag } from 'antd';
import { CarOutlined, EditOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs from 'dayjs';
import { db } from '../../db/database';
import { useRole } from '../../app/RoleContext';
import { useAction } from '../../hooks/useAction';
import { createCustomer, updateCustomer, saveVehicle } from '../../services/customers';
import { SubscriptionStatusTag } from '../../components/StatusTag';
import { VEHICLE_TYPE_LABEL } from '../../utils/status';
import { formatDate, formatDateTime } from '../../utils/format';
import { formatMoney } from '../../utils/money';
import { matchesSearch } from '../../utils/text';
import type { Customer, Vehicle, VehicleType } from '../../types';

interface CustomerFormValues {
  name: string;
  phone: string;
  note?: string;
}

interface VehicleFormValues {
  plate: string;
  vehicleType: VehicleType;
  brandModel?: string;
  color?: string;
}

export function CustomersPage() {
  const { actor } = useRole();
  const [params, setParams] = useSearchParams();
  const [keyword, setKeyword] = useState(params.get('q') ?? '');
  const [filter, setFilter] = useState<'ALL' | 'SUB' | 'WALK'>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [vehicleEditing, setVehicleEditing] = useState<Vehicle | null>(null);
  const [customerForm] = Form.useForm<CustomerFormValues>();
  const [vehicleForm] = Form.useForm<VehicleFormValues>();

  const { loading: savingCustomer, run: runSaveCustomer } = useAction();
  const { loading: savingVehicle, run: runSaveVehicle } = useAction();

  const customers = useLiveQuery(() => db.customers.toArray(), [], []);
  const vehicles = useLiveQuery(() => db.vehicles.toArray(), [], []);
  const subscriptions = useLiveQuery(() => db.subscriptions.toArray(), [], []);
  const sessions = useLiveQuery(() => db.sessions.toArray(), [], []);
  const payments = useLiveQuery(() => db.payments.toArray(), [], []);

  const vehiclesByCustomer = useMemo(() => {
    const map = new Map<string, Vehicle[]>();
    for (const v of vehicles) {
      if (!v.customerId) continue;
      const list = map.get(v.customerId) ?? [];
      list.push(v);
      map.set(v.customerId, list);
    }
    return map;
  }, [vehicles]);

  const activeSubCustomerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const sub of subscriptions) {
      if (sub.status === 'ACTIVE' && dayjs(sub.endDate).isAfter(dayjs())) ids.add(sub.customerId);
    }
    return ids;
  }, [subscriptions]);

  const spendByCustomer = useMemo(() => {
    const map = new Map<string, number>();
    const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
    const sessionById = new Map(sessions.map((s) => [s.id, s]));
    for (const p of payments) {
      let customerId: string | undefined;
      if (p.subscriptionId) {
        const sub = subscriptions.find((s) => s.id === p.subscriptionId);
        const veh = sub ? vehicleById.get(sub.vehicleId) : undefined;
        customerId = veh?.customerId;
      } else if (p.sessionId) {
        const session = sessionById.get(p.sessionId);
        if (session?.customerId) customerId = session.customerId;
        else if (session) {
          const veh = vehicles.find((v) => v.normalizedPlate === session.normalizedPlate);
          customerId = veh?.customerId;
        }
      }
      if (customerId) map.set(customerId, (map.get(customerId) ?? 0) + p.amountVnd);
    }
    return map;
  }, [payments, subscriptions, sessions, vehicles]);

  const rows = useMemo(() => {
    return customers
      .filter((c) => {
        if (filter === 'SUB') return activeSubCustomerIds.has(c.id);
        if (filter === 'WALK') return !activeSubCustomerIds.has(c.id);
        return true;
      })
      .filter((c) => matchesSearch([c.name, c.phone, c.code], keyword))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [customers, filter, keyword, activeSubCustomerIds]);

  const selected = customers.find((c) => c.id === selectedId) ?? null;
  const selectedVehicles = selected ? vehiclesByCustomer.get(selected.id) ?? [] : [];
  const selectedSessions = useMemo(
    () => (selected ? sessions.filter((s) => s.customerId === selected.id || selectedVehicles.some((v) => v.normalizedPlate === s.normalizedPlate)).sort((a, b) => (a.checkInAt < b.checkInAt ? 1 : -1)).slice(0, 10) : []),
    [selected, sessions, selectedVehicles],
  );
  const selectedSubscriptions = useMemo(
    () => (selected ? subscriptions.filter((s) => s.customerId === selected.id).sort((a, b) => (a.endDate < b.endDate ? 1 : -1)) : []),
    [selected, subscriptions],
  );

  const stats = useMemo(() => {
    const monthStart = dayjs().startOf('month');
    return {
      total: customers.length,
      withSub: activeSubCustomerIds.size,
      newThisMonth: customers.filter((c) => dayjs(c.createdAt).isAfter(monthStart)).length,
    };
  }, [customers, activeSubCustomerIds]);

  const openCreate = () => {
    setEditing(null);
    customerForm.resetFields();
    setFormOpen(true);
  };

  const openEdit = (customer: Customer) => {
    setEditing(customer);
    customerForm.setFieldsValue({ name: customer.name, phone: customer.phone, note: customer.note });
    setFormOpen(true);
  };

  const submitCustomer = async () => {
    const values = await customerForm.validateFields();
    await runSaveCustomer(
      () => (editing ? updateCustomer(actor, editing.id, values).then(() => editing) : createCustomer(actor, values)),
      {
        successMessage: editing ? 'Đã cập nhật khách hàng.' : 'Đã tạo khách hàng mới.',
        onSuccess: (result) => {
          setFormOpen(false);
          if (!editing && result) setSelectedId(result.id);
        },
      },
    );
  };

  const openAddVehicle = (vehicle?: Vehicle) => {
    setVehicleEditing(vehicle ?? null);
    vehicleForm.resetFields();
    if (vehicle) {
      vehicleForm.setFieldsValue({
        plate: vehicle.plate,
        vehicleType: vehicle.vehicleType,
        brandModel: vehicle.brandModel,
        color: vehicle.color,
      });
    } else {
      vehicleForm.setFieldsValue({ vehicleType: 'CAR' });
    }
    setVehicleOpen(true);
  };

  const submitVehicle = async () => {
    const values = await vehicleForm.validateFields();
    if (!selected) return;
    await runSaveVehicle(() => saveVehicle(actor, vehicleEditing?.id ?? null, { ...values, customerId: selected.id }), {
      successMessage: vehicleEditing ? 'Đã cập nhật xe.' : 'Đã thêm xe cho khách.',
      onSuccess: () => setVehicleOpen(false),
    });
  };

  return (
    <div>
      <div className="page-toolbar" style={{ justifyContent: 'space-between' }}>
        <Segmented
          value={filter}
          onChange={(v) => setFilter(v as typeof filter)}
          options={[
            { value: 'ALL', label: `Tất cả (${stats.total})` },
            { value: 'SUB', label: `Khách vé tháng (${stats.withSub})` },
            { value: 'WALK', label: 'Khách lẻ' },
          ]}
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          Thêm khách hàng
        </Button>
      </div>

      <div className="page-toolbar">
        <Input.Search
          placeholder="Tìm theo tên, số điện thoại, mã khách..."
          style={{ width: 280 }}
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value);
            const p = new URLSearchParams(params);
            if (e.target.value) p.set('q', e.target.value);
            else p.delete('q');
            setParams(p, { replace: true });
          }}
          allowClear
        />
        <Tag icon={<TeamOutlined />} color="cyan">
          Khách mới tháng này: {stats.newThisMonth}
        </Tag>
      </div>

      <Card size="small">
        <Table<Customer>
          rowKey="id"
          dataSource={rows}
          pagination={{ pageSize: 12, showSizeChanger: false }}
          onRow={(record) => ({ onClick: () => setSelectedId(record.id), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'Mã', dataIndex: 'code', width: 100 },
            {
              title: 'Khách hàng',
              render: (_, row) => (
                <div>
                  <div className="text-strong">{row.name}</div>
                  {row.note ? <div className="text-muted" style={{ fontSize: 12 }}>{row.note}</div> : null}
                </div>
              ),
            },
            { title: 'Điện thoại', dataIndex: 'phone', width: 130 },
            {
              title: 'Xe đăng ký',
              render: (_, row) => {
                const list = vehiclesByCustomer.get(row.id) ?? [];
                if (list.length === 0) return <span className="text-muted">Chưa có xe</span>;
                return (
                  <Space size={4} wrap>
                    {list.map((v) => (
                      <Tag key={v.id} icon={<CarOutlined />}>
                        {v.plate}
                      </Tag>
                    ))}
                  </Space>
                );
              },
            },
            {
              title: 'Vé tháng',
              width: 130,
              render: (_, row) => {
                const sub = subscriptions
                  .filter((s) => s.customerId === row.id)
                  .sort((a, b) => (a.endDate < b.endDate ? 1 : -1))[0];
                return sub ? <SubscriptionStatusTag subscription={sub} /> : <span className="text-muted">—</span>;
              },
            },
            {
              title: 'Tổng chi tiêu',
              width: 130,
              render: (_, row) => <span className="text-strong">{formatMoney(spendByCustomer.get(row.id) ?? 0)}</span>,
            },
            { title: 'Ngày tạo', width: 110, render: (_, row) => formatDate(row.createdAt) },
            {
              title: '',
              width: 60,
              render: (_, row) => (
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    openEdit(row);
                  }}
                />
              ),
            },
          ]}
        />
      </Card>

      <Drawer
        open={!!selected}
        onClose={() => setSelectedId(null)}
        size="large"
        title={selected ? `Khách hàng ${selected.name}` : ''}
        extra={
          selected ? (
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(selected)}>
              Sửa
            </Button>
          ) : null
        }
      >
        {selected ? (
          <Space orientation="vertical" size={14} style={{ width: '100%' }}>
            <Descriptions
              size="small"
              column={1}
              items={[
                { key: 'code', label: 'Mã khách', children: selected.code },
                { key: 'phone', label: 'Điện thoại', children: selected.phone },
                { key: 'created', label: 'Ngày tạo', children: formatDate(selected.createdAt) },
                { key: 'spend', label: 'Tổng chi tiêu', children: formatMoney(spendByCustomer.get(selected.id) ?? 0) },
                { key: 'note', label: 'Ghi chú', children: selected.note ?? '—' },
              ]}
            />

            <Card
              size="small"
              title={`Xe đăng ký (${selectedVehicles.length})`}
              extra={
                <Button size="small" icon={<PlusOutlined />} onClick={() => openAddVehicle()}>
                  Thêm xe
                </Button>
              }
            >
              {selectedVehicles.length === 0 ? (
                <div className="text-muted">Khách chưa đăng ký xe nào. Thêm xe để bán vé tháng.</div>
              ) : (
                <Space orientation="vertical" size={8} style={{ width: '100%' }}>
                  {selectedVehicles.map((v) => (
                    <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px dashed #edf1f6', paddingBottom: 6 }}>
                      <div>
                        <div className="text-strong">{v.plate}</div>
                        <div className="text-muted" style={{ fontSize: 12 }}>
                          {VEHICLE_TYPE_LABEL[v.vehicleType]}
                          {v.brandModel ? ` · ${v.brandModel}` : ''}
                          {v.color ? ` · ${v.color}` : ''}
                        </div>
                      </div>
                      <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openAddVehicle(v)} />
                    </div>
                  ))}
                </Space>
              )}
            </Card>

            <Card size="small" title={`Lịch sử vé tháng (${selectedSubscriptions.length})`}>
              {selectedSubscriptions.length === 0 ? (
                <div className="text-muted">Chưa có vé tháng nào.</div>
              ) : (
                <Space orientation="vertical" size={6} style={{ width: '100%' }}>
                  {selectedSubscriptions.map((s) => (
                    <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                      <div style={{ fontSize: 12.5 }}>
                        <div className="text-strong">{s.code}</div>
                        <div className="text-muted">
                          {formatDate(s.startDate)} → {formatDate(s.endDate)} · {formatMoney(s.priceVnd)}
                        </div>
                      </div>
                      <SubscriptionStatusTag subscription={s} />
                    </div>
                  ))}
                </Space>
              )}
            </Card>

            <Card size="small" title="Phiên gửi xe gần đây">
              {selectedSessions.length === 0 ? (
                <div className="text-muted">Chưa có phiên gửi xe.</div>
              ) : (
                <Space orientation="vertical" size={6} style={{ width: '100%' }}>
                  {selectedSessions.map((s) => (
                    <div key={s.id} style={{ fontSize: 12.5 }}>
                      <span className="text-strong">{s.plate}</span>{' '}
                      <span className="text-muted">
                        {formatDateTime(s.checkInAt)} {s.checkOutAt ? `→ ${formatDateTime(s.checkOutAt)}` : '(đang gửi)'} · {formatMoney(s.feeVnd ?? 0)}
                      </span>
                    </div>
                  ))}
                </Space>
              )}
            </Card>
          </Space>
        ) : null}
      </Drawer>

      <Modal
        open={formOpen}
        title={editing ? 'Cập nhật khách hàng' : 'Thêm khách hàng'}
        okText={editing ? 'Lưu thay đổi' : 'Tạo khách hàng'}
        cancelText="Đóng"
        okButtonProps={{ loading: savingCustomer }}
        onCancel={() => setFormOpen(false)}
        onOk={() => void submitCustomer()}
        destroyOnHidden
      >
        <Form form={customerForm} layout="vertical" requiredMark={false}>
          <Form.Item name="name" label="Tên khách hàng" rules={[{ required: true, message: 'Nhập tên khách hàng' }]}>
            <Input placeholder="VD: Trần Anh Tuấn / Công ty TNHH Thắng Lợi" />
          </Form.Item>
          <Form.Item name="phone" label="Số điện thoại" rules={[{ required: true, message: 'Nhập số điện thoại' }]}>
            <Input placeholder="VD: 0912345671" />
          </Form.Item>
          <Form.Item name="note" label="Ghi chú">
            <Input.TextArea rows={2} placeholder="VD: Liên hệ anh Thắng — 2 xe" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={vehicleOpen}
        title={vehicleEditing ? `Cập nhật xe ${vehicleEditing.plate}` : 'Thêm xe cho khách'}
        okText={vehicleEditing ? 'Lưu thay đổi' : 'Thêm xe'}
        cancelText="Đóng"
        okButtonProps={{ loading: savingVehicle }}
        onCancel={() => setVehicleOpen(false)}
        onOk={() => void submitVehicle()}
        destroyOnHidden
      >
        <Form form={vehicleForm} layout="vertical" requiredMark={false}>
          <Form.Item name="plate" label="Biển số" rules={[{ required: true, message: 'Nhập biển số' }]}>
            <Input placeholder="VD: 30A-123.45" style={{ textTransform: 'uppercase' }} />
          </Form.Item>
          <Form.Item name="vehicleType" label="Loại xe" rules={[{ required: true }]}>
            <Segmented
              options={[
                { value: 'CAR', label: 'Ô tô' },
                { value: 'MOTORBIKE', label: 'Xe máy' },
              ]}
            />
          </Form.Item>
          <Form.Item name="brandModel" label="Dòng xe">
            <Input placeholder="VD: Toyota Camry" />
          </Form.Item>
          <Form.Item name="color" label="Màu xe">
            <Input placeholder="VD: Đen" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
