import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Input,
  Modal,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  CameraOutlined,
  CarOutlined,
  IdcardOutlined,
  LoginOutlined,
  LogoutOutlined,
  ScanOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs from 'dayjs';
import { db } from '../../db/database';
import { useRole } from '../../app/RoleContext';
import { useAction } from '../../hooks/useAction';
import { checkInVehicle, checkoutSession, computeFee, findActiveSessionByPlate } from '../../services/parking';
import { DEFAULT_PRICING, getSetting, SETTING_KEYS } from '../../services/settings';
import { PrintPreview } from '../../components/PrintPreview';
import { PrintLetterhead } from '../../components/PrintLetterhead';
import { VEHICLE_TYPE_LABEL } from '../../utils/status';
import { formatDateTime, formatDuration, formatTime } from '../../utils/format';
import { formatMoney } from '../../utils/money';
import { guessVehicleType, normalizePlate, normalizeText, pickRandom, randomInt } from '../../utils/text';
import type { Customer, ParkingSession, PaymentMethod, Subscription, Vehicle, VehicleType } from '../../types';
import styles from './Gate.module.scss';

type GateMode = 'in' | 'out';

interface PlateDetection {
  activeSession?: ParkingSession;
  subscription?: Subscription;
  vehicle?: Vehicle;
  customer?: Customer;
}

function buildRandomPlate(vt: VehicleType): string {
  if (vt === 'CAR') {
    return `${pickRandom(['30A', '30E', '30F', '30G', '29H', '51F', '29X', '30S'])}-${randomInt(100, 999)}.${randomInt(10, 99)}`;
  }
  return `29-${pickRandom(['B', 'F', 'G', 'H', 'K', 'L'])}${randomInt(1, 9)} ${randomInt(100, 999)}.${randomInt(10, 99)}`;
}

