import type { ThemeConfig } from 'antd';

export const themeConfig: ThemeConfig = {
  token: {
    colorPrimary: '#0f766e',
    colorInfo: '#0f766e',
    colorSuccess: '#2f9e44',
    colorWarning: '#e8930c',
    colorError: '#d64545',
    borderRadius: 8,
    fontSize: 14,
    fontFamily: "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    controlHeight: 34,
  },
  components: {
    Layout: {
      siderBg: '#0b2b28',
      triggerBg: '#08201e',
      headerBg: '#ffffff',
      bodyBg: '#f3f7f6',
    },
    Menu: {
      darkItemBg: '#0b2b28',
      darkSubMenuItemBg: '#08201e',
      darkItemSelectedBg: '#0f766e',
      darkItemColor: 'rgba(255,255,255,0.82)',
      darkItemHoverColor: '#ffffff',
    },
    Table: {
      headerBg: '#eef5f3',
      headerColor: '#2d4a46',
      rowHoverBg: '#ecf8f5',
    },
    Card: {
      headerFontSize: 15,
    },
    Statistic: {
      contentFontSize: 24,
    },
  },
};
