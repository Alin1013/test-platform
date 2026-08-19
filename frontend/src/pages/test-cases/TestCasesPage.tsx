/**
 * 用例列表页：功能/接口/UI 三类用例的筛选、分页、批量删除与导入（CSV/XLSX/Apifox）。
 */
import {
  CheckOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { App, Button, Empty, Skeleton, Table, Tabs, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  TestCaseFilterOptions,
  TestCaseQuery,
  TestCaseRecord,
  TestCaseStatus,
  TestCaseType,
  UpdateTestCaseInput,
  PaginatedResult,
} from '../../services/contracts';
import { CaseDrawer } from './components/CaseDrawer';
import { CaseListFilters } from './components/CaseListFilters';
import type { CaseFilterKey } from './components/CaseListFilters';
import { ModuleTreePanel } from './components/ModuleTreePanel';
import { parseApifoxOpenApi } from './apifoxImport';
import './test-cases.css';

const typeLabels: Record<TestCaseType, string> = {
  // 路由参数与页面标题/文案的映射。
  functional: '功能用例',
  api: '接口用例',
  ui: 'UI自动化',
};

function isTestCaseType(value: string | undefined): value is TestCaseType {
  // 路由参数限定为三种合法类型，非法值回退到 api。
  return value === 'functional' || value === 'api' || value === 'ui';
}

const FUNCTIONAL_IMPORT_HEADERS = [
  '用例目录', '用例名称', '需求ID', '前置条件', '用例步骤', '预期结果',
  '用例类型', '用例状态', '用例等级', '创建人', '归属迭代', '是否冒烟',
];
const MODULE_IMPORT_HEADERS = new Set([
  'module_id', '用例目录', '模块ID', '模块', '模块名称', '所属模块', '所属模块名称',
]);

function readFileAsText(file: File): Promise<string> {
  // 以文本方式读取导入文件（用于 JSON/Apifox）。
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('无法读取导入文件'));
    reader.readAsText(file);
  });
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  // 以二进制方式读取导入文件（用于 xlsx 解析）。
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error('无法读取导入文件'));
    };
    reader.onerror = () => reject(new Error('无法读取导入文件'));
    reader.readAsArrayBuffer(file);
  });
}

function toStatusUpdateInput(testCase: TestCaseRecord, status: TestCaseStatus): UpdateTestCaseInput {
  // 更新接口要求携带完整用例字段；批量状态操作只替换 status，避免覆盖其它内容。
  return {
    moduleId: testCase.moduleId,
    name: testCase.name,
    priority: testCase.priority,
    status,
    requirementId: testCase.requirementId,
    precondition: testCase.precondition,
    steps: testCase.steps,
    expectedResult: testCase.expectedResult,
    iteration: testCase.iteration,
    isSmoke: testCase.isSmoke,
    endpoint: testCase.endpoint,
    method: testCase.method,
    expectedStatus: testCase.expectedStatus,
    apiDetails: testCase.apiDetails,
    uiDetails: testCase.uiDetails,
  };
}

async function hasMissingFunctionalModule(file: File): Promise<boolean> {
  // 预检功能用例导入文件：标准模板且存在“用例目录”列时检查是否为空。
  const extension = file.name.toLowerCase().split('.').pop();
  if (extension !== 'csv' && extension !== 'xlsx' && extension !== 'xls') return false;

  const { read, utils } = await import('xlsx');
  const workbook = extension === 'csv'
    ? read(await readFileAsText(file), { type: 'string' })
    : read(await readFileAsArrayBuffer(file), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: '',
  });
  const headers = rows[0]?.map((value) => String(value).trim()) ?? [];
  const dataRows = rows.slice(1).filter((row) => row.some((value) => String(value).trim()));
  if (!dataRows.length) return false;
  const moduleIndex = headers.findIndex((header) => MODULE_IMPORT_HEADERS.has(header));
  if (moduleIndex < 0) return true;
  if (
    headers.length === FUNCTIONAL_IMPORT_HEADERS.length &&
    headers.some((value, index) => value !== FUNCTIONAL_IMPORT_HEADERS[index])
  ) {
    return false;
  }
  return dataRows.some((row) => !String(row[moduleIndex] ?? '').trim());
}

