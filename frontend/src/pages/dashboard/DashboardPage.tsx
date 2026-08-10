import {
  ArrowRightOutlined,
  DownloadOutlined,
  FileExcelOutlined,
  FileTextOutlined,
  PlusOutlined,
  ReloadOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { Alert, App, Button, Card, Modal, Skeleton, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';
import { Cell, Pie, PieChart } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { PersonAvatar } from '../../components/PersonAvatar';
import { StatusBadge } from '../../components/StatusBadge';
import { usePlatformService } from '../../services/PlatformServiceContext';
import type { DashboardData, TestCaseRecord, TestCaseType } from '../../services/contracts';
import './dashboard.css';

const typeLabels: Record<TestCaseType, string> = {
  functional: '功能',
  api: '接口',
  ui: 'UI自动化',
};

const chartColors: Record<TestCaseType, string> = {
  functional: '#2b8cc9',
  api: '#43b398',
  ui: '#efb94d',
};

type ExportFormat = 'csv' | 'xlsx';

function downloadBlob(blob: Blob, filename: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

const columns: ColumnsType<TestCaseRecord> = [
  { title: '模块', dataIndex: 'moduleName', width: 130, render: (moduleName: string | undefined) => moduleName || '-' },
  { title: '用例名称', dataIndex: 'name', ellipsis: true },
  {
    title: '类型',
    dataIndex: 'type',
    width: 110,
    render: (type: TestCaseType) => <Tag>{typeLabels[type]}</Tag>,
  },
  {
    title: '优先级',
    dataIndex: 'priority',
    width: 88,
    render: (priority: string) => <Tag color={priority === 'P0' ? 'error' : 'gold'}>{priority}</Tag>,
  },
  {
    title: '维护人',
    dataIndex: 'maintainer',
    width: 120,
    render: (name: string) => (
      <span className="dashboard-person">
        <PersonAvatar name={name} size={24} />
        {name}
      </span>
    ),
  },
  {
    title: '状态',
    dataIndex: 'status',
    width: 100,
    render: (status: TestCaseRecord['status']) => <StatusBadge status={status} />,
  },
  { title: '更新时间', dataIndex: 'updatedAt', width: 110 },
];

export function DashboardPage() {
  const service = usePlatformService();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let active = true;
    setData(null);
    setLoadError(false);

    void service
      .getDashboard()
      .then((nextData) => {
        if (active) setData(nextData);
      })
      .catch(() => {
        if (active) setLoadError(true);
      });

    return () => {
      active = false;
    };
  }, [reloadToken, service]);

  const openCreate = (type: TestCaseType) => navigate(`/test-cases/${type}?create=1`);

  const exportCases = async () => {
    if (!data) return;
    const rows = [
      ['模块', '用例名称', '类型', '优先级', '状态'],
      ...data.recentCases.map((item) => [
        item.moduleName ?? '-',
        item.name,
        typeLabels[item.type],
        item.priority,
        item.status,
      ]),
    ];

    setExporting(true);
    try {
      if (exportFormat === 'xlsx') {
        const { default: writeExcelFile } = await import('write-excel-file/universal');
        const blob = await writeExcelFile(rows).toBlob();
        downloadBlob(blob, '测试用例.xlsx');
      } else {
        const csv = rows.map((row) => row.join(',')).join('\n');
        downloadBlob(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }), '测试用例.csv');
      }

      setExportDialogOpen(false);
      void message.success(`${exportFormat.toUpperCase()} 文件已导出`);
    } catch {
      void message.error('导出失败，请稍后重试');
    } finally {
      setExporting(false);
    }
  };

  if (!data) {
    return (
      <section className="page-section">
        <PageHeader title="仪表盘" description="测试资产与协作进度总览" />
        {loadError ? (
          <Alert
            type="error"
            showIcon
            title="仪表盘数据加载失败"
            action={
              <Button
                aria-label="重试加载"
                icon={<ReloadOutlined />}
                onClick={() => setReloadToken((current) => current + 1)}
              >
                重试
              </Button>
            }
          />
        ) : (
          <Skeleton active paragraph={{ rows: 9 }} />
        )}
      </section>
    );
  }

  const chartData = (Object.keys(data.counts) as TestCaseType[]).map((type) => ({
    name: typeLabels[type],
    type,
    value: data.counts[type],
  }));

  return (
    <section className="page-section dashboard-page">
      <PageHeader title="仪表盘" description="测试资产与协作进度总览" />

      <div className="dashboard-overview-grid">
        <Card className="dashboard-card dashboard-card--overview" title="用例概览">
          <div className="dashboard-overview">
            <div className="dashboard-chart" aria-label="用例类型分布">
              <PieChart width={148} height={148}>
                <Pie data={chartData} dataKey="value" innerRadius={45} outerRadius={66} paddingAngle={2}>
                  {chartData.map((item) => (
                    <Cell key={item.type} fill={chartColors[item.type]} />
                  ))}
                </Pie>
              </PieChart>
              <div className="dashboard-chart__total">
                <strong>{data.total}</strong>
                <span>用例总数</span>
              </div>
            </div>
            <div className="dashboard-legend">
              {chartData.map((item) => (
                <div key={item.type}>
                  <span style={{ background: chartColors[item.type] }} />
                  <p>{item.name}</p>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="dashboard-card" title="导入导出中心">
          <div className="dashboard-action-stack">
            <Button
              aria-label="导出电子表格"
              icon={<FileExcelOutlined />}
              onClick={() => setExportDialogOpen(true)}
            >
              导出电子表格
            </Button>
            <Button icon={<DownloadOutlined />}>导入用例文件</Button>
            <Button icon={<RobotOutlined />} onClick={() => navigate('/xmind')}>
              从 XMind 生成用例
            </Button>
          </div>
        </Card>

        <Card className="dashboard-card" title="快捷操作">
          <div className="dashboard-action-stack dashboard-action-stack--quick">
            <Button aria-label="新建功能用例" type="primary" icon={<PlusOutlined />} onClick={() => openCreate('functional')}>
              新建功能用例
            </Button>
            <Button aria-label="新建接口用例" icon={<PlusOutlined />} onClick={() => openCreate('api')}>
              新建接口用例
            </Button>
            <Button aria-label="新建UI自动化" icon={<PlusOutlined />} onClick={() => openCreate('ui')}>
              新建UI自动化
            </Button>
          </div>
        </Card>
      </div>

      <Card
        className="dashboard-card dashboard-recent"
        title="最近用例"
        extra={
          <Button
            type="link"
            icon={<ArrowRightOutlined />}
            iconPlacement="end"
            onClick={() => navigate('/test-cases/functional')}
          >
            查看全部
          </Button>
        }
      >
        <div role="region" aria-label="最近用例" className="dashboard-table-wrap">
          <Table
            rowKey="id"
            columns={columns}
            dataSource={data.recentCases}
            pagination={false}
            size="small"
            scroll={{ x: 900 }}
          />
        </div>
      </Card>

      <Modal
        className="dashboard-export-modal"
        title="导出电子表格"
        open={exportDialogOpen}
        centered
        okText="导出"
        cancelText="取消"
        okButtonProps={{ 'aria-label': '导出' }}
        cancelButtonProps={{ 'aria-label': '取消' }}
        confirmLoading={exporting}
        destroyOnHidden
        onOk={() => void exportCases()}
        onCancel={() => setExportDialogOpen(false)}
      >
        <p className="dashboard-export-modal__prompt">选择导出文件格式</p>
        <div className="dashboard-export-formats" role="group" aria-label="导出文件格式">
          <Button
            aria-label="CSV"
            aria-pressed={exportFormat === 'csv'}
            type={exportFormat === 'csv' ? 'primary' : 'default'}
            icon={<FileTextOutlined aria-hidden="true" />}
            onClick={() => setExportFormat('csv')}
          >
            CSV
          </Button>
          <Button
            aria-label="XLSX"
            aria-pressed={exportFormat === 'xlsx'}
            type={exportFormat === 'xlsx' ? 'primary' : 'default'}
            icon={<FileExcelOutlined aria-hidden="true" />}
            onClick={() => setExportFormat('xlsx')}
          >
            XLSX
          </Button>
        </div>
      </Modal>
    </section>
  );
}