export function GatePage() {
  const { actor } = useRole();
  const [params, setParams] = useSearchParams();
  const mode: GateMode = params.get('tab') === 'out' ? 'out' : 'in';

  const pricing = useLiveQuery(() => getSetting(SETTING_KEYS.PRICING, DEFAULT_PRICING), [], DEFAULT_PRICING);
  const zones = useLiveQuery(() => db.zones.toArray(), [], []);
  const slots = useLiveQuery(() => db.slots.toArray(), [], []);
  const activeSessions = useLiveQuery(() => db.sessions.where('status').equals('IN').toArray(), [], []);

  // ----- Làn vào -----
  const [inPlate, setInPlate] = useState('');
  const [inType, setInType] = useState<VehicleType>('CAR');
  const [inSlotId, setInSlotId] = useState<string | undefined>(undefined);
  const [inNote, setInNote] = useState('');
  const [detection, setDetection] = useState<PlateDetection | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ plate: string; confidence: number; vehicleType: VehicleType; matchedName?: string } | null>(null);
  const [ticketSession, setTicketSession] = useState<ParkingSession | null>(null);

  // ----- Làn ra -----
  const [outPlate, setOutPlate] = useState('');
  const [outSession, setOutSession] = useState<ParkingSession | null>(null);
  const [outNotFound, setOutNotFound] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [lostTicket, setLostTicket] = useState(false);
  const [cashGiven, setCashGiven] = useState<number | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [receipt, setReceipt] = useState<Awaited<ReturnType<typeof checkoutSession>> | null>(null);

  const [inSearch, setInSearch] = useState('');

  const { loading: checkingIn, run: runCheckIn } = useAction();
  const { loading: checkingOut, run: runCheckOut } = useAction();

  // Điền sẵn biển số / chỗ khi được điều hướng từ sơ đồ bãi
  useEffect(() => {
    const plate = params.get('plate');
    const slot = params.get('slot');
    if (mode === 'in') {
      if (plate) setInPlate(plate);
      if (slot) setInSlotId(slot);
    } else if (plate) {
      setOutPlate(plate);
    }
  }, [params, mode]);

  // Nhận diện thông minh khi nhập biển làn vào
  useEffect(() => {
    let mounted = true;
    const normalized = normalizePlate(inPlate);
    if (normalized.length < 5) {
      setDetection(null);
      return;
    }
    (async () => {
      const activeSession = await findActiveSessionByPlate(inPlate);
      let vehicle: Vehicle | undefined;
      let subscription: Subscription | undefined;
      let customer: Customer | undefined;
      const veh = await db.vehicles.where('normalizedPlate').equals(normalized).first();
      if (veh) {
        vehicle = veh;
        const subs = await db.subscriptions.where('vehicleId').equals(veh.id).toArray();
        subscription = subs
          .filter((s) => s.status === 'ACTIVE' && dayjs(s.endDate).isAfter(dayjs()))
          .sort((a, b) => (a.endDate < b.endDate ? 1 : -1))[0];
        if (veh.customerId) customer = await db.customers.get(veh.customerId);
      }
      if (mounted) setDetection({ activeSession, subscription, vehicle, customer });
    })();
    return () => {
      mounted = false;
    };
  }, [inPlate, activeSessions]);

  const freeSlotsByZone = useMemo(() => {
    const occupied = new Set(activeSessions.map((s) => s.slotId));
    return zones
      .filter((z) => z.vehicleType === inType)
      .map((zone) => ({
        label: `${zone.name} — ${zone.floor}`,
        options: slots
          .filter((s) => s.zoneId === zone.id && s.baseStatus === 'AVAILABLE' && !occupied.has(s.id))
          .map((s) => ({ value: s.id, label: s.code })),
      }));
  }, [zones, slots, activeSessions, inType]);

  const firstFreeSlot = useMemo(() => {
    for (const group of freeSlotsByZone) {
      if (group.options.length > 0) return group.options[0].value;
    }
    return undefined;
  }, [freeSlotsByZone]);

  const startScan = () => {
    setScanOpen(true);
    setScanning(true);
    setScanResult(null);
    window.setTimeout(async () => {
      const cars = await db.vehicles.filter((v) => v.vehicleType === 'CAR').toArray();
      const motos = await db.vehicles.filter((v) => v.vehicleType === 'MOTORBIKE').toArray();
      const useKnown = Math.random() < 0.55;
      let plate: string;
      let vehicleType: VehicleType;
      let matchedName: string | undefined;
      if (useKnown && cars.length + motos.length > 0) {
        const vt: VehicleType = Math.random() < 0.45 ? 'CAR' : 'MOTORBIKE';
        const vehicle = pickRandom(vt === 'CAR' ? cars : motos);
        plate = vehicle.plate;
        vehicleType = vehicle.vehicleType;
        if (vehicle.customerId) {
          const customer = await db.customers.get(vehicle.customerId);
          matchedName = customer?.name;
        }
      } else {
        vehicleType = Math.random() < 0.5 ? 'CAR' : 'MOTORBIKE';
        plate = buildRandomPlate(vehicleType);
      }
      setScanResult({ plate, confidence: randomInt(92, 98), vehicleType, matchedName });
      setScanning(false);
    }, 1300);
  };

  const useScanResult = () => {
    if (!scanResult) return;
    setInPlate(scanResult.plate);
    setInType(scanResult.vehicleType);
    setScanOpen(false);
  };

  const submitCheckIn = async () => {
    if (!inSlotId) return;
    const result = await runCheckIn(
      (operationId) =>
        checkInVehicle(
          actor,
          { plate: inPlate.trim().toUpperCase(), vehicleType: inType, slotId: inSlotId, note: inNote },
          operationId,
        ),
      { onSuccess: (session) => setTicketSession(session) },
    );
    if (result) {
      setInPlate('');
      setInNote('');
      setInSlotId(undefined);
      setDetection(null);
    }
  };

  const findOutSession = async () => {
    const session = await findActiveSessionByPlate(outPlate);
    if (!session) {
      setOutSession(null);
      setOutNotFound(true);
    } else {
      setOutNotFound(false);
      setOutSession(session);
    }
  };

  const preview = useMemo(() => {
    if (!outSession) return null;
    const fee = computeFee(outSession.checkInAt, new Date().toISOString(), outSession.vehicleType, pricing);
    const surcharge = lostTicket ? pricing.lostTicket[outSession.vehicleType] ?? 0 : 0;
    const covered = outSession.ticketType === 'SUBSCRIPTION';
    const total = (covered ? 0 : fee.totalVnd) + surcharge;
    return { fee, surcharge, covered, total };
  }, [outSession, pricing, lostTicket]);

  const doCheckout = async () => {
    if (!outSession) return;
    await runCheckOut((operationId) => checkoutSession(actor, { sessionId: outSession.id, method, lostTicket }, operationId), {
      onSuccess: (res) => {
        setReceipt(res);
        setCheckoutOpen(false);
        setOutSession(null);
        setOutPlate('');
        setLostTicket(false);
        setCashGiven(null);
        setMethod('CASH');
      },
    });
  };

  const activeRows = useMemo(() => {
    const kw = normalizeText(inSearch);
    return activeSessions
      .filter((s) => !kw || normalizeText(s.plate).includes(kw) || normalizeText(s.code).includes(kw))
      .sort((a, b) => (a.checkInAt < b.checkInAt ? 1 : -1));
  }, [activeSessions, inSearch]);

  const setMode = (next: GateMode) => {
    const p = new URLSearchParams();
    p.set('tab', next);
    setParams(p, { replace: true });
    setOutSession(null);
    setOutNotFound(false);
  };

  const change = cashGiven != null && preview ? Math.max(0, cashGiven - preview.total) : null;

  return (
    <div>
      <div className="page-toolbar" style={{ justifyContent: 'space-between' }}>
        <Segmented<GateMode>
          value={mode}
          onChange={(v) => setMode(v)}
          options={[
            { value: 'in', label: <span><LoginOutlined /> &nbsp;LÀN VÀO</span> },
            { value: 'out', label: <span><LogoutOutlined /> &nbsp;LÀN RA</span> },
          ]}
          size="large"
        />
        <Typography.Text type="secondary">
          Nhân viên trực: <strong>{actor.name}</strong>
        </Typography.Text>
      </div>

      <div className={styles.gateGrid}>
        <div>
          {mode === 'in' ? (
            <Card title="Thông tin xe vào" size="small">
              <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                <div>
                  <div className={styles.fieldLabel}>Biển số xe</div>
                  <Space.Compact style={{ width: '100%' }}>
                    <Input
                      size="large"
                      placeholder="VD: 30A-123.45 hoặc 29-B2 456.78"
                      value={inPlate}
                      onChange={(e) => setInPlate(e.target.value.toUpperCase())}
                      onBlur={() => {
                        if (inPlate.trim().length >= 5) setInType(guessVehicleType(inPlate));
                      }}
                      prefix={<CarOutlined />}
                      allowClear
                    />
                    <Button size="large" icon={<ScanOutlined />} onClick={startScan}>
                      Quét biển số (AI)
                    </Button>
                  </Space.Compact>
                </div>

                {detection?.activeSession ? (
                  <Alert
                    type="error"
                    showIcon
                    title={`Xe ${detection.activeSession.plate} đang trong bãi`}
                    description={
                      <span>
                        Chỗ{' '}
                        <strong>{slots.find((s) => s.id === detection.activeSession!.slotId)?.code ?? '?'}</strong> · vào lúc{' '}
                        {formatDateTime(detection.activeSession.checkInAt)}. Nếu cần, chuyển sang{' '}
                        <a onClick={() => { setMode('out'); setOutPlate(detection.activeSession!.plate); }}>làn ra</a> để xử lý.
                      </span>
                    }
                  />
                ) : null}

                {!detection?.activeSession && detection?.subscription ? (
                  <Alert
                    type="success"
                    showIcon
                    icon={<IdcardOutlined />}
                    title={`Khách vé tháng: ${detection.customer?.name ?? detection.vehicle?.plate}`}
                    description={`Vé ${detection.subscription.code} hiệu lực đến ${dayjs(detection.subscription.endDate).format('DD/MM/YYYY')} — gửi xe không thu phí.`}
                  />
                ) : null}

                <div className={styles.twoCols}>
                  <div>
                    <div className={styles.fieldLabel}>Loại xe</div>
                    <Segmented<VehicleType>
                      value={inType}
                      onChange={(v) => {
                        setInType(v);
                        setInSlotId(undefined);
                      }}
                      options={[
                        { value: 'CAR', label: VEHICLE_TYPE_LABEL.CAR },
                        { value: 'MOTORBIKE', label: VEHICLE_TYPE_LABEL.MOTORBIKE },
                      ]}
                      block
                    />
                  </div>
                  <div>
                    <div className={styles.fieldLabel}>
                      Chỗ đỗ{' '}
                      <Tooltip title="Chỉ hiện các chỗ trống của khu phù hợp với loại xe.">
                        <span className="text-muted">(chỗ trống theo khu)</span>
                      </Tooltip>
                    </div>
                    <Space.Compact style={{ width: '100%' }}>
                      <Select
                        style={{ width: '100%' }}
                        placeholder="Chọn chỗ đỗ"
                        value={inSlotId}
                        onChange={setInSlotId}
                        options={freeSlotsByZone}
                        showSearch
                        optionFilterProp="label"
                      />
                      <Button
                        icon={<ThunderboltOutlined />}
                        disabled={!firstFreeSlot}
                        onClick={() => setInSlotId(firstFreeSlot)}
                      >
                        Tự động
                      </Button>
                    </Space.Compact>
                  </div>
                </div>

                <div>
                  <div className={styles.fieldLabel}>Ghi chú (tuỳ chọn)</div>
                  <Input.TextArea
                    rows={2}
                    placeholder="VD: Xe tải nhỏ, cần lối rộng..."
                    value={inNote}
                    onChange={(e) => setInNote(e.target.value)}
                  />
                </div>

                <Button
                  type="primary"
                  size="large"
                  icon={<LoginOutlined />}
                  block
                  disabled={!inPlate.trim() || !inSlotId || Boolean(detection?.activeSession)}
                  loading={checkingIn}
                  onClick={submitCheckIn}
                >
                  Cho xe vào
                </Button>
              </Space>
            </Card>
          ) : (
            <Card title="Thông tin xe ra" size="small">
              <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                <div>
                  <div className={styles.fieldLabel}>Biển số xe</div>
                  <Space.Compact style={{ width: '100%' }}>
                    <Input
                      size="large"
                      placeholder="Nhập biển số để tìm phiên gửi xe"
                      value={outPlate}
                      onChange={(e) => setOutPlate(e.target.value.toUpperCase())}
                      onPressEnter={findOutSession}
                      prefix={<CarOutlined />}
                      allowClear
                    />
                    <Button size="large" type="primary" ghost onClick={findOutSession}>
                      Tìm phiên
                    </Button>
                  </Space.Compact>
                </div>

                {outNotFound ? (
                  <Alert
                    type="warning"
                    showIcon
                    title="Không tìm thấy xe đang gửi với biển số này"
                    description="Kiểm tra lại biển số, hoặc xử lý mất vé tại mục Sự cố. Bảng bên phải hiển thị toàn bộ xe đang trong bãi."
                  />
                ) : null}

                {outSession && preview ? (
                  <>
                    <div className={styles.sessionBox}>
                      <div className={styles.sessionHead}>
                        <div>
                          <div className={styles.sessionPlate}>{outSession.plate}</div>
                          <div className="text-muted">
                            {VEHICLE_TYPE_LABEL[outSession.vehicleType]} · chỗ{' '}
                            {slots.find((s) => s.id === outSession.slotId)?.code ?? '?'} ·{' '}
                            {outSession.ticketType === 'SUBSCRIPTION' ? <Tag color="green">Vé tháng</Tag> : <Tag>Vé lượt</Tag>}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div className="text-muted">Vào lúc</div>
                          <div className="text-strong">{formatDateTime(outSession.checkInAt)}</div>
                        </div>
                      </div>
                      <div className={styles.feeTable}>
                        <div>
                          <span>Thời gian gửi</span>
                          <strong>{formatDuration(outSession.checkInAt, new Date().toISOString())}</strong>
                        </div>
                        {preview.covered ? (
                          <div>
                            <span>Phí gửi xe</span>
                            <strong style={{ color: '#2f9e44' }}>Miễn phí — khách vé tháng</strong>
                          </div>
                        ) : preview.fee.isFree ? (
                          <div>
                            <span>Phí gửi xe</span>
                            <strong style={{ color: '#2f9e44' }}>Miễn phí (trong {preview.fee.minutes} phút đầu)</strong>
                          </div>
                        ) : (
                          <>
                            <div>
                              <span>
                                {pricing[outSession.vehicleType === 'CAR' ? 'car' : 'motorbike'].firstRateHours} giờ đầu
                              </span>
                              <strong>{formatMoney(preview.fee.baseVnd)}</strong>
                            </div>
                            {preview.fee.extraHours > 0 ? (
                              <div>
                                <span>{preview.fee.extraHours} giờ tiếp theo</span>
                                <strong>{formatMoney(preview.fee.extraVnd)}</strong>
                              </div>
                            ) : null}
                            {preview.fee.rawVnd > preview.fee.capVnd ? (
                              <div>
                                <span>Giảm theo mức tối đa/ngày</span>
                                <strong>-{formatMoney(preview.fee.rawVnd - preview.fee.capVnd)}</strong>
                              </div>
                            ) : null}
                          </>
                        )}
                        {lostTicket ? (
                          <div>
                            <span>Phụ phí mất vé</span>
                            <strong>{formatMoney(preview.surcharge)}</strong>
                          </div>
                        ) : null}
                        <div className={styles.feeTotal}>
                          <span>Tổng thanh toán</span>
                          <strong>{formatMoney(preview.total)}</strong>
                        </div>
                      </div>
                    </div>

                    <Space wrap>
                      <span className={styles.fieldLabel}>Hình thức thanh toán:</span>
                      <Segmented<PaymentMethod>
                        value={method}
                        onChange={(v) => setMethod(v)}
                        options={[
                          { value: 'CASH', label: 'Tiền mặt' },
                          { value: 'TRANSFER', label: 'Chuyển khoản' },
                          { value: 'CARD', label: 'Thẻ' },
                        ]}
                      />
                    </Space>

                    <Checkbox checked={lostTicket} onChange={(e) => setLostTicket(e.target.checked)}>
                      Khách báo mất vé (phụ thu {formatMoney(pricing.lostTicket[outSession.vehicleType] ?? 0)})
                    </Checkbox>

                    <Button
                      type="primary"
                      size="large"
                      icon={<LogoutOutlined />}
                      block
                      loading={checkingOut}
                      onClick={() => {
                        if (preview.total === 0) {
                          void doCheckout();
                        } else {
                          setCashGiven(preview.total);
                          setCheckoutOpen(true);
                        }
                      }}
                    >
                      {preview.total === 0 ? 'Xác nhận cho xe ra (không thu phí)' : `Thu tiền & mở barrier — ${formatMoney(preview.total)}`}
                    </Button>
                  </>
                ) : null}
              </Space>
            </Card>
          )}
        </div>

        <div>
          <Card
            title={
              <Space>
                <span>Xe đang trong bãi</span>
                <Tag color="cyan">{activeSessions.length} xe</Tag>
              </Space>
            }
            size="small"
            extra={
              <Input
                size="small"
                placeholder="Tìm biển số..."
                value={inSearch}
                onChange={(e) => setInSearch(e.target.value)}
                style={{ width: 160 }}
                allowClear
              />
            }
          >
            <Table<ParkingSession>
              size="small"
              rowKey="id"
              dataSource={activeRows.slice(0, 9)}
              pagination={false}
              locale={{ emptyText: 'Không có xe nào phù hợp.' }}
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
                {
                  title: 'Chỗ',
                  render: (_, row) => slots.find((s) => s.id === row.slotId)?.code ?? '—',
                  width: 60,
                },
                {
                  title: 'Vào lúc',
                  render: (_, row) => formatTime(row.checkInAt),
                  width: 70,
                },
                {
                  title: '',
                  width: 90,
                  render: (_, row) => (
                    <Button
                      size="small"
                      type="link"
                      onClick={() => {
                        setMode('out');
                        setOutPlate(row.plate);
                        setOutSession(row);
                        setOutNotFound(false);
                      }}
                    >
                      Cho ra
                    </Button>
                  ),
                },
              ]}
            />
            {activeRows.length > 9 ? (
              <div className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>
                Hiển thị 9 / {activeRows.length} xe. Xem đầy đủ tại mục <a href="#/sessions">Phiên gửi xe</a>.
              </div>
            ) : null}
          </Card>
        </div>
      </div>

      {/* Modal quét biển số giả lập */}
      <Modal open={scanOpen} onCancel={() => setScanOpen(false)} footer={null} title="Camera nhận diện biển số" width={520}>
        <div className={styles.scanBox}>
          <div className={styles.scanPlate}>{scanning ? 'Đang nhận diện…' : scanResult?.plate}</div>
          {scanning ? <div className={styles.scanLine} /> : null}
          {!scanning && scanResult ? (
            <div className={styles.scanMeta}>
              Độ tin cậy {scanResult.confidence}%
              {scanResult.matchedName ? ` · Khớp khách hàng: ${scanResult.matchedName}` : ' · Xe chưa có trong hệ thống'}
            </div>
          ) : null}
          <CameraOutlined className={styles.scanIcon} />
        </div>
        <Space style={{ marginTop: 12, width: '100%', justifyContent: 'space-between' }}>
          <Button icon={<ScanOutlined />} onClick={startScan} disabled={scanning}>
            Quét lại
          </Button>
          <Space>
            <Button onClick={() => setScanOpen(false)}>Nhập tay</Button>
            <Button type="primary" disabled={scanning || !scanResult} onClick={useScanResult}>
              Dùng biển số này
            </Button>
          </Space>
        </Space>
      </Modal>

      {/* Modal thanh toán làn ra */}
      <Modal
        open={checkoutOpen && !!preview}
        title="Xác nhận thanh toán"
        onCancel={() => setCheckoutOpen(false)}
        okText="Xác nhận thu tiền"
        cancelText="Quay lại"
        okButtonProps={{ loading: checkingOut }}
        onOk={() => void doCheckout()}
      >
        {preview ? (
          <Space orientation="vertical" size={10} style={{ width: '100%' }}>
            <div className={styles.feeTable}>
              <div>
                <span>Xe</span>
                <strong>{outSession?.plate}</strong>
              </div>
              <div className={styles.feeTotal}>
                <span>Tổng thanh toán</span>
                <strong>{formatMoney(preview.total)}</strong>
              </div>
            </div>
            {method === 'CASH' ? (
              <>
                <div className={styles.fieldLabel}>Khách đưa</div>
                <Space wrap>
                  {[20000, 50000, 100000, 200000, 500000].map((v) => (
                    <Button key={v} size="small" onClick={() => setCashGiven(v)} type={cashGiven === v ? 'primary' : 'default'}>
                      {v.toLocaleString('vi-VN')}đ
                    </Button>
                  ))}
                  <Input
                    size="small"
                    style={{ width: 130 }}
                    placeholder="Số khác"
                    value={cashGiven ?? ''}
                    onChange={(e) => setCashGiven(Number(e.target.value.replace(/[^\d]/g, '')) || null)}
                  />
                </Space>
                <div>
                  Tiền thối:{' '}
                  <strong style={{ color: change && change > 0 ? '#0f766e' : undefined }}>{change != null ? formatMoney(change) : '—'}</strong>
                </div>
              </>
            ) : (
              <div className="text-muted">Khách thanh toán bằng {method === 'TRANSFER' ? 'chuyển khoản' : 'thẻ'} — xác nhận khi đã nhận đủ tiền.</div>
            )}
          </Space>
        ) : null}
      </Modal>

      {/* Phiếu gửi xe sau khi cho vào */}
      <PrintPreview open={!!ticketSession} onClose={() => setTicketSession(null)} title="Phiếu gửi xe" printLabel="In phiếu gửi xe">
        {ticketSession ? (
          <>
            <PrintLetterhead
              right={
                <div>
                  <div>
                    <strong>PHIẾU GỬI XE</strong>
                  </div>
                  <div>Mã phiếu: <strong>{ticketSession.code}</strong></div>
                </div>
              }
            />
            <h2>Phiếu gửi xe</h2>
            <table>
              <tbody>
                <tr>
                  <th style={{ width: '38%' }}>Biển số xe</th>
                  <td>
                    <strong style={{ fontSize: 16 }}>{ticketSession.plate}</strong>
                  </td>
                </tr>
                <tr>
                  <th>Loại xe</th>
                  <td>{VEHICLE_TYPE_LABEL[ticketSession.vehicleType]}</td>
                </tr>
                <tr>
                  <th>Chỗ đỗ</th>
                  <td>
                    {slots.find((s) => s.id === ticketSession.slotId)?.code} — {zones.find((z) => z.id === ticketSession.zoneId)?.name}
                  </td>
                </tr>
                <tr>
                  <th>Thời gian vào</th>
                  <td>{formatDateTime(ticketSession.checkInAt)}</td>
                </tr>
                <tr>
                  <th>Hình thức</th>
                  <td>{ticketSession.ticketType === 'SUBSCRIPTION' ? 'Khách vé tháng — miễn phí theo vé' : 'Vé lượt theo bảng giá niêm yết'}</td>
                </tr>
              </tbody>
            </table>
            <div style={{ marginTop: 10, fontSize: 12.5 }}>
              <em>Vui lòng giữ phiếu để làm thủ tục ra xe. Mất phiếu phụ thu theo quy định của bãi xe.</em>
            </div>
            <div className="print-signatures">
              <div>Khách gửi xe</div>
              <div>Nhân viên bãi</div>
            </div>
          </>
        ) : null}
      </PrintPreview>

      {/* Hoá đơn sau khi cho ra */}
      <PrintPreview open={!!receipt} onClose={() => setReceipt(null)} title="Hoá đơn thanh toán" printLabel="In hoá đơn">
        {receipt ? (
          <>
            <PrintLetterhead
              right={
                <div>
                  <div>
                    <strong>HOÁ ĐƠN THANH TOÁN</strong>
                  </div>
                  <div>Mã HĐ: <strong>{receipt.payment?.code ?? receipt.session.code}</strong></div>
                  <div>{formatDateTime(receipt.session.checkOutAt)}</div>
                </div>
              }
            />
            <h2>Hoá đơn gửi xe</h2>
            <table>
              <tbody>
                <tr>
                  <th style={{ width: '38%' }}>Biển số xe</th>
                  <td>
                    <strong>{receipt.session.plate}</strong> ({VEHICLE_TYPE_LABEL[receipt.session.vehicleType]})
                  </td>
                </tr>
                <tr>
                  <th>Thời gian gửi</th>
                  <td>
                    {formatDateTime(receipt.session.checkInAt)} → {formatDateTime(receipt.session.checkOutAt)} (
                    {formatDuration(receipt.session.checkInAt, receipt.session.checkOutAt)})
                  </td>
                </tr>
                {receipt.coveredBySubscription ? (
                  <tr>
                    <th>Phí gửi xe</th>
                    <td style={{ color: '#2f9e44' }}>Miễn phí — khách vé tháng</td>
                  </tr>
                ) : (
                  <>
                    <tr>
                      <th>Giá cơ bản</th>
                      <td className="amount">{formatMoney(receipt.fee.baseVnd)}</td>
                    </tr>
                    {receipt.fee.extraHours > 0 ? (
                      <tr>
                        <th>{receipt.fee.extraHours} giờ tiếp theo</th>
                        <td className="amount">{formatMoney(receipt.fee.extraVnd)}</td>
                      </tr>
                    ) : null}
                  </>
                )}
                {receipt.surchargeVnd > 0 ? (
                  <tr>
                    <th>Phụ phí mất vé</th>
                    <td className="amount">{formatMoney(receipt.surchargeVnd)}</td>
                  </tr>
                ) : null}
                <tr>
                  <th>Tổng thanh toán</th>
                  <td className="amount">
                    <strong>{formatMoney(receipt.totalVnd)}</strong>
                  </td>
                </tr>
                <tr>
                  <th>Hình thức</th>
                  <td>{receipt.payment ? (receipt.payment.method === 'CASH' ? 'Tiền mặt' : receipt.payment.method === 'TRANSFER' ? 'Chuyển khoản' : 'Thẻ') : 'Không thu phí'}</td>
                </tr>
                <tr>
                  <th>Thu ngân</th>
                  <td>{actor.name}</td>
                </tr>
              </tbody>
            </table>
            <div style={{ marginTop: 10, fontSize: 12.5 }}>
              <em>Cảm ơn quý khách đã sử dụng dịch vụ!</em>
            </div>
            <div className="print-signatures">
              <div>Khách hàng</div>
              <div>Thu ngân</div>
            </div>
          </>
        ) : null}
      </PrintPreview>
    </div>
  );
}
