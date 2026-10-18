import { Alert, Badge, Card, Space, Tag, Tooltip, Typography } from 'antd';
import {
  AlertOutlined,
  CalendarOutlined,
  CarOutlined,
  DollarOutlined,
  IdcardOutlined,
  LoginOutlined,
  LogoutOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { getDashboardData } from '../../repositories/dashboard';
import { formatDateTime } from '../../utils/format';
import { formatMoney } from '../../utils/money';
import { MiniBarChart, RatioBar } from '../../components/charts';
import styles from './Dashboard.module.scss';

export function DashboardPage() {
  const navigate = useNavigate();
  const data = useLiveQuery(() => getDashboardData(), []);

  if (!data) {
    return <Card loading />;
  }

  const deltaPct =
    data.revenueYesterdayVnd > 0
      ? Math.round(((data.revenueTodayVnd - data.revenueYesterdayVnd) / data.revenueYesterdayVnd) * 100)
      : data.revenueTodayVnd > 0
        ? 100
        : 0;

  const kpis = [
    {
      key: 'active',
      label: 'Xe đang trong bãi',
      icon: <CarOutlined />,
      value: data.activeCount,
      hint: `Sức chứa ${data.totalSlots} chỗ · Bảo trì ${data.maintenanceSlots}`,
      onClick: () => navigate('/sessions'),
    },
    {
      key: 'available',
      label: 'Chỗ trống',
      icon: <CarOutlined />,
      value: data.availableSlots,
      hint: 'Cập nhật trực tiếp theo sơ đồ bãi',
      onClick: () => navigate('/map'),
    },
    {
      key: 'in',
      label: 'Lượt vào hôm nay',
      icon: <LoginOutlined />,
      value: data.checkedInToday,
      hint: 'Tính từ 00:00 hôm nay',
      onClick: () => navigate('/sessions'),
    },
    {
      key: 'out',
      label: 'Lượt ra hôm nay',
      icon: <LogoutOutlined />,
      value: data.checkedOutToday,
      hint: 'Đã hoàn tất thu phí',
      onClick: () => navigate('/sessions?tab=history'),
    },
    {
      key: 'revenue',
      label: 'Doanh thu hôm nay',
      icon: <DollarOutlined />,
      value: formatMoney(data.revenueTodayVnd),
      hint: `So với hôm qua: ${deltaPct >= 0 ? '+' : ''}${deltaPct}%`,
      onClick: () => navigate('/cashier'),
    },
    {
      key: 'overstay',
      label: 'Xe quá 24 giờ',
      icon: <WarningOutlined />,
      value: data.overstayRows.length,
      hint: 'Cần liên hệ chủ xe hoặc xử lý phụ phí',
      danger: data.overstayRows.length > 0,
      onClick: () => navigate('/sessions?overstay=1'),
    },
  ];

  const hourlyItems = data.hourlyFlows.map((h) => ({
    label: `${h.hour}h`,
    value: h.inCount,
    value2: h.outCount,
    tooltip: (
      <span>
        {h.hour}h — vào <strong>{h.inCount}</strong> · ra <strong>{h.outCount}</strong>
      </span>
    ),
    sub: h.inCount + h.outCount > 0 ? `${h.inCount}/${h.outCount}` : undefined,
  }));

  const revenueItems = data.revenueByDay.map((d) => ({
    label: d.label,
    value: d.vnd,
    tooltip: `${d.label}: ${formatMoney(d.vnd)}`,
  }));

  const mixTotal = data.mix30d.sessionVnd + data.mix30d.subscriptionVnd + data.mix30d.incidentVnd;

  const hasAlerts = data.overstayRows.length > 0 || data.expiringRows.length > 0 || data.openIncidents > 0;

  return (
    <div>
      <div className="page-toolbar" style={{ justifyContent: 'space-between' }}>
        <Space>
          <Typography.Text type="secondary">
            Bảng điều khiển bãi xe — cập nhật trực tiếp theo dữ liệu đang lưu trên trình duyệt
          </Typography.Text>
        </Space>
        <Space>
          <Badge count={data.openIncidents} size="small">
            <Tag color={data.openIncidents > 0 ? 'red' : 'default'} icon={<AlertOutlined />}>
              Sự cố chưa xử lý: {data.openIncidents}
            </Tag>
          </Badge>
        </Space>
      </div>

      <div className={styles.kpiGrid}>
        {kpis.map((kpi) => (
          <div
            key={kpi.key}
            className={styles.kpiCard}
            onClick={kpi.onClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && kpi.onClick()}
          >
            <div className={styles.kpiLabel}>
              {kpi.icon} {kpi.label}
            </div>
            <div className={styles.kpiValue} style={kpi.danger ? { color: '#d64545' } : undefined}>
              {kpi.value}
            </div>
            <div className={styles.kpiHint}>{kpi.hint}</div>
          </div>
        ))}
      </div>

      <div className={styles.moneyRow}>
        <div className={styles.moneyCard} onClick={() => navigate('/reports')}>
          <div className={styles.moneyLabel}>
            <DollarOutlined /> Doanh thu 7 ngày
          </div>
          <div className={styles.moneyValue}>{formatMoney(data.revenue7dVnd)}</div>
          <div className={styles.kpiHint}>Vé lượt, vé tháng và phụ phí</div>
        </div>
        <div className={styles.moneyCard} onClick={() => navigate('/subscriptions')}>
          <div className={styles.moneyLabel}>
            <IdcardOutlined /> Vé tháng đang hiệu lực
          </div>
          <div className={styles.moneyValue}>{data.activeSubscriptions}</div>
          <div className={styles.kpiHint}>Khách đang dùng vé định kỳ</div>
        </div>
        <div className={styles.moneyCard} onClick={() => navigate('/subscriptions?filter=expiring')}>
          <div className={styles.moneyLabel}>
            <CalendarOutlined /> Sắp hết hạn (≤ 7 ngày)
          </div>
          <div className={styles.moneyValue} style={{ color: data.expiringRows.length > 0 ? '#c2410c' : undefined }}>
            {data.expiringRows.length}
          </div>
          <div className={styles.kpiHint}>Nhắc khách gia hạn để không mất vé</div>
        </div>
        <div className={styles.moneyCard} onClick={() => navigate('/reports')}>
          <div className={styles.moneyLabel}>Doanh thu tháng này</div>
          <div className={styles.moneyValue}>{formatMoney(data.revenueMonthVnd)}</div>
          <div className={styles.kpiHint}>Từ đầu tháng đến hiện tại</div>
        </div>
      </div>

      <div className={styles.columns}>
        <div>
          <Card title="Lưu lượng theo giờ hôm nay" size="small" style={{ marginBottom: 14 }}>
            <MiniBarChart items={hourlyItems} height={120} formatValue={(v) => `${v} lượt`} legend={[
              { label: 'Xe vào', color: '#0f766e' },
              { label: 'Xe ra', color: '#5eead4' },
            ]} />
            <div className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>
              Số nhỏ dưới mỗi cột: vào/ra. Mặc định khung giờ 6h–22h.
            </div>
          </Card>

          <Card title="Doanh thu 7 ngày gần đây" size="small" style={{ marginBottom: 14 }}>
            <MiniBarChart items={revenueItems} height={120} formatValue={(v) => formatMoney(v)} />
          </Card>

          <Card title="Cơ cấu doanh thu 30 ngày" size="small">
            <RatioBar label="Vé lượt" value={data.mix30d.sessionVnd} total={mixTotal} color="#0f766e" suffix={formatMoney(data.mix30d.sessionVnd)} />
            <RatioBar label="Vé tháng" value={data.mix30d.subscriptionVnd} total={mixTotal} color="#0ea5e9" suffix={formatMoney(data.mix30d.subscriptionVnd)} />
            <RatioBar label="Phụ phí sự cố" value={data.mix30d.incidentVnd} total={mixTotal} color="#e8930c" suffix={formatMoney(data.mix30d.incidentVnd)} />
          </Card>
        </div>

        <div>
          <Card title="Cảnh báo cần xử lý" size="small" style={{ marginBottom: 14 }}>
            {!hasAlerts ? (
              <Alert type="success" showIcon title="Không có cảnh báo nào. Bãi xe đang vận hành trơn tru." />
            ) : (
              <Space orientation="vertical" style={{ width: '100%' }} size={4}>
                {data.overstayRows.slice(0, 5).map((row) => (
                  <div key={row.session.id} className={styles.alertItem}>
                    <WarningOutlined style={{ color: '#d64545', marginTop: 3 }} />
                    <div>
                      <a onClick={() => navigate(`/sessions?q=${encodeURIComponent(row.session.plate)}`)}>
                        <strong>{row.session.plate}</strong> — đỗ quá {row.hours} giờ (chỗ {row.slot?.code ?? '?'})
                      </a>
                      <div className="text-muted">Vào lúc {formatDateTime(row.session.checkInAt)}</div>
                    </div>
                  </div>
                ))}
                {data.expiringRows.slice(0, 5).map((row) => (
                  <div key={row.subscription.id} className={styles.alertItem}>
                    <CalendarOutlined style={{ color: '#e8930c', marginTop: 3 }} />
                    <div>
                      <a onClick={() => navigate('/subscriptions?filter=expiring')}>
                        Vé tháng <strong>{row.vehicle?.plate}</strong> {row.daysLeft < 0 ? 'đã hết hạn' : `còn ${row.daysLeft} ngày`}
                      </a>
                      <div className="text-muted">
                        {row.customer?.name} · {row.subscription.code}
                      </div>
                    </div>
                  </div>
                ))}
                {data.openIncidents > 0 ? (
                  <div className={styles.alertItem}>
                    <AlertOutlined style={{ color: '#d64545', marginTop: 3 }} />
                    <div>
                      <a onClick={() => navigate('/incidents')}>
                        <strong>{data.openIncidents}</strong> sự cố chưa xử lý
                      </a>
                    </div>
                  </div>
                ) : null}
              </Space>
            )}
          </Card>

          <Card title="Hoạt động gần đây" size="small">
            {data.recentLogs.length === 0 ? (
              <div className="text-muted">Chưa có hoạt động nào.</div>
            ) : (
              <div>
                {data.recentLogs.map((item) => (
                  <div key={item.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '7px 0', borderBottom: '1px dashed #edf1f6' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Tooltip title={item.summary}>
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.summary}</span>
                      </Tooltip>
                      <span className="text-muted">
                        {formatDateTime(item.at)} · {item.actorName}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