export function TestCasesPage() {
  // 列表状态：筛选条件、分页、选中项、抽屉与模块栏宽度。
  const params = useParams();
  const type = isTestCaseType(params.type) ? params.type : 'api';
  const service = usePlatformService();
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedModule, setSelectedModule] = useState('all');
  const [keyword, setKeyword] = useState('');
  // 功能用例默认展示归属迭代，自动化用例仍以状态作为默认筛选。
  const [activeFilters, setActiveFilters] = useState<CaseFilterKey[]>(
    type === 'functional' ? ['iteration'] : ['status'],
  );
  const [priority, setPriority] = useState<Priority | undefined>();
  const [status, setStatus] = useState<TestCaseStatus | undefined>();
  const [creatorId, setCreatorId] = useState<number | undefined>();
  const [iteration, setIteration] = useState<string | undefined>();
  const [smokeFilter, setSmokeFilter] = useState<'smoke' | 'non-smoke' | undefined>();
  const [filterOptions, setFilterOptions] = useState<TestCaseFilterOptions>({
    iterations: [],
    creators: [],
  });
  const [rows, setRows] = useState<PaginatedResult<TestCaseRecord> | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [drawerOpen, setDrawerOpen] = useState(searchParams.get('create') === '1');
  const [editingCase, setEditingCase] = useState<TestCaseRecord | null>(null);
  const [selectedStorageIds, setSelectedStorageIds] = useState<Key[]>([]);
  const [modulePanelWidth, setModulePanelWidth] = useState(248);
  const [moduleRefreshToken, setModuleRefreshToken] = useState(0);
  const [isModulePanelCollapsed, setIsModulePanelCollapsed] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const functionalImportInputRef = useRef<HTMLInputElement>(null);
  const query = useMemo<TestCaseQuery>(
    // 只把当前可见字段带入查询，移除筛选字段后旧值不会继续过滤列表。
    () => ({
      type,
      moduleId: selectedModule === 'all' ? undefined : selectedModule,
      keyword,
      priority: activeFilters.includes('priority') ? priority : undefined,
      status: activeFilters.includes('status') ? status : undefined,
      creatorId: activeFilters.includes('creator') ? creatorId : undefined,
      ...(type === 'functional' && activeFilters.includes('iteration') ? { iteration } : {}),
      ...(type === 'functional' && activeFilters.includes('smoke')
        ? { isSmoke: smokeFilter === undefined ? undefined : smokeFilter === 'smoke' }
        : {}),
    }),
    [activeFilters, creatorId, iteration, keyword, priority, selectedModule, smokeFilter, status, type],
  );

  useEffect(() => {
    // 切换类型时恢复该表格的默认字段，避免上一个模块的筛选条件泄漏。
    setActiveFilters(type === 'functional' ? ['iteration'] : ['status']);
    setPriority(undefined);
    setStatus(undefined);
    setCreatorId(undefined);
    setIteration(undefined);
    setSmokeFilter(undefined);
  }, [type]);

  useEffect(() => {
    setDrawerOpen(searchParams.get('create') === '1');
  }, [searchParams]);

  useEffect(() => {
    // active 防止卸载后更新；筛选/分页变化时重新请求列表。
    let active = true;
    setRows(null);
    void service.listTestCasesPage(query, page, pageSize).then((nextRows) => {
      if (active) setRows(nextRows);
    });

    return () => {
      active = false;
    };
  }, [page, pageSize, query, service]);

  useEffect(() => {
    let active = true;
    void service.getTestCaseFilterOptions(type).then((nextOptions) => {
      if (active) setFilterOptions(nextOptions);
    });

    return () => {
      active = false;
    };
  }, [service, type]);

  useEffect(() => {
    // 筛选条件变化时回到第一页并清空选中项。
    setPage(1);
    setSelectedStorageIds([]);
  }, [query]);

  const totalPages = rows ? Math.max(1, Math.ceil(rows.total / pageSize)) : 1;

  useEffect(() => {
    if (rows) {
      setPage((currentPage) => Math.min(currentPage, totalPages));
    }
  }, [rows, totalPages]);

  const visibleRows = rows?.items ?? [];

  const refreshFilterOptions = async () => {
    setFilterOptions(await service.getTestCaseFilterOptions(type));
  };

  const refreshRows = async () => {
    const nextRows = await service.listTestCasesPage(query, page, pageSize);
    setRows(nextRows);
    return nextRows.items;
  };

  const refreshRowsAndFilterOptions = async () => {
    const nextRows = await refreshRows();
    await refreshFilterOptions();
    return nextRows;
  };

  const deleteCases = (cases: TestCaseRecord[]) => {
    // 删除前弹确认；批量删除部分失败时保留失败项选中，便于重试。
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
          const nextRows = await refreshRowsAndFilterOptions();
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

  const markCasesPassed = async (cases: TestCaseRecord[]) => {
    // 并行更新选中用例；失败项继续保留选中，方便用户直接重试。
    if (!cases.length || isBulkUpdating) return;
    setIsBulkUpdating(true);
    try {
      const results = await Promise.allSettled(
        cases.map((testCase) =>
          service.updateTestCase(testCase.storageId, toStatusUpdateInput(testCase, '已通过')),
        ),
      );
      const nextRows = await refreshRowsAndFilterOptions();
      const failedStorageIds = cases
        .filter((_, index) => results[index].status === 'rejected')
        .map((testCase) => testCase.storageId)
        .filter((storageId) => nextRows.some((testCase) => testCase.storageId === storageId));
      setSelectedStorageIds(failedStorageIds);

      if (failedStorageIds.length) {
        const passedCount = cases.length - failedStorageIds.length;
        void message.error(
          passedCount
            ? `已通过 ${passedCount} 条，${failedStorageIds.length} 条更新失败`
            : '批量通过失败，请重试',
        );
        return;
      }
      void message.success(`已将 ${cases.length} 条用例标记为已通过`);
    } catch (error) {
      void message.error(error instanceof Error ? error.message : '批量通过失败');
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const columns: ColumnsType<TestCaseRecord> = (() => {
    // 功能用例显示完整字段，接口/UI 用例使用各自的精简列。
    if (type === 'functional') {
      return [
        { title: '模块', dataIndex: 'moduleName', width: 130, render: (value: string | undefined) => value || '-' },
        { title: '用例名称', dataIndex: 'name', width: 180, ellipsis: true },
        { title: '前置条件', dataIndex: 'precondition', width: 180, ellipsis: true, render: (value) => value || '-' },
        { title: '用例步骤', dataIndex: 'steps', width: 220, ellipsis: true, render: (value) => value || '-' },
        { title: '预期结果', dataIndex: 'expectedResult', width: 200, ellipsis: true, render: (value) => value || '-' },
        { title: '用例类型', dataIndex: 'type', width: 100, render: () => '功能用例' },
        { title: '用例状态', dataIndex: 'status', width: 100, render: (value: TestCaseStatus) => <StatusBadge status={value} /> },
        { title: '用例等级', dataIndex: 'priority', width: 90, render: (value: Priority) => <Tag color={value === 'P0' ? 'error' : 'gold'}>{value}</Tag> },
        {
          title: '创建人', dataIndex: 'creator', width: 112,
          render: (name: string) => <span className="case-person"><PersonAvatar name={name} size={22} />{name}</span>,
        },
        { title: '归属迭代', dataIndex: 'iteration', width: 120, render: (value) => value || '-' },
        { title: '是否冒烟', dataIndex: 'isSmoke', width: 92, render: (value: boolean) => <Tag color={value ? 'success' : 'error'}>{value ? '是' : '否'}</Tag> },
        {
          title: '操作', key: 'actions', width: 96, fixed: 'right',
          render: (_, record) => (
            <div className="case-row-actions">
              <Tooltip title="编辑"><Button type="text" size="small" icon={<EditOutlined />} aria-label={`编辑 ${record.id}`} onClick={() => setEditingCase(record)} /></Tooltip>
              <Tooltip title="删除"><Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label={`删除 ${record.id}`} onClick={() => deleteCases([record])} /></Tooltip>
            </div>
          ),
        },
      ];
    }
    const base: ColumnsType<TestCaseRecord> = [
      { title: '模块', dataIndex: 'moduleName', width: 130, render: (value: string | undefined) => value || '-' },
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
    // 关闭抽屉时同步清理 URL 上的 create 参数。
    setDrawerOpen(false);
    const next = new URLSearchParams(searchParams);
    next.delete('create');
    setSearchParams(next, { replace: true });
  };

  const createCase = async (input: CreateTestCaseInput) => {
    const created = await service.createTestCase(input);
    await refreshRowsAndFilterOptions();
    return created;
  };

  const importFunctionalCases = async (file: File) => {
    // 功能用例导入：未选择模块且文件可能缺模块列时先提示。
    setIsImporting(true);
    try {
      if (selectedModule === 'all' && await hasMissingFunctionalModule(file)) {
        void message.warning('请先选择具体模块');
        return;
      }
      const result = await service.importTestCases(
        file,
        selectedModule === 'all' ? undefined : selectedModule,
      );
      await refreshRowsAndFilterOptions();
      void message.success(`已导入 ${result.importedCount} 条功能用例`);
    } catch (error) {
      void message.error(error instanceof Error ? error.message : '导入失败，请检查文件格式');
    } finally {
      setIsImporting(false);
      if (functionalImportInputRef.current) functionalImportInputRef.current.value = '';
    }
  };

  const exportFunctionalCases = async () => {
    // 导出当前筛选条件下的全部功能用例；后端按标准导入模板生成文件。
    setIsExporting(true);
    try {
      const blob = await service.exportTestCases(query);
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = '功能用例.xlsx';
      anchor.click();
      window.URL.revokeObjectURL(url);
      void message.success(`已导出 ${rows?.total ?? 0} 条功能用例`);
    } catch (error) {
      void message.error(error instanceof Error ? error.message : '导出功能用例失败');
    } finally {
      setIsExporting(false);
    }
  };

  const readImportFile = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('无法读取导入文件'));
      reader.readAsText(file);
    });

  const importApifoxCases = async (file: File) => {
    // Apifox 导入：逐条创建，中途失败回滚已创建用例。
    if (selectedModule === 'all') {
      void message.warning('请先选择具体模块');
      return;
    }
    setIsImporting(true);
    const createdCases: TestCaseRecord[] = [];
    try {
      const source = JSON.parse(await readImportFile(file)) as unknown;
      const inputs = parseApifoxOpenApi(source, selectedModule);
      for (const input of inputs) createdCases.push(await service.createTestCase(input));
      await refreshRows();
      void message.success(`已导入 ${inputs.length} 条接口用例`);
    } catch (error) {
      if (createdCases.length) {
        await Promise.allSettled(
          createdCases.map((testCase) => service.deleteTestCase(testCase.storageId)),
        );
        await refreshRows();
      }
      void message.error(error instanceof Error ? error.message : '导入 Apifox 用例失败');
    } finally {
      setIsImporting(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  const updateCase = async ({ type: _type, ...input }: CreateTestCaseInput) => {
    // 更新成功后刷新列表与筛选选项，并清理已删除项的选中状态。
    if (!editingCase) throw new Error('没有正在编辑的用例');
    const updated = await service.updateTestCase(editingCase.storageId, input);
    const nextRows = await refreshRowsAndFilterOptions();
    setSelectedStorageIds((currentIds) =>
      currentIds.filter((storageId) =>
        nextRows.some((testCase) => testCase.storageId === storageId),
      ),
    );
    return updated;
  };

  const selectedCases = rows?.items.filter((row) => selectedStorageIds.includes(row.storageId)) ?? [];

  const listLabel = `${typeLabels[type]}列表`;

  return (
    <section className="page-section test-cases-page">
      <PageHeader
        title="测试用例"
        description="按模块维护功能、接口和UI自动化资产"
        actions={
          <div className="page-header-actions">
            {type === 'functional' ? (
              <>
                <Button
                  icon={<UploadOutlined />}
                  loading={isImporting}
                  onClick={() => functionalImportInputRef.current?.click()}
                >
                  导入
                </Button>
                <input
                  ref={functionalImportInputRef}
                  className="case-apifox-import-input"
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  aria-label="导入功能用例"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void importFunctionalCases(file);
                  }}
                />
                <Button
                  icon={<DownloadOutlined />}
                  loading={isExporting}
                  disabled={!rows?.total}
                  onClick={() => void exportFunctionalCases()}
                >
                  导出
                </Button>
              </>
            ) : null}
            {type === 'api' ? (
              <>
                <Button
                  icon={<UploadOutlined />}
                  loading={isImporting}
                  onClick={() => {
                    if (selectedModule === 'all') {
                      void message.warning('请先选择具体模块');
                      return;
                    }
                    importInputRef.current?.click();
                  }}
                >
                  导入 Apifox 用例
                </Button>
                <input
                  ref={importInputRef}
                  className="case-apifox-import-input"
                  type="file"
                  accept=".json,application/json"
                  aria-label="导入 Apifox 用例"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void importApifoxCases(file);
                  }}
                />
              </>
            ) : null}
            <Button
              aria-label={`新建${typeLabels[type]}`}
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setDrawerOpen(true)}
            >
              新建{typeLabels[type]}
            </Button>
          </div>
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
          caseType={type}
          refreshToken={moduleRefreshToken}
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
            <CaseListFilters
              type={type}
              activeFilters={activeFilters}
              keyword={keyword}
              priority={priority}
              status={status}
              creatorId={creatorId}
              iteration={iteration}
              smokeFilter={smokeFilter}
              filterOptions={filterOptions}
              onActiveFiltersChange={setActiveFilters}
              onKeywordChange={setKeyword}
              onPriorityChange={setPriority}
              onStatusChange={setStatus}
              onCreatorChange={setCreatorId}
              onIterationChange={setIteration}
              onSmokeFilterChange={setSmokeFilter}
            />
          </div>

          {selectedStorageIds.length ? (
            <div className="case-bulk-actions" role="toolbar" aria-label="批量操作">
              <span>已选择 {selectedStorageIds.length} 项</span>
              <Button
                type="primary"
                size="small"
                icon={<CheckOutlined />}
                loading={isBulkUpdating}
                disabled={isBulkUpdating}
                aria-label={`通过已选 ${selectedStorageIds.length} 项`}
                onClick={() => void markCasesPassed(selectedCases)}
              >
                批量通过
              </Button>
              <Button
                danger
                size="small"
                icon={<DeleteOutlined />}
                disabled={isBulkUpdating}
                aria-label={`删除已选 ${selectedStorageIds.length} 项`}
                onClick={() => deleteCases(selectedCases)}
              >
                批量删除
              </Button>
            </div>
          ) : null}

          <div
            role={rows ? 'region' : undefined}
            aria-label={rows ? listLabel : undefined}
            className="case-list-table"
          >
            {rows ? (
              rows.items.length ? (
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
                  scroll={{ x: type === 'functional' ? 1660 : type === 'api' ? 1060 : 780 }}
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
                total={rows.total}
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
