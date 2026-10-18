import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, DatePicker, Divider, Form, InputNumber, Segmented, Space, Typography } from 'antd';
import type { FormInstance } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs, { type Dayjs } from 'dayjs';
import { useRole } from '../../app/RoleContext';
import { useAction } from '../../hooks/useAction';
import { computeFee } from '../../services/parking';
import { DEFAULT_PRICING, DEFAULT_SUBSCRIPTION_PLANS, getSetting, SETTING_KEYS, upsertSetting } from '../../services/settings';
import { PLAN_LABEL, VEHICLE_TYPE_LABEL } from '../../utils/status';
import { formatMoney } from '../../utils/money';
import type { PricingConfig, SubscriptionPlanDef, VehicleType } from '../../types';

interface VehiclePricingFields {
  freeMinutes: number;
  firstRateVnd: number;
  firstRateHours: number;
  extraPerHourVnd: number;
  dayCapVnd: number;
}

export function PricingPage() {
  const { actor } = useRole();
  const pricing = useLiveQuery(() => getSetting<PricingConfig>(SETTING_KEYS.PRICING, DEFAULT_PRICING), [], DEFAULT_PRICING);
  const plans = useLiveQuery(() => getSetting<SubscriptionPlanDef[]>(SETTING_KEYS.SUBSCRIPTION_PLANS, DEFAULT_SUBSCRIPTION_PLANS), [], DEFAULT_SUBSCRIPTION_PLANS);

  const [carForm] = Form.useForm<VehiclePricingFields>();
  const [motoForm] = Form.useForm<VehiclePricingFields>();
  const [lostCar, setLostCar] = useState<number>(pricing.lostTicket.CAR);
  const [lostMoto, setLostMoto] = useState<number>(pricing.lostTicket.MOTORBIKE);
  const [planPrices, setPlanPrices] = useState<Record<string, { CAR: number; MOTORBIKE: number }>>(
    Object.fromEntries(DEFAULT_SUBSCRIPTION_PLANS.map((p) => [p.id, { ...p.price }])),
  );

  // Máy tính thử phí
  const [calcType, setCalcType] = useState<VehicleType>('CAR');
  const [calcIn, setCalcIn] = useState<Dayjs>(dayjs().subtract(3, 'hour'));
  const [calcOut, setCalcOut] = useState<Dayjs>(dayjs());

  const { loading: saving, run: runSave } = useAction();

  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (initialized) return;
    carForm.setFieldsValue(pricing.car);
    motoForm.setFieldsValue(pricing.motorbike);
    setLostCar(pricing.lostTicket.CAR);
    setLostMoto(pricing.lostTicket.MOTORBIKE);
    setPlanPrices(Object.fromEntries(plans.map((p) => [p.id, { ...p.price }])));
    setInitialized(true);
  }, [initialized, pricing, plans, carForm, motoForm]);

  const calcFee = useMemo(
    () => computeFee(calcIn.toISOString(), calcOut.toISOString(), calcType, pricing),
    [calcIn, calcOut, calcType, pricing],
  );

  const saveAll = async () => {
    const car = await carForm.validateFields();
    const moto = await motoForm.validateFields();
    const nextPricing: PricingConfig = {
      car,
      motorbike: moto,
      lostTicket: { CAR: lostCar, MOTORBIKE: lostMoto },
    };
    const nextPlans: SubscriptionPlanDef[] = plans.map((p) => ({ ...p, price: planPrices[p.id] ?? p.price }));
    await runSave(
      async () => {
        await upsertSetting(actor, SETTING_KEYS.PRICING, nextPricing);
        await upsertSetting(actor, SETTING_KEYS.SUBSCRIPTION_PLANS, nextPlans);
      },
      { successMessage: 'Đã lưu bảng giá mới.' },
    );
  };

  const pricingFields = (form: FormInstance<VehiclePricingFields>) => (
    <Form form={form} layout="vertical" requiredMark={false}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
        <Form.Item name="freeMinutes" label="Miễn phí (phút đầu)">
          <InputNumber<number> min={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="firstRateVnd" label="Giá bậc 1 (VND)">
          <InputNumber<number> min={0} step={1000} style={{ width: '100%' }} formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')} parser={(v) => Number((v ?? '0').replace(/\./g, ''))} />
        </Form.Item>
        <Form.Item name="firstRateHours" label="Số giờ bậc 1">
          <InputNumber<number> min={1} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="extraPerHourVnd" label="Giá mỗi giờ tiếp (VND)">
          <InputNumber<number> min={0} step={1000} style={{ width: '100%' }} formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')} parser={(v) => Number((v ?? '0').replace(/\./g, ''))} />
        </Form.Item>
        <Form.Item name="dayCapVnd" label="Tối đa/ngày (VND)">
          <InputNumber<number> min={0} step={10000} style={{ width: '100%' }} formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')} parser={(v) => Number((v ?? '0').replace(/\./g, ''))} />
        </Form.Item>
      </div>
    </Form>
  );

  return (
    <div>
      <div className="page-toolbar" style={{ justifyContent: 'space-between' }}>
        <Typography.Text type="secondary">
          Bảng giá áp dụng ngay khi lưu — phiên đang gửi vẫn tính theo đúng bậc giá tại thời điểm ra xe.
        </Typography.Text>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void saveAll()}>
          Lưu bảng giá
        </Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 14, alignItems: 'start' }}>
        <Card size="small" title={`Giá gửi xe — ${VEHICLE_TYPE_LABEL.CAR}`}>
          {pricingFields(carForm)}
          <Divider style={{ margin: '8px 0 12px' }} />
          <Space align="center">
            <span className="text-muted">Phụ phí mất vé:</span>
            <InputNumber<number>
              value={lostCar}
              onChange={(v) => setLostCar(v ?? 0)}
              min={0}
              step={10000}
              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
              parser={(v) => Number((v ?? '0').replace(/\./g, ''))}
            />
            <span className="text-muted">VND</span>
          </Space>
        </Card>

        <Card size="small" title={`Giá gửi xe — ${VEHICLE_TYPE_LABEL.MOTORBIKE}`}>
          {pricingFields(motoForm)}
          <Divider style={{ margin: '8px 0 12px' }} />
          <Space align="center">
            <span className="text-muted">Phụ phí mất vé:</span>
            <InputNumber<number>
              value={lostMoto}
              onChange={(v) => setLostMoto(v ?? 0)}
              min={0}
              step={5000}
              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
              parser={(v) => Number((v ?? '0').replace(/\./g, ''))}
            />
            <span className="text-muted">VND</span>
          </Space>
        </Card>
      </div>

      <Card size="small" title="Giá vé tháng theo gói" style={{ marginTop: 14 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '6px 4px', color: '#6b7a8d', fontWeight: 500 }}>Gói</th>
              <th style={{ textAlign: 'left', padding: '6px 4px', color: '#6b7a8d', fontWeight: 500 }}>Ô tô (VND)</th>
              <th style={{ textAlign: 'left', padding: '6px 4px', color: '#6b7a8d', fontWeight: 500 }}>Xe máy (VND)</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => (
              <tr key={plan.id} style={{ borderTop: '1px dashed #edf1f6' }}>
                <td style={{ padding: '6px 4px' }}>{PLAN_LABEL[plan.id] ?? plan.name}</td>
                <td style={{ padding: '6px 4px' }}>
                  <InputNumber<number>
                    value={planPrices[plan.id]?.CAR ?? plan.price.CAR}
                    onChange={(v) => setPlanPrices((prev) => ({ ...prev, [plan.id]: { ...prev[plan.id], CAR: v ?? 0 } }))}
                    min={0}
                    step={100000}
                    style={{ width: 150 }}
                    formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                    parser={(v) => Number((v ?? '0').replace(/\./g, ''))}
                  />
                </td>
                <td style={{ padding: '6px 4px' }}>
                  <InputNumber<number>
                    value={planPrices[plan.id]?.MOTORBIKE ?? plan.price.MOTORBIKE}
                    onChange={(v) => setPlanPrices((prev) => ({ ...prev, [plan.id]: { ...prev[plan.id], MOTORBIKE: v ?? 0 } }))}
                    min={0}
                    step={10000}
                    style={{ width: 150 }}
                    formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                    parser={(v) => Number((v ?? '0').replace(/\./g, ''))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card size="small" title="Máy tính thử phí" style={{ marginTop: 14 }}>
        <Space wrap size={10}>
          <Segmented<VehicleType>
            value={calcType}
            onChange={(v) => setCalcType(v)}
            options={[
              { value: 'CAR', label: 'Ô tô' },
              { value: 'MOTORBIKE', label: 'Xe máy' },
            ]}
          />
          <DatePicker showTime value={calcIn} onChange={(v) => v && setCalcIn(v)} format="DD/MM/YYYY HH:mm" allowClear={false} />
          <span>→</span>
          <DatePicker showTime value={calcOut} onChange={(v) => v && setCalcOut(v)} format="DD/MM/YYYY HH:mm" allowClear={false} />
        </Space>
        <Alert
          style={{ marginTop: 12 }}
          type="info"
          showIcon
          title={
            calcFee.isFree
              ? `Miễn phí — gửi ${calcFee.minutes} phút (trong ${pricing[calcType === 'CAR' ? 'car' : 'motorbike'].freeMinutes} phút đầu)`
              : `Phí dự kiến: ${formatMoney(calcFee.totalVnd)} cho ${calcFee.hours} giờ gửi`
          }
          description={
            calcFee.isFree ? null : (
              <span>
                Bậc 1: {formatMoney(calcFee.baseVnd)}
                {calcFee.extraHours > 0 ? ` · ${calcFee.extraHours} giờ tiếp: ${formatMoney(calcFee.extraVnd)}` : ''} · Mức tối đa/ngày:{' '}
                {formatMoney(calcFee.capVnd)}
              </span>
            )
          }
        />
      </Card>
    </div>
  );
}
