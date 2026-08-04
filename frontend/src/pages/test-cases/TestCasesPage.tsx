import {
  DeleteOutlined,
  EditOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { App, Button, Empty, Input, Select, Skeleton, Table, Tabs, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, Key } from 'react';
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
import { testCaseStatusOptions } from './testCaseOptions';
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
  const { message, modal } = App.useApp();
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
  const [editingCase, setEditingCase] = useState<TestCaseRecord | null>(null);
  const [selectedStorageIds, setSelectedStorageIds] = useState<Key[]>([]);
  const [modulePanelWidth, setModulePanelWidth] = useState(248);
  const [isModulePanelCollapsed, setIsModulePanelCollapsed] = useState(false);
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
    setSelectedStorageIds([]);
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

  const refreshRows = async () => {
    const nextRows = await service.listTestCases(query);
    setRows(nextRows);
    return nextRows;
  };

  const deleteCases = (cases: TestCaseRecord[]) => {
    if (!cases.length) return;
    const isBulk = cases.length > 1;
    modal.confirm({
      title: isBulk ? `删除已选的 ${cases.length} 条用例？` : `删除用例 ${cases[0].id}？`,
      content: '删除后无法恢复，请确认是否继续。',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true, 'aria-label': '删除' },
      cancelButtonProps: { 'aria-label': '取消' },
      async onOk() {
        try {
          const results = await Promise.allSettled(
            cases.map((testCase) => service.deleteTestCase(testCase.storageId)),
          );
          const nextRows = await refreshRows();
          const failedStorageIds = cases
            .filter((_, index) => results[index].status === 'rejected')
            .map((testCase) => testCase.storageId)
            .filter((storageId) =>
              nextRows.some((testCase) => testCase.storageId === storageId),
            );
          setSelectedStorageIds((currentIds) =>
            isBulk
              ? failedStorageIds
              : currentIds.filter((storageId) =>
                  nextRows.some((testCase) => testCase.storageId === storageId),
                ),
          );

          if (failedStorageIds.length) {
            const deletedCount = cases.length - failedStorageIds.length;
            void message.error(
              deletedCount
                ? `已删除 ${deletedCount} 条，${failedStorageIds.length} 条删除失败`
                : '删除失败，请重试',
            );
            return;
          }
          void message.success(isBulk ? `已删除 ${cases.length} 条用例` : '用例已删除');
        } catch (error) {
          void message.error(error instanceof Error ? error.message : '删除用例失败');
          throw error;
        }
      },
    });
  };

  const columns: ColumnsType<TestCaseRecord> = (() => {
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
      {
        title: '操作',
        key: 'actions',
        width: 96,
        fixed: 'right',
        render: (_, record) => (
          <div className="case-row-actions">
            <Tooltip title="编辑">
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                aria-label={`编辑 ${record.id}`}
                onClick={() => setEditingCase(record)}
              />
            </Tooltip>
            <Tooltip title="删除">
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                aria-label={`删除 ${record.id}`}
                onClick={() => deleteCases([record])}
              />
            </Tooltip>
          </div>
        ),
      },
    );
    return base;
  })();

  const closeDrawer = () => {
    setDrawerOpen(false);
    const next = new URLSearchParams(searchParams);
    next.delete('create');
    setSearchParams(next, { replace: true });
  };

  const createCase = async (input: CreateTestCaseInput) => {
    const created = await service.createTestCase(input);
    await refreshRows();
    return created;
  };

  const updateCase = async ({ type: _type, ...input }: CreateTestCaseInput) => {
    if (!editingCase) throw new Error('没有正在编辑的用例');
    const updated = await service.updateTestCase(editingCase.storageId, input);
    const nextRows = await refreshRows();
    setSelectedStorageIds((currentIds) =>
      currentIds.filter((storageId) =>
        nextRows.some((testCase) => testCase.storageId === storageId),
      ),
    );
    return updated;
  };

  const selectedCases = rows?.filter((row) => selectedStorageIds.includes(row.storageId)) ?? [];

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

      <div
        className={`test-cases-layout${isModulePanelCollapsed ? ' is-module-panel-collapsed' : ''}`}
        style={{ '--module-panel-width': `${modulePanelWidth}px` } as CSSProperties}
      >
        <ModuleTreePanel
          selectedModule={selectedModule}
          width={modulePanelWidth}
          hidden={isModulePanelCollapsed}
          onSelect={setSelectedModule}
          onWidthChange={setModulePanelWidth}
          onCollapse={() => setIsModulePanelCollapsed(true)}
        />

        <div className="case-list-panel">
          <div
            className={`case-list-toolbar${isModulePanelCollapsed ? ' has-module-panel-toggle' : ''}`}
          >
            {isModulePanelCollapsed ? (
              <Tooltip title="显示模块栏">
                <Button
                  type="text"
                  className="case-list-toolbar__module-toggle"
                  aria-label="显示模块栏"
                  icon={<MenuUnfoldOutlined />}
                  onClick={() => setIsModulePanelCollapsed(false)}
                />
              </Tooltip>
            ) : null}
            <Input
              className="case-list-toolbar__search"
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
              options={testCaseStatusOptions.map((value) => ({ value, label: value }))}
              onChange={setStatus}
            />
          </div>

          {selectedStorageIds.length ? (
            <div className="case-bulk-actions" role="toolbar" aria-label="批量操作">
              <span>已选择 {selectedStorageIds.length} 项</span>
              <Button
                danger
                size="small"
                icon={<DeleteOutlined />}
                aria-label={`删除已选 ${selectedStorageIds.length} 项`}
                onClick={() => deleteCases(selectedCases)}
              >
                删除
              </Button>
            </div>
          ) : null}

          <div
            role={rows ? 'region' : undefined}
            aria-label={rows ? listLabel : undefined}
            className="case-list-table"
          >
            {rows ? (
              rows.length ? (
                <Table
                  rowKey="storageId"
                  columns={columns}
                  dataSource={visibleRows}
                  size="small"
                  pagination={false}
                  rowSelection={{
                    selectedRowKeys: selectedStorageIds,
                    columnWidth: 48,
                    onChange: setSelectedStorageIds,
                    getCheckboxProps: (record) => ({ 'aria-label': `选择 ${record.id}` }),
                  }}
                  scroll={{ x: type === 'api' ? 1180 : 900 }}
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
      <CaseDrawer
        type={editingCase?.type ?? type}
        open={editingCase !== null}
        defaultModule={editingCase?.moduleId ?? selectedModule}
        initialCase={editingCase ?? undefined}
        onClose={() => setEditingCase(null)}
        onSubmit={updateCase}
      />
    </section>
  );
}
