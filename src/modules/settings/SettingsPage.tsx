import { useEffect, useState } from 'react';
import { Alert, Button, Card, Divider, Form, Input, Modal, Progress, Slider, Space, Switch, Typography, Upload } from 'antd';
import { CloudDownloadOutlined, CloudUploadOutlined, DeleteOutlined, SaveOutlined, SettingOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRole } from '../../app/RoleContext';
import { useAction } from '../../hooks/useAction';
import {
  DEFAULT_AI_CONFIG,
  DEFAULT_PARKING_INFO,
  DEFAULT_PRINT_CONFIG,
  getSetting,
  SETTING_KEYS,
  upsertSetting,
} from '../../services/settings';
import type { AiConfig, ParkingInfo, PrintConfig } from '../../types';
import { buildBackup, importBackup, resetToSeed } from '../../services/backup';
import { formatBytes, formatDateTime } from '../../utils/format';
import { can } from '../../services/permissions';

export function SettingsPage() {
  const { actor, role } = useRole();
  const info = useLiveQuery(() => getSetting<ParkingInfo>(SETTING_KEYS.PARKING_INFO, DEFAULT_PARKING_INFO), [], DEFAULT_PARKING_INFO);
  const aiConfig = useLiveQuery(() => getSetting<AiConfig>(SETTING_KEYS.AI_CONFIG, DEFAULT_AI_CONFIG), [], DEFAULT_AI_CONFIG);
  const printConfig = useLiveQuery(() => getSetting<PrintConfig>(SETTING_KEYS.PRINT_CONFIG, DEFAULT_PRINT_CONFIG), [], DEFAULT_PRINT_CONFIG);

  const [infoForm] = Form.useForm<ParkingInfo>();
  const [autoPlate, setAutoPlate] = useState<boolean | null>(null);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [ticketFooter, setTicketFooter] = useState<string | null>(null);
  const [receiptFooter, setReceiptFooter] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState('');
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);

  const { loading: savingInfo, run: runSaveInfo } = useAction();
  const { loading: savingAi, run: runSaveAi } = useAction();
  const { loading: savingPrint, run: runSavePrint } = useAction();
  const { loading: backingUp, run: runBackup } = useAction();
  const { loading: restoring, run: runRestore } = useAction();

  const [infoLoaded, setInfoLoaded] = useState(false);
  useEffect(() => {
    if (infoLoaded || !info) return;
    infoForm.setFieldsValue(info);
    setAutoPlate(aiConfig.autoPlateEnabled);
    setThreshold(aiConfig.confidenceThreshold);
    setTicketFooter(printConfig.ticketFooter ?? '');
    setReceiptFooter(printConfig.receiptFooter ?? '');
    setInfoLoaded(true);
    void navigator.storage?.estimate?.().then((est) => {
      if (est.usage != null && est.quota != null) setStorage({ usage: est.usage, quota: est.quota });
    });
  }, [infoLoaded, info, aiConfig, printConfig, infoForm]);

  const manageAllowed = can(role, 'settings.manage');

  const saveInfo = async () => {
    const values = await infoForm.validateFields();
    await runSaveInfo(() => upsertSetting(actor, SETTING_KEYS.PARKING_INFO, values), { successMessage: 'Đã lưu thông tin bãi xe.' });
  };

  const saveAi = async () => {
    await runSaveAi(
      () =>
        upsertSetting(actor, SETTING_KEYS.AI_CONFIG, {
          autoPlateEnabled: autoPlate ?? true,
          confidenceThreshold: threshold ?? 90,
        }),
      { successMessage: 'Đã lưu cấu hình nhận diện biển số.' },
    );
  };

  const savePrint = async () => {
    await runSavePrint(
      () => upsertSetting(actor, SETTING_KEYS.PRINT_CONFIG, { ticketFooter, receiptFooter }),
      { successMessage: 'Đã lưu mẫu in.' },
    );
  };

  const downloadBackup = async () => {
    await runBackup(async () => {
      const payload = await buildBackup();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `parkone-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, { successMessage: 'Đã xuất bản sao lưu.' });
  };

  const handleImport = async (file: File) => {
    await runRestore(
      async () => {
        const text = await file.text();
        await importBackup(text);
      },
      {
        successMessage: 'Đã khôi phục dữ liệu từ bản sao lưu.',
        onSuccess: () => window.setTimeout(() => window.location.reload(), 600),
      },
    );
  };

  return (
    <div>
      <div className="page-toolbar" style={{ justifyContent: 'space-between' }}>
        <Typography.Text type="secondary">
          Cấu hình vận hành bãi xe. Vai trò hiện tại: <strong>{actor.name}</strong>
        </Typography.Text>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 14, alignItems: 'start' }}>
        <Card
          size="small"
          title={
            <Space>
              <SettingOutlined /> Thông tin bãi xe
            </Space>
          }
          extra={
            <Button size="small" type="primary" icon={<SaveOutlined />} loading={savingInfo} disabled={!manageAllowed} onClick={() => void saveInfo()}>
              Lưu
            </Button>
          }
        >
          <Form form={infoForm} layout="vertical" requiredMark={false}>
            <Form.Item name="name" label="Tên bãi xe" rules={[{ required: true, message: 'Nhập tên bãi xe' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="address" label="Địa chỉ">
              <Input />
            </Form.Item>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <Form.Item name="phone" label="Hotline">
                <Input />
              </Form.Item>
              <Form.Item name="openTime" label="Giờ mở cửa">
                <Input placeholder="06:00" />
              </Form.Item>
              <Form.Item name="closeTime" label="Giờ đóng cửa">
                <Input placeholder="23:00" />
              </Form.Item>
            </div>
            <Form.Item name="slogan" label="Slogan">
              <Input />
            </Form.Item>
          </Form>
        </Card>

        <Card
          size="small"
          title="Nhận diện biển số (AI)"
          extra={
            <Button size="small" type="primary" icon={<SaveOutlined />} loading={savingAi} disabled={!manageAllowed} onClick={() => void saveAi()}>
              Lưu
            </Button>
          }
        >
          <Space orientation="vertical" size={10} style={{ width: '100%' }}>
            <Space align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
              <span>Tự động nhận diện biển số ở làn vào</span>
              <Switch checked={autoPlate ?? true} onChange={(v) => setAutoPlate(v)} />
            </Space>
            <div>
              <div className="text-muted" style={{ marginBottom: 2 }}>
                Ngưỡng tin cậy tối thiểu: <strong>{threshold ?? 90}%</strong>
              </div>
              <Slider min={80} max={99} value={threshold ?? 90} onChange={(v) => setThreshold(v)} />
              <div className="text-muted" style={{ fontSize: 12 }}>
                Kết quả nhận diện dưới ngưỡng sẽ yêu cầu nhân viên xác nhận thủ công trước khi mở barrier.
              </div>
            </div>
            <Alert type="info" showIcon title="Đây là mô phỏng cấu hình. Bản demo dùng nút “Quét biển số (AI)” ở làn vào để minh hoạ luồng nhận diện." />
          </Space>
        </Card>

        <Card
          size="small"
          title="Mẫu in"
          extra={
            <Button size="small" type="primary" icon={<SaveOutlined />} loading={savingPrint} disabled={!manageAllowed} onClick={() => void savePrint()}>
              Lưu
            </Button>
          }
        >
          <Space orientation="vertical" size={10} style={{ width: '100%' }}>
            <div>
              <div className="text-muted" style={{ marginBottom: 4 }}>Ghi chú cuối phiếu gửi xe</div>
              <Input.TextArea rows={2} value={ticketFooter ?? ''} onChange={(e) => setTicketFooter(e.target.value)} />
            </div>
            <div>
              <div className="text-muted" style={{ marginBottom: 4 }}>Ghi chú cuối hoá đơn</div>
              <Input.TextArea rows={2} value={receiptFooter ?? ''} onChange={(e) => setReceiptFooter(e.target.value)} />
            </div>
          </Space>
        </Card>

        <Card size="small" title="Dữ liệu & sao lưu">
          <Space orientation="vertical" size={10} style={{ width: '100%' }}>
            <Typography.Text type="secondary">
              Dữ liệu demo lưu trong IndexedDB của trình duyệt này. Xuất bản sao lưu JSON để chuyển sang máy khác hoặc lưu trữ.
            </Typography.Text>
            {storage ? (
              <div>
                <div className="text-muted" style={{ fontSize: 12, marginBottom: 4 }}>
                  Đã dùng {formatBytes(storage.usage)} / {formatBytes(storage.quota)}
                </div>
                <Progress percent={Math.min(100, Number(((storage.usage / storage.quota) * 100).toFixed(2)))} status="normal" />
              </div>
            ) : null}
            <Space wrap>
              <Button icon={<CloudDownloadOutlined />} loading={backingUp} onClick={() => void downloadBackup()}>
                Xuất bản sao lưu
              </Button>
              <Upload
                accept=".json"
                showUploadList={false}
                beforeUpload={(file) => {
                  void handleImport(file as unknown as File);
                  return false;
                }}
              >
                <Button icon={<CloudUploadOutlined />} loading={restoring}>
                  Khôi phục từ file
                </Button>
              </Upload>
              <Button danger icon={<DeleteOutlined />} disabled={!manageAllowed} onClick={() => { setResetText(''); setResetOpen(true); }}>
                Khôi phục dữ liệu mẫu
              </Button>
            </Space>
            <Divider style={{ margin: '4px 0' }} />
            <div className="text-muted" style={{ fontSize: 12.5 }}>
              <div>
                <strong>ParkOne</strong> — sản phẩm demo của KhoaDev
              </div>
              <div>khoadev.vn · khoadev.company@gmail.com</div>
              <div>Cập nhật gần nhất: {formatDateTime(new Date().toISOString())}</div>
            </div>
          </Space>
        </Card>
      </div>

      <Modal
        open={resetOpen}
        title="Khôi phục dữ liệu mẫu"
        okText="Xoá toàn bộ và tạo lại dữ liệu mẫu"
        okButtonProps={{ danger: true, disabled: resetText !== 'XOA' }}
        cancelText="Đóng"
        onCancel={() => setResetOpen(false)}
        onOk={async () => {
          await resetToSeed();
          window.location.reload();
        }}
      >
        <Space orientation="vertical" size={10} style={{ width: '100%' }}>
          <Alert
            type="error"
            showIcon
            title="Toàn bộ dữ liệu đang lưu trong trình duyệt sẽ bị xoá"
            description="Sau khi xoá, hệ thống tạo lại bộ dữ liệu mẫu đầy đủ (xe đang gửi, vé tháng, giao dịch, ca trực...). Nên xuất bản sao lưu trước khi làm việc này."
          />
          <div>
            Nhập <strong>XOA</strong> để xác nhận:
            <Input value={resetText} onChange={(e) => setResetText(e.target.value.toUpperCase())} placeholder="XOA" />
          </div>
        </Space>
      </Modal>
    </div>
  );
}
