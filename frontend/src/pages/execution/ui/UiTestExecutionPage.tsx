/**
 * UI 自动化执行页：选择用例与执行配置，启动执行、轮询进度并查看详情。
 */
import {
  CloseCircleOutlined,
  EyeOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import {
  App as AntdApp,
  Button,
  Drawer,
  Empty,
  InputNumber,
  Progress,
  Select,
  Skeleton,
  Switch,
  Table,
  Tabs,
  Tag,
} from 'antd';
import type { ColumnsType, TableRowSelection } from 'antd/es/table/interface';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../../components/PageHeader';
import { AppPagination } from '../../../components/common';
import { usePlatformService } from '../../../services/PlatformServiceContext';
import type {
  ExecutionDetailStatus,
  ExecutionStatus,
  TestCaseRecord,
  TestEnvironment,
  TestModule,
  UiExecutionCase,
  UiExecutionInput,
  UiExecutionResult,
} from '../../../services/contracts';
import '../execution.css';

const statusLabels: Record<ExecutionDetailStatus, string> = {
  PENDING: '未执行',
  RUNNING: '运行中',
  PASSED: '已通过',
  FAILED: '已失败',
  SKIPPED: '已跳过',
};

const executionStatusLabels: Record<ExecutionStatus, string> = {
  PENDING: '等待中',
  RUNNING: '运行中',
  COMPLETED: '已完成',
  FAILED: '执行失败',
  CANCELLED: '已中断',
};

const statusColors: Record<ExecutionDetailStatus, string> = {
  PENDING: 'default',
  RUNNING: 'processing',
  PASSED: 'success',
  FAILED: 'error',
  SKIPPED: 'warning',
};

const buildTraceViewerUrl = (traceUrl: string | null | undefined) => {
  // 相对 Trace 地址补全为绝对地址后交给 Playwright Trace Viewer。
  if (!traceUrl) return null;
  const absoluteTraceUrl = /^https?:\/\//.test(traceUrl)
    ? traceUrl
    : new URL(traceUrl, globalThis.location?.origin ?? 'http://localhost').toString();
  return `https://trace.playwright.dev/?trace=${encodeURIComponent(absoluteTraceUrl)}`;
};

interface UiCaseRow extends UiExecutionCase {
  code: string;
  moduleId: string;
}

function flattenModules(modules: TestModule[]): TestModule[] {
  // 递归展开模块树为扁平列表，便于按 id 查询。
  return modules.flatMap((module) => [module, ...flattenModules(module.children)]);
}

function descendantModuleIds(module: TestModule): string[] {
  // 收集模块自身及其全部子孙 id，用于“目录筛选包含子目录”的语义。
  return [
    module.id,
    ...module.children.flatMap(descendantModuleIds),
  ];
}

function isModuleVisible(moduleId: string, visibleModuleIds: Set<string> | null) {
  return visibleModuleIds === null || visibleModuleIds.has(moduleId);
}

export function UiTestExecutionPage() {
  // 初次加载拉取用例/环境/模块；执行中每 2 秒轮询一次进度。
  const service = usePlatformService();
  const { message } = AntdApp.useApp();
  const [cases, setCases] = useState<TestCaseRecord[] | null>(null);
  const [environments, setEnvironments] = useState<TestEnvironment[]>([]);
  const [modules, setModules] = useState<TestModule[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [environment, setEnvironment] = useState<UiExecutionInput['environment']>('');
  const [browser, setBrowser] = useState<UiExecutionInput['browser']>('chrome');
  const [headless, setHeadless] = useState(true);
  const [concurrency, setConcurrency] = useState(1);
  const [execution, setExecution] = useState<UiExecutionResult | null>(null);
  const [executionId, setExecutionId] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState<UiCaseRow>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    let active = true;
    void Promise.all([
      service.listTestCases({ type: 'ui' }),
      service.getSystemSettings(),
      service.listTestModules(),
    ]).then(([rows, settings, testModules]) => {
      if (!active) return;
      setCases(rows);
      setEnvironments(settings.execution.environments);
      setModules(testModules);
      const defaultEnvironment = settings.execution.environments.find(
        (item) => item.id === settings.execution.defaultEnvironmentId,
      );
      setEnvironment(defaultEnvironment?.id ?? settings.execution.environments[0]?.id ?? '');
    });
    return () => {
      active = false;
    };
  }, [service]);

  useEffect(() => {
    // 仅当执行状态为 RUNNING 时轮询，避免终态后继续请求。
    if (!executionId || execution?.status !== 'RUNNING') return;
    const timer = window.setInterval(() => {
      void service.getUiExecution(executionId).then(setExecution).catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [execution?.status, executionId, service]);

  const rows = useMemo<UiCaseRow[]>(() => {
    // 未启动执行时展示全部用例（PENDING）；执行后把结果按用例表合并。
    if (!cases) return [];
    if (!execution) {
      return cases.map((testCase) => ({
        caseId: testCase.storageId ?? 0,
        caseName: testCase.name,
        code: testCase.id,
        moduleId: testCase.moduleId,
        browser,
        status: 'PENDING',
        durationMs: 0,
      }));
    }
    const recordsByStorageId = new Map(cases.map((item) => [item.storageId, item]));
    return execution.cases.map((result) => {
      const record = recordsByStorageId.get(result.caseId);
      return {
        ...result,
        code: record?.id ?? String(result.caseId),
        moduleId: record?.moduleId ?? '-',
      };
    });
  }, [browser, cases, execution]);

  const moduleList = useMemo(() => flattenModules(modules), [modules]);
  const modulesById = useMemo(
    () => new Map(moduleList.map((module) => [module.id, module])),
    [moduleList],
  );
  const descendantIdsByModule = useMemo(
    () => new Map(moduleList.map((module) => [module.id, new Set(descendantModuleIds(module))])),
    [moduleList],
  );

  const moduleOptions = useMemo(() => {
    return [
      { value: '', label: '全部目录' },
      ...moduleList.map((module) => ({
        value: module.id,
        label: module.name,
      })),
    ];
  }, [moduleList]);

  const visibleModuleIds = useMemo(
    () => selectedModuleId ? descendantIdsByModule.get(selectedModuleId) ?? new Set<string>() : null,
    [descendantIdsByModule, selectedModuleId],
  );

  const visibleRows = useMemo(
    () => rows.filter((row) => isModuleVisible(row.moduleId, visibleModuleIds)),
    [rows, visibleModuleIds],
  );

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const traceViewerUrl = useMemo(
    () => buildTraceViewerUrl(detail?.traceUrl),
    [detail?.traceUrl],
  );

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return visibleRows.slice(start, start + pageSize);
  }, [page, pageSize, visibleRows]);

  const changeModule = (value: string) => {
    // 切换目录时清掉不可见用例的选中项，避免提交隐藏用例。
    const moduleId = value || null;
    setSelectedModuleId(moduleId);
    setPage(1);
    if (!cases || !moduleId) return;
    const nextVisibleModuleIds = descendantIdsByModule.get(moduleId) ?? new Set<string>();
    const visibleCaseIds = new Set(
      cases
        .filter((testCase) => isModuleVisible(testCase.moduleId, nextVisibleModuleIds))
        .map((testCase) => testCase.storageId),
    );
    setSelectedIds((current) => current.filter((caseId) => visibleCaseIds.has(caseId)));
  };

  const run = async () => {
    // 校验选中项与项目后启动执行，并立即拉取一次初始结果。
    if (!selectedIds.length) {
      message.warning('请至少选择一个 UI 自动化用例');
      return;
    }
    const projectId = modules[0]?.projectId;
    if (!projectId) {
      message.error('未找到当前项目');
      return;
    }
    setSubmitting(true);
    try {
      const started = await service.startUiExecution({
        projectId,
        suiteIds: selectedIds,
        environment,
        browser,
        headless,
        concurrency,
      });
      setExecutionId(started.executionId);
      setExecution(await service.getUiExecution(started.executionId));
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'UI 自动化执行启动失败');
    } finally {
      setSubmitting(false);
    }
  };

  const stop = async () => {
    if (!executionId) return;
    await service.stopUiExecution(executionId);
    setExecution(await service.getUiExecution(executionId));
  };

  const rowSelection: TableRowSelection<UiCaseRow> | undefined = execution
    // 执行开始后禁用选择，避免执行期间变更集合。
    ? undefined
    : {
        selectedRowKeys: selectedIds,
        preserveSelectedRowKeys: true,
        onChange: (keys) => setSelectedIds(keys.map(Number)),
        getCheckboxProps: (record) => ({
          'aria-label': `选择 ${record.code} ${record.caseName}`,
        }),
      };

  const columns: ColumnsType<UiCaseRow> = [
    {
      title: '用例名称',
      dataIndex: 'caseName',
      ellipsis: true,
      render: (name: string, record) => (
        <div className="execution-name-cell">
          <strong>{name}</strong>
        </div>
      ),
    },
    {
      title: '模块',
      dataIndex: 'moduleId',
      width: 110,
      render: (value: string) => modulesById.get(value)?.name ?? value,
    },
    {
      title: '浏览器',
      dataIndex: 'browser',
      width: 105,
      render: (value: string) => <Tag>{value[0].toUpperCase() + value.slice(1)}</Tag>,
    },
    {
      title: '实时状态',
      dataIndex: 'status',
      width: 105,
      render: (value: ExecutionDetailStatus) => (
        <Tag color={statusColors[value]}>{statusLabels[value]}</Tag>
      ),
    },
    {
      title: '耗时',
      dataIndex: 'durationMs',
      width: 90,
      render: (value: number) => (value ? `${(value / 1000).toFixed(1)}s` : '-'),
    },
    {
      title: '操作',
      width: 72,
      render: (_, record) => (
        <Button
          type="text"
          icon={<EyeOutlined />}
          aria-label={`查看 ${record.caseName} 详情`}
          title="查看详情"
          disabled={!execution}
          onClick={() => setDetail(record)}
        />
      ),
    },
  ];

  const completed = execution ? execution.summary.passed + execution.summary.failed : 0;
  const progress = execution?.summary.total
    ? Math.round((completed / execution.summary.total) * 100)
    : 0;

  return (
    <section className="page-section execution-page">
      <PageHeader title="UI 自动化" description="跨浏览器回归执行" />

      <section className="execution-config" aria-labelledby="ui-execution-config-title">
        <div className="execution-section-title">
          <h2 id="ui-execution-config-title">执行配置</h2>
          {executionId ? <code>{executionId}</code> : null}
        </div>
        <div className="execution-config-grid execution-config-grid--ui">
          <label>
            <span>运行环境</span>
            <Select
              aria-label="运行环境"
              value={environment}
              options={environments.map((item) => ({ value: item.id, label: item.name }))}
              onChange={setEnvironment}
            />
          </label>
          <label>
            <span>浏览器</span>
            <Select
              aria-label="浏览器"
              value={browser}
              options={[
                { value: 'chrome', label: 'Chrome' },
                { value: 'firefox', label: 'Firefox' },
                { value: 'safari', label: 'Safari' },
                { value: 'edge', label: 'Edge' },
              ]}
              onChange={setBrowser}
            />
          </label>
          <label>
            <span>并发数</span>
            <InputNumber
              aria-label="并发数"
              min={1}
              max={20}
              value={concurrency}
              onChange={(value) => setConcurrency(value ?? 1)}
            />
          </label>
          <label className="execution-switch-field">
            <span>无头模式</span>
            <Switch aria-label="无头模式" checked={headless} onChange={setHeadless} />
          </label>
          <div className="execution-actions">
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              aria-label="立即执行"
              loading={submitting}
              disabled={execution?.status === 'RUNNING'}
              onClick={() => void run()}
            >
              立即执行
            </Button>
            <Button
              danger
              icon={<CloseCircleOutlined />}
              aria-label="取消或中断执行"
              disabled={execution?.status !== 'RUNNING'}
              onClick={() => void stop()}
            >
              中断
            </Button>
          </div>
        </div>
      </section>

      {execution ? (
        <section className="execution-progress" role="region" aria-label="UI 执行进度">
          <div className="execution-progress__main">
            <div>
              <span className="execution-kicker">{executionStatusLabels[execution.status]}</span>
              <strong>{execution.summary.total} 个用例</strong>
            </div>
            <Progress percent={progress} status={execution.status === 'FAILED' ? 'exception' : 'active'} />
          </div>
          <dl className="execution-progress__stats">
            <div><dt>已通过</dt><dd>{execution.summary.passed}</dd></div>
            <div><dt>已失败</dt><dd>{execution.summary.failed}</dd></div>
            <div><dt>运行中</dt><dd>{execution.summary.running}</dd></div>
            <div><dt>未执行</dt><dd>{execution.summary.pending}</dd></div>
          </dl>
        </section>
      ) : null}

      <section className="execution-table-panel" aria-labelledby="ui-cases-title">
        <div className="execution-section-title">
          <div>
            <h2 id="ui-cases-title">用例执行列表</h2>
            <span>{selectedIds.length ? `已选择 ${selectedIds.length} 条` : '选择需要执行的用例'}</span>
          </div>
          <label className="execution-directory-filter">
            <span>测试用例目录</span>
            <Select
              aria-label="测试用例目录"
              value={selectedModuleId ?? ''}
              options={moduleOptions}
              onChange={changeModule}
              disabled={Boolean(execution)}
            />
          </label>
        </div>
        {cases ? (
          <Table
            rowKey="caseId"
            rowSelection={rowSelection}
            columns={columns}
            dataSource={paginatedRows}
            pagination={false}
            size="small"
            scroll={{ x: 760 }}
          />
        ) : (
          <Skeleton active paragraph={{ rows: 4 }} />
        )}
        {cases ? (
          <AppPagination
            current={page}
            pageSize={pageSize}
            total={visibleRows.length}
            onChange={(nextPage, nextPageSize) => {
              setPageSize(nextPageSize);
              setPage(nextPageSize === pageSize ? nextPage : 1);
            }}
          />
        ) : null}
      </section>

      <Drawer
        title={<span id="ui-execution-detail-title">用例执行详情</span>}
        aria-labelledby="ui-execution-detail-title"
        size={620}
        open={Boolean(detail)}
        onClose={() => setDetail(undefined)}
      >
        {detail ? (
          <Tabs
            items={[
              {
                key: 'steps',
                label: '步骤明细',
                children: detail.steps?.length ? (
                  <ol className="execution-step-list">
                    {detail.steps.map((step, index) => <li key={index}>{typeof step === 'string' ? step : JSON.stringify(step)}</li>)}
                  </ol>
                ) : <Empty description="暂无步骤数据" />,
              },
              {
                key: 'media',
                label: '失败媒体',
                children: detail.screenshotUrl || detail.videoUrl ? (
                  <div className="execution-media">
                    {detail.screenshotUrl ? <img src={detail.screenshotUrl} alt={`${detail.caseName} 失败截图`} /> : null}
                    {detail.videoUrl ? <video src={detail.videoUrl} controls aria-label={`${detail.caseName} 执行录屏`} /> : null}
                    {traceViewerUrl ? (
                      <a href={traceViewerUrl} target="_blank" rel="noreferrer">
                        查看 Trace Viewer
                      </a>
                    ) : null}
                  </div>
                ) : traceViewerUrl ? (
                  <div className="execution-media">
                    <a href={traceViewerUrl} target="_blank" rel="noreferrer">
                      查看 Trace Viewer
                    </a>
                  </div>
                ) : <Empty description="暂无失败截图、录屏或追踪文件" />,
              },
              {
                key: 'logs',
                label: '终端日志',
                children: <pre className="execution-log">{detail.logs?.join('\n') || '等待执行日志'}</pre>,
              },
            ]}
          />
        ) : null}
      </Drawer>
    </section>
  );
}
