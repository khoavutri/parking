import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Layout, Menu, Select, Tag, Tooltip } from 'antd';
import {
  AlertOutlined,
  AppstoreOutlined,
  BarChartOutlined,
  CarOutlined,
  DashboardOutlined,
  DollarOutlined,
  IdcardOutlined,
  SettingOutlined,
  SwapOutlined,
  TagsOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { canViewRoute, useRole } from '../../app/RoleContext';
import { GlobalSearch } from '../../components/GlobalSearch';
import { ROLE_LABEL } from '../../utils/status';
import { DEFAULT_PARKING_INFO, getSetting, SETTING_KEYS, type ParkingInfo } from '../../services/settings';
import type { RoleId } from '../../types';
import styles from './MainLayout.module.scss';

interface MenuEntry {
  key: string;
  icon?: ReactNode;
  label: ReactNode;
}

export function MainLayout() {
  const { role, actor, options, setRole } = useRole();
  const navigate = useNavigate();
  const location = useLocation();
  const info = useLiveQuery(() => getSetting<ParkingInfo>(SETTING_KEYS.PARKING_INFO, DEFAULT_PARKING_INFO), [], DEFAULT_PARKING_INFO);
  const parkingName = info?.name ?? DEFAULT_PARKING_INFO.name;

  const items = useMemo(() => {
    const groups: Array<{ key: string; label: string; children: MenuEntry[] }> = [
      {
        key: 'g-dashboard',
        label: 'Tổng quan',
        children: [{ key: '/dashboard', icon: <DashboardOutlined />, label: 'Tổng quan' }],
      },
      {
        key: 'g-operations',
        label: 'Vận hành',
        children: [
          { key: '/gate', icon: <SwapOutlined />, label: 'Làn vào / làn ra' },
          { key: '/sessions', icon: <CarOutlined />, label: 'Phiên gửi xe' },
          { key: '/map', icon: <AppstoreOutlined />, label: 'Sơ đồ bãi' },
          { key: '/incidents', icon: <AlertOutlined />, label: 'Sự cố' },
        ],
      },
      {
        key: 'g-customers',
        label: 'Khách & vé',
        children: [
          { key: '/customers', icon: <TeamOutlined />, label: 'Khách hàng' },
          { key: '/subscriptions', icon: <IdcardOutlined />, label: 'Vé tháng' },
        ],
      },
      {
        key: 'g-finance',
        label: 'Tài chính',
        children: [{ key: '/cashier', icon: <DollarOutlined />, label: 'Thu ngân & ca trực' }],
      },
      {
        key: 'g-admin',
        label: 'Quản trị',
        children: [
          { key: '/reports', icon: <BarChartOutlined />, label: 'Báo cáo' },
          { key: '/pricing', icon: <TagsOutlined />, label: 'Bảng giá' },
          { key: '/settings', icon: <SettingOutlined />, label: 'Thiết lập' },
        ],
      },
    ];
    return groups
      .map((group) => ({
        ...group,
        children: group.children.filter((c) => canViewRoute(role, c.key)),
      }))
      .filter((group) => group.children.length > 0);
  }, [role]);

  const selectedKeys = useMemo(() => {
    const path = location.pathname;
    const flat = items.flatMap((g) => g.children.map((c) => c.key));
    const match = flat.filter((k) => path.startsWith(k)).sort((a, b) => b.length - a.length)[0];
    return match ? [match] : [];
  }, [items, location.pathname]);

  const openKeys = useMemo(() => items.filter((g) => g.children.some((c) => selectedKeys.includes(c.key))).map((g) => g.key), [items, selectedKeys]);

  const contentRef = useRef<HTMLElement>(null);

  // Đổi trang thì đưa vùng nội dung về đầu, không ảnh hưởng sider/header
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <Layout className="parkone-layout">
      <Layout.Sider width={236} className={styles.sider} breakpoint="lg" collapsedWidth={64}>
        <div className={styles.brand}>
          <div className={styles.brandMark}>P</div>
          <div className={styles.brandText}>
            <div className={styles.brandName}>ParkOne</div>
            <div className={styles.brandSub}>Quản lý bãi xe thông minh</div>
          </div>
        </div>
        <div className={styles.menuWrap}>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={selectedKeys}
            defaultOpenKeys={openKeys}
            items={items.map((g) => ({
              key: g.key,
              icon: <AppstoreOutlined />,
              label: g.label,
              children: g.children.map((c) => ({ key: c.key, icon: c.icon, label: c.label })),
            }))}
            onClick={({ key }) => navigate(key)}
          />
        </div>
        <div className={styles.siderFooter}>
          <div>
            <strong>KhoaDev</strong> · khoadev.vn
          </div>
          <div>khoadev.company@gmail.com</div>
        </div>
      </Layout.Sider>
      <Layout className={styles.main}>
        <Layout.Header className={styles.header}>
          <GlobalSearch />
          <div className={styles.headerSpacer} />
          <Tag color="cyan" className={styles.parkingTag}>
            {parkingName}
          </Tag>
          <div className={styles.roleBox}>
            <Tooltip title="Chuyển vai trò sử dụng. Dữ liệu không tách theo người dùng; khi có máy chủ, quyền sẽ được kiểm tra lại.">
              <Select
                value={role}
                style={{ width: 208 }}
                options={options.map((o) => ({
                  value: o.value,
                  label: (
                    <span>
                      {ROLE_LABEL[o.value as RoleId]}
                      {o.employeeName ? <span className="text-muted"> — {o.employeeName}</span> : null}
                    </span>
                  ),
                }))}
                onChange={(value) => setRole(value as RoleId)}
              />
            </Tooltip>
            <div className={styles.roleHint}>
              <div>{actor.name}</div>
              <div>{ROLE_LABEL[role]}</div>
            </div>
          </div>
        </Layout.Header>
        <Layout.Content ref={contentRef} className={styles.content}>
          <div className="page-content">
            <Outlet />
          </div>
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
