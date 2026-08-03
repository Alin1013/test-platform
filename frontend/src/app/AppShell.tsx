import {
  BellOutlined,
  BookOutlined,
  BulbOutlined,
  DashboardOutlined,
  EditOutlined,
  LogoutOutlined,
  MenuOutlined,
  SettingOutlined,
  SwapOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Badge, Button, Dropdown, Drawer, Input, Layout, Menu, Select, Space, Tooltip } from 'antd';
import { useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { PersonAvatar } from '../components/PersonAvatar';
import { useAuth } from '../services/AuthContext';
import './app-shell.css';

const { Content, Header, Sider } = Layout;

const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined aria-hidden="true" />, label: '仪表盘' },
  {
    key: 'test-cases',
    icon: <BookOutlined aria-hidden="true" />,
    label: '测试用例',
    children: [
      { key: '/test-cases/functional', label: '功能用例' },
      { key: '/test-cases/api', label: '接口用例' },
      { key: '/test-cases/ui', label: 'UI自动化' },
    ],
  },
  { key: '/xmind', icon: <BulbOutlined aria-hidden="true" />, label: '用例生成器' },
  { key: '/personnel', icon: <TeamOutlined aria-hidden="true" />, label: '人员管理' },
  { key: '/settings', icon: <SettingOutlined aria-hidden="true" />, label: '设置' },
];

function Brand() {
  return (
    <div className="app-brand" aria-label="测试平台">
      <span className="app-brand__mark">测</span>
      <span className="app-brand__name">测试平台</span>
    </div>
  );
}

interface NavigationProps {
  onNavigate?: () => void;
}

function Navigation({ onNavigate }: NavigationProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const selectedKey = useMemo(() => location.pathname, [location.pathname]);

  return (
    <Menu
      className="app-navigation"
      mode="inline"
      theme="dark"
      items={menuItems}
      selectedKeys={[selectedKey]}
      defaultOpenKeys={location.pathname.startsWith('/test-cases') ? ['test-cases'] : []}
      onClick={({ key }) => {
        navigate(key);
        onNavigate?.();
      }}
    />
  );
}

export function AppShell() {
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const accountMenuItems = [
    { key: 'profile', icon: <EditOutlined aria-hidden="true" />, label: '编辑个人信息' },
    { key: 'switch', icon: <SwapOutlined aria-hidden="true" />, label: '切换账号' },
    { type: 'divider' as const },
    { key: 'logout', icon: <LogoutOutlined aria-hidden="true" />, label: '退出登录', danger: true },
  ];

  const handleAccountMenuClick = async ({ key }: { key: string }) => {
    if (key === 'profile') {
      navigate('/settings?tab=profile');
      return;
    }

    if (key === 'switch' || key === 'logout') {
      await logout();
      navigate('/login', { replace: true });
    }
  };

  return (
    <Layout className="app-shell">
      <Sider className="app-sidebar" width={224} trigger={null}>
        <Brand />
        <Navigation />
        <div className="app-sidebar__footer">
          <span className="app-sidebar__pulse" />
          服务运行正常
        </div>
      </Sider>

      <Layout className="app-main">
        <Header className="app-topbar">
          <Button
            className="app-topbar__menu"
            type="text"
            icon={<MenuOutlined />}
            aria-label="打开导航"
            onClick={() => setMobileNavigationOpen(true)}
          />
          <Input.Search className="app-topbar__search" placeholder="搜索用例、用户或模块" allowClear />
          <Space className="app-topbar__actions" size={8}>
            <Select
              className="app-topbar__project"
              id="project-selector"
              aria-label="选择项目"
              value="alpha"
              options={[{ value: 'alpha', label: '测试平台' }]}
            />
            <Tooltip title="通知">
              <Badge dot offset={[-4, 5]}>
                <Button type="text" icon={<BellOutlined />} aria-label="通知" />
              </Badge>
            </Tooltip>
            <Dropdown
              trigger={['click']}
              menu={{ items: accountMenuItems, onClick: handleAccountMenuClick }}
              placement="bottomRight"
            >
              <Tooltip title={`当前用户：${user?.name ?? ''}`}>
                <Button
                  className="app-topbar__avatar"
                  type="text"
                  aria-label={`当前用户：${user?.name ?? '未登录'}`}
                >
                  <PersonAvatar name={user?.name ?? '用'} src={user?.avatar} size={30} />
                </Button>
              </Tooltip>
            </Dropdown>
          </Space>
        </Header>
        <Content className="app-content">
          <Outlet />
        </Content>
      </Layout>

      <Drawer
        className="app-mobile-drawer"
        title="主导航"
        aria-label="主导航"
        placement="left"
        size={280}
        open={mobileNavigationOpen}
        destroyOnHidden
        onClose={() => setMobileNavigationOpen(false)}
      >
        <Brand />
        <Navigation onNavigate={() => setMobileNavigationOpen(false)} />
      </Drawer>
    </Layout>
  );
}
