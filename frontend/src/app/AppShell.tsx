import {
  BellOutlined,
  BookOutlined,
  BulbOutlined,
  DashboardOutlined,
  MenuOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Badge, Button, Drawer, Input, Layout, Menu, Select, Space, Tooltip } from 'antd';
import { useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { PersonAvatar } from '../components/PersonAvatar';
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
      { key: '/test-cases/ui', label: '界面自动化' },
    ],
  },
  { key: '/xmind', icon: <BulbOutlined aria-hidden="true" />, label: 'XMind 转换器' },
  { key: '/personnel', icon: <TeamOutlined aria-hidden="true" />, label: '人员管理' },
  { key: '/settings', icon: <SettingOutlined aria-hidden="true" />, label: '设置' },
];

function Brand() {
  return (
    <div className="app-brand" aria-label="智测管理平台">
      <span className="app-brand__mark">测</span>
      <span className="app-brand__name">智测管理平台</span>
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
              options={[{ value: 'alpha', label: '阿尔法测试平台' }]}
            />
            <Tooltip title="通知">
              <Badge dot offset={[-4, 5]}>
                <Button type="text" icon={<BellOutlined />} aria-label="通知" />
              </Badge>
            </Tooltip>
            <Tooltip title="当前用户：江珊">
              <Button className="app-topbar__avatar" type="text" aria-label="当前用户：江珊">
                <PersonAvatar name="江珊" size={30} />
              </Button>
            </Tooltip>
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
