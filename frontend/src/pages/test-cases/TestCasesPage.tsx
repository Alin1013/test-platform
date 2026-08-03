import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Empty, Input, Select, Skeleton, Table, Tabs, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { PersonAvatar } from '../../components/PersonAvatar';
import { StatusBadge } from '../../components/StatusBadge';
import { AppPagination } from '../../components/common';
import { usePlatformService } from '../../services/PlatformServiceContext';
import type {
  CreateTestCaseInput,
  Priority,
  TestCaseQuery,
  TestCaseRecord,
  TestCaseStatus,
  TestCaseType,
} from '../../services/contracts';
import { CaseDrawer } from './components/CaseDrawer';
import { ModuleTreePanel } from './components/ModuleTreePanel';
import './test-cases.css';

const typeLabels: Record<TestCaseType, string> = {
  functional: '功能用例',
  api: '接口用例',
  ui: 'UI自动化',
};

function isTestCaseType(value: string | undefined): value is TestCaseType {
  return value === 'functional' || value === 'api' || value === 'ui';
}

export function TestCasesPage() {
  const params = useParams();
  const type = isTestCaseType(params.type) ? params.type : 'api';
  const service = usePlatformService();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedModule, setSelectedModule] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [priority, setPriority] = useState<Priority | undefined>();
  const [status, setStatus] = useState<TestCaseStatus | undefined>();
  const [rows, setRows] = useState<TestCaseRecord[] | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [drawerOpen, setDrawerOpen] = useState(searchParams.get('create') === '1');
  const query = useMemo<TestCaseQuery>(
    () => ({
      type,
      moduleId: selectedModule === 'all' ? undefined : selectedModule,
      keyword,
      priority,
      status,
    }),
    [keyword, priority, selectedModule, status, type],
  );

  useEffect(() => {
    setDrawerOpen(searchParams.get('create') === '1');
  }, [searchParams]);

  useEffect(() => {
    let active = true;
    setRows(null);
    void service.listTestCases(query).then((nextRows) => {
      if (active) setRows(nextRows);
    });

    return () => {
      active = false;
    };
  }, [query, service]);

  useEffect(() => {
    setPage(1);
  }, [query]);

  const totalPages = rows ? Math.max(1, Math.ceil(rows.length / pageSize)) : 1;

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);

  const visibleRows = useMemo(() => {
    if (!rows) return [];
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [page, pageSize, rows]);

  const columns = useMemo<ColumnsType<TestCaseRecord>>(() => {
    const base: ColumnsType<TestCaseRecord> = [
      { title: '编号', dataIndex: 'id', width: 124 },
      { title: '用例名称', dataIndex: 'name', ellipsis: true },
    ];
    if (type === 'api') {
      base.push(
        { title: '接口地址', dataIndex: 'endpoint', ellipsis: true },
        {
          title: '方法',
          dataIndex: 'method',
          width: 82,
          render: (method: string) => <Tag color={method === 'GET' ? 'success' : 'processing'}>{method}</Tag>,
        },
        { title: '预期状态', dataIndex: 'expectedStatus', width: 98 },
      );
    }
    base.push(
      {
        title: '创建人',
        dataIndex: 'creator',
        width: 112,
        render: (name: string) => (
          <span className="case-person">
            <PersonAvatar name={name} size={22} />
            {name}
          </span>
        ),
      },
      {
        title: '优先级',
        dataIndex: 'priority',
        width: 82,
        render: (value: Priority) => <Tag color={value === 'P0' ? 'error' : 'gold'}>{value}</Tag>,
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 96,
        render: (value: TestCaseStatus) => <StatusBadge status={value} />,
      },
    );
    return base;
  }, [type]);

  const closeDrawer = () => {
    setDrawerOpen(false);
    const next = new URLSearchParams(searchParams);
    next.delete('create');
    setSearchParams(next, { replace: true });
  };

  const createCase = async (input: CreateTestCaseInput) => {
    const created = await service.createTestCase(input);
    setRows(await service.listTestCases(query));
    return created;
  };

  const listLabel = `${typeLabels[type]}列表`;

  return (
    <section className="page-section test-cases-page">
      <PageHeader
        title="测试用例"
        description="按模块维护功能、接口和UI自动化资产"
        actions={
          <Button
            aria-label={`新建${typeLabels[type]}`}
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setDrawerOpen(true)}
          >
            新建{typeLabels[type]}
          </Button>
        }
      />

      <Tabs
        className="case-type-tabs"
        activeKey={type}
        items={(Object.keys(typeLabels) as TestCaseType[]).map((key) => ({ key, label: typeLabels[key] }))}
        onChange={(key) => navigate(`/test-cases/${key}`)}
      />

      <div className="test-cases-layout">
        <ModuleTreePanel selectedModule={selectedModule} onSelect={setSelectedModule} />

        <div className="case-list-panel">
          <div className="case-list-toolbar">
            <Input
              prefix={<SearchOutlined />}
              placeholder="搜索编号、名称或接口地址"
              allowClear
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
            <Select
              id="priority-filter"
              aria-label="筛选优先级"
              placeholder="优先级"
              allowClear
              value={priority}
              options={['P0', 'P1', 'P2', 'P3'].map((value) => ({ value, label: value }))}
              onChange={setPriority}
            />
            <Select
              id="status-filter"
              aria-label="筛选状态"
              placeholder="状态"
              allowClear
              value={status}
              options={['维护中', '已通过', '草稿', '已停用'].map((value) => ({ value, label: value }))}
              onChange={setStatus}
            />
          </div>

          <div
            role={rows ? 'region' : undefined}
            aria-label={rows ? listLabel : undefined}
            className="case-list-table"
          >
            {rows ? (
              rows.length ? (
                <Table
                  rowKey="id"
                  columns={columns}
                  dataSource={visibleRows}
                  size="small"
                  pagination={false}
                  scroll={{ x: type === 'api' ? 1080 : 760 }}
                />
              ) : (
                <Empty description="没有符合条件的测试用例" />
              )
            ) : (
              <Skeleton active paragraph={{ rows: 7 }} />
            )}
            {rows ? (
              <AppPagination
                current={page}
                pageSize={pageSize}
                total={rows.length}
                onChange={(nextPage, nextPageSize) => {
                  setPageSize(nextPageSize);
                  setPage(nextPageSize === pageSize ? nextPage : 1);
                }}
              />
            ) : null}
          </div>
        </div>
      </div>

      <CaseDrawer
        type={type}
        open={drawerOpen}
        defaultModule={selectedModule}
        onClose={closeDrawer}
        onSubmit={createCase}
      />
    </section>
  );
}
