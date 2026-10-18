import { useMemo, useState } from 'react';
import { Alert, Button, Card, Drawer, Input, Modal, Segmented, Select, Space, Tag, Tooltip, Typography } from 'antd';
import { AppstoreOutlined, CarOutlined, ClockCircleOutlined, ToolOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs from 'dayjs';
import { db } from '../../db/database';
import { useRole } from '../../app/RoleContext';
import { useAction } from '../../hooks/useAction';
import { computeFee, moveSession, setSlotStatus, updateSessionNote } from '../../services/parking';
import { DEFAULT_PRICING, getSetting, SETTING_KEYS } from '../../services/settings';
import { TICKET_TYPE_LABEL, VEHICLE_TYPE_LABEL } from '../../utils/status';
import { formatDateTime, formatDuration } from '../../utils/format';
import { formatMoney } from '../../utils/money';
import type { ParkingSession, Slot } from '../../types';
import styles from './Map.module.scss';

export function MapPage() {
  const navigate = useNavigate();
  const { actor } = useRole();
  const zones = useLiveQuery(() => db.zones.filter((z) => z.active).toArray(), [], []);
  const slots = useLiveQuery(() => db.slots.toArray(), [], []);
  const activeSessions = useLiveQuery(() => db.sessions.where('status').equals('IN').toArray(), [], []);
  const pricing = useLiveQuery(() => getSetting(SETTING_KEYS.PRICING, DEFAULT_PRICING), [], DEFAULT_PRICING);

  const [zoneId, setZoneId] = useState<string | undefined>(undefined);
  const currentZone = zones.find((z) => z.id === zoneId) ?? zones[0];

  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<string | undefined>();
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');

  const { loading: moving, run: runMove } = useAction();
  const { loading: noting, run: runNote } = useAction();
  const { loading: toggling, run: runToggle } = useAction();

  const sessionBySlot = useMemo(() => {
    const map = new Map<string, ParkingSession>();
    for (const s of activeSessions) map.set(s.slotId, s);
    return map;
  }, [activeSessions]);

  const zoneSlots = useMemo(
    () =>
      slots
        .filter((s) => s.zoneId === currentZone?.id)
        .sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true })),
    [slots, currentZone],
  );

  const stats = useMemo(() => {
    const occupied = zoneSlots.filter((s) => sessionBySlot.has(s.id)).length;
    const maintenance = zoneSlots.filter((s) => s.baseStatus === 'MAINTENANCE').length;
    return {
      total: zoneSlots.length,
      occupied,
      maintenance,
      available: zoneSlots.length - occupied - maintenance,
    };
  }, [zoneSlots, sessionBySlot]);

  const selectedSlot: Slot | undefined = slots.find((s) => s.id === selectedSlotId);
  const selectedSession = selectedSlot ? sessionBySlot.get(selectedSlot.id) : undefined;

  const selectedFeePreview = useMemo(() => {
    if (!selectedSession) return null;
    return computeFee(selectedSession.checkInAt, new Date().toISOString(), selectedSession.vehicleType, pricing);
  }, [selectedSession, pricing]);

  const freeSlotsInZone = useMemo(() => {
    if (!selectedSession) return [];
    return zoneSlots
      .filter((s) => s.id !== selectedSession.slotId && s.baseStatus === 'AVAILABLE' && !sessionBySlot.has(s.id))
      .map((s) => ({ value: s.id, label: s.code }));
  }, [zoneSlots, selectedSession, sessionBySlot]);

  const closeDrawer = () => {
    setSelectedSlotId(null);
    setMoveOpen(false);
    setMoveTarget(undefined);
    setNoteOpen(false);
    setNoteText('');
  };

  const isOverstay = (session: ParkingSession) => dayjs().diff(dayjs(session.checkInAt), 'hour') >= 24;

  return (
    <div>
      <div className="page-toolbar" style={{ justifyContent: 'space-between' }}>
        <Space wrap>
          <Segmented
            value={currentZone?.id}
            onChange={(v) => {
              setZoneId(String(v));
              closeDrawer();
            }}
            options={zones.map((z) => ({
              value: z.id,
              label: (
                <span>
                  <AppstoreOutlined /> Khu {z.code}
                </span>
              ),
            }))}
          />
          <Typography.Text type="secondary">{currentZone?.name} · {currentZone?.floor}</Typography.Text>
        </Space>
        <Space size={14} className={styles.legend}>
          <span>
            <i className={styles.dotFree} /> Trống
          </span>
          <span>
            <i className={styles.dotBusy} /> Đang đỗ
          </span>
          <span>
            <i className={styles.dotOver} /> Quá 24h
          </span>
          <span>
            <i className={styles.dotFix} /> Bảo trì
          </span>
        </Space>
      </div>

      <div className={styles.statsRow}>
        <div className={styles.statBox}>
          <div className={styles.statLabel}>Tổng chỗ</div>
          <div className={styles.statValue}>{stats.total}</div>
        </div>
        <div className={styles.statBox}>
          <div className={styles.statLabel}>Đang đỗ</div>
          <div className={styles.statValue} style={{ color: '#0f766e' }}>{stats.occupied}</div>
        </div>
        <div className={styles.statBox}>
          <div className={styles.statLabel}>Còn trống</div>
          <div className={styles.statValue} style={{ color: '#2f9e44' }}>{stats.available}</div>
        </div>
        <div className={styles.statBox}>
          <div className={styles.statLabel}>Bảo trì</div>
          <div className={styles.statValue} style={{ color: '#8a97a8' }}>{stats.maintenance}</div>
        </div>
        <div className={styles.statBox}>
          <div className={styles.statLabel}>Tỷ lệ lấp đầy</div>
          <div className={styles.statValue}>{stats.total > 0 ? Math.round((stats.occupied / stats.total) * 100) : 0}%</div>
        </div>
      </div>

      <Card size="small" title={`Sơ đồ ${currentZone?.name ?? ''}`}>
        <div className={styles.grid}>
          {zoneSlots.map((slot) => {
            const session = sessionBySlot.get(slot.id);
            const over = session ? isOverstay(session) : false;
            const cls = [
              styles.cell,
              slot.baseStatus === 'MAINTENANCE' ? styles.cellFix : session ? (over ? styles.cellOver : styles.cellBusy) : styles.cellFree,
              selectedSlotId === slot.id ? styles.cellSelected : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <Tooltip
                key={slot.id}
                title={
                  session
                    ? `${session.plate} — vào ${formatDateTime(session.checkInAt)}${over ? ' (quá 24h)' : ''}`
                    : slot.baseStatus === 'MAINTENANCE'
                      ? `Chỗ ${slot.code} đang bảo trì`
                      : `Chỗ ${slot.code} còn trống`
                }
              >
                <button type="button" className={cls} onClick={() => setSelectedSlotId(slot.id)}>
                  <span className={styles.cellCode}>{slot.code}</span>
                  {session ? <span className={styles.cellPlate}>{session.plate}</span> : null}
                  {slot.baseStatus === 'MAINTENANCE' ? <ToolOutlined className={styles.cellIcon} /> : null}
                </button>
              </Tooltip>
            );
          })}
        </div>
      </Card>

      <Drawer
        open={!!selectedSlot}
        onClose={closeDrawer}
        size="default"
        title={selectedSlot ? `Chỗ ${selectedSlot.code}` : ''}
      >
        {selectedSlot && !selectedSession ? (
          <Space orientation="vertical" size={12} style={{ width: '100%' }}>
            {selectedSlot.baseStatus === 'MAINTENANCE' ? (
              <>
                <Alert type="warning" showIcon title="Chỗ này đang bảo trì" description="Hoàn tất sửa chữa và cho chỗ hoạt động trở lại khi sẵn sàng." />
                <Button
                  block
                  loading={toggling}
                  onClick={() =>
                    void runToggle(() => setSlotStatus(actor, selectedSlot.id, 'AVAILABLE'), {
                      successMessage: `Chỗ ${selectedSlot.code} đã hoạt động trở lại.`,
                      onSuccess: closeDrawer,
                    })
                  }
                >
                  Cho chỗ hoạt động trở lại
                </Button>
              </>
            ) : (
              <>
                <Alert type="success" showIcon title={`Chỗ ${selectedSlot.code} đang trống`} description="Bạn có thể cho xe vào chỗ này ngay." />
                <Button type="primary" block icon={<CarOutlined />} onClick={() => navigate(`/gate?tab=in&slot=${selectedSlot.id}`)}>
                  Cho xe vào chỗ này
                </Button>
                <Button
                  block
                  danger
                  loading={toggling}
                  onClick={() =>
                    void runToggle(() => setSlotStatus(actor, selectedSlot.id, 'MAINTENANCE'), {
                      successMessage: `Chỗ ${selectedSlot.code} chuyển sang bảo trì.`,
                      onSuccess: closeDrawer,
                    })
                  }
                >
                  Chuyển sang bảo trì
                </Button>
              </>
            )}
          </Space>
        ) : null}

        {selectedSlot && selectedSession ? (
          <Space orientation="vertical" size={12} style={{ width: '100%' }}>
            <div className={styles.sessionCard}>
              <div className={styles.sessionPlate}>{selectedSession.plate}</div>
              <div className="text-muted">
                {VEHICLE_TYPE_LABEL[selectedSession.vehicleType]} · {TICKET_TYPE_LABEL[selectedSession.ticketType]}
              </div>
              <div className={styles.sessionFee}>
                {selectedFeePreview ? (
                  selectedSession.ticketType === 'SUBSCRIPTION' ? (
                    <Tag color="green">Vé tháng — miễn phí</Tag>
                  ) : (
                    <span>
                      Phí tạm tính: <strong>{formatMoney(selectedFeePreview.totalVnd)}</strong>
                    </span>
                  )
                ) : null}
              </div>
            </div>

            <table className={styles.infoTable}>
              <tbody>
                <tr>
                  <td>Mã phiếu</td>
                  <td>{selectedSession.code}</td>
                </tr>
                <tr>
                  <td>Giờ vào</td>
                  <td>{formatDateTime(selectedSession.checkInAt)}</td>
                </tr>
                <tr>
                  <td>Thời gian gửi</td>
                  <td>
                    {formatDuration(selectedSession.checkInAt, new Date().toISOString())}
                    {isOverstay(selectedSession) ? <Tag color="red" style={{ marginInlineStart: 6 }} icon={<ClockCircleOutlined />}>Quá 24h</Tag> : null}
                  </td>
                </tr>
                {selectedSession.note ? (
                  <tr>
                    <td>Ghi chú</td>
                    <td>{selectedSession.note}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>

            <Button type="primary" block icon={<CarOutlined />} onClick={() => navigate(`/gate?tab=out&plate=${encodeURIComponent(selectedSession.plate)}`)}>
              Cho xe ra (thu phí)
            </Button>
            <Button block onClick={() => setMoveOpen(true)} disabled={freeSlotsInZone.length === 0}>
              Chuyển sang chỗ khác {freeSlotsInZone.length === 0 ? '(hết chỗ trống)' : ''}
            </Button>
            <Button
              block
              onClick={() => {
                setNoteText(selectedSession.note ?? '');
                setNoteOpen(true);
              }}
            >
              Ghi chú phiên gửi xe
            </Button>
          </Space>
        ) : null}
      </Drawer>

      <Modal
        open={moveOpen}
        title={`Chuyển xe ${selectedSession?.plate ?? ''} sang chỗ khác`}
        okText="Xác nhận chuyển"
        cancelText="Đóng"
        okButtonProps={{ disabled: !moveTarget, loading: moving }}
        onCancel={() => {
          setMoveOpen(false);
          setMoveTarget(undefined);
        }}
        onOk={() => {
          if (!selectedSession || !moveTarget) return;
          void runMove(() => moveSession(actor, selectedSession.id, moveTarget), {
            successMessage: 'Đã chuyển chỗ đỗ.',
            onSuccess: () => {
              setMoveOpen(false);
              setMoveTarget(undefined);
            },
          });
        }}
      >
        <Space orientation="vertical" size={8} style={{ width: '100%' }}>
          <div className="text-muted">Chọn chỗ trống trong cùng khu. Xe sẽ được ghi nhận chuyển chỗ trong nhật ký.</div>
          <Select
            style={{ width: '100%' }}
            placeholder="Chọn chỗ trống"
            value={moveTarget}
            onChange={setMoveTarget}
            options={freeSlotsInZone}
            showSearch
            optionFilterProp="label"
          />
        </Space>
      </Modal>

      <Modal
        open={noteOpen}
        title={`Ghi chú — ${selectedSession?.plate ?? ''}`}
        okText="Lưu ghi chú"
        cancelText="Đóng"
        okButtonProps={{ loading: noting }}
        onCancel={() => setNoteOpen(false)}
        onOk={() => {
          if (!selectedSession) return;
          void runNote(() => updateSessionNote(actor, selectedSession.id, noteText), {
            successMessage: 'Đã lưu ghi chú.',
            onSuccess: () => setNoteOpen(false),
          });
        }}
      >
        <Input.TextArea rows={3} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="VD: Xe có vết xước cửa trước, đã chụp ảnh lúc nhận..." />
      </Modal>
    </div>
  );
}
