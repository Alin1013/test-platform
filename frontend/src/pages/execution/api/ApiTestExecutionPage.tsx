/**
 * 接口自动化执行页：选择接口用例、配置全局头/循环/间隔，执行后展示请求明细分析。
 */
import {
  CloseCircleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import {
  App as AntdApp,
  Button,
  Empty,
  Input,
  InputNumber,
  Modal,
  Select,
  Skeleton,
  Table,
  Tabs,
  Tag,
} from 'antd';
import type { ColumnsType, TableRowSelection } from 'antd/es/table/interface';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../../components/PageHeader';
import { AppPagination } from '../../../components/common';
import { usePlatformService } from '../../../services/PlatformServiceContext';
import type {
  ApiExecutionReport,
  ApiExecutionResult,
  ApiExecutionInput,
  ExecutionDetailStatus,
  SystemSettings,
  TestModule,
  TestEnvironment,
  TestCaseRecord,
} from '../../../services/contracts';
import '../execution.css';

interface HeaderOverride {
  // 请求头覆盖项：id 用于列表编辑定位。
  id: number;
  key: string;
  value: string;
}

interface GlobalConfigDraft {
  // 弹窗暂存的执行配置；点击保存后才覆盖页面当前值。
  environment: ApiExecutionInput['environment'];
  iterations: number;
  rampUpTime: number;
  headers: HeaderOverride[];
}

const defaultHeaderOverrides: HeaderOverride[] = [
  // 与当前 Apifox 项目的公共请求头保持一致；空值项仅作为可编辑提示，不会发送。
  { id: 1, key: 'Content-Type', value: 'application/json' },
  { id: 2, key: 'app-id', value: '' },
  { id: 3, key: 'signature', value: '' },
  { id: 4, key: 'timestamp', value: '' },
];

const methodColors: Record<string, string> = {
  GET: 'green',
  POST: 'blue',
  PUT: 'gold',
  DELETE: 'red',
};

const resultStatusLabels: Record<ExecutionDetailStatus, string> = {
  PENDING: '等待执行',
  RUNNING: '运行中',
  PASSED: '通过',
  FAILED: '失败',
  SKIPPED: '已跳过',
};

// 报告只用于进度刷新，降低轮询频率避免开发控制台被重复响应淹没。
const API_REPORT_POLL_INTERVAL_MS = 10_000;

const headersToRecord = (items: HeaderOverride[]): Record<string, string> => Object.fromEntries(
  // 空值只保留在编辑器中作为提示，持久化和执行时都不发送占位请求头。
  items
    .filter((item) => item.key.trim() && item.value.trim())
    .map((item) => [item.key.trim(), item.value]),
);

const settingsHeadersToOverrides = (globalHeaders: Record<string, string>): HeaderOverride[] => {
  const entries = Object.entries(globalHeaders);
  // 首次升级旧配置时保留页面已有的四个常用请求头编辑项。
  if (!entries.length) return defaultHeaderOverrides.map((header) => ({ ...header }));
  return entries.map(([key, value], index) => ({ id: index + 1, key, value }));
};

export function ApiTestExecutionPage() {
  // 初次加载拉取接口用例与环境；执行中按低频间隔轮询报告。
  const service = usePlatformService();
  const navigate = useNavigate();
  const { message } = AntdApp.useApp();
  const [cases, setCases] = useState<TestCaseRecord[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [environments, setEnvironments] = useState<TestEnvironment[]>([]);
  const [modules, setModules] = useState<TestModule[]>([]);
  const [environment, setEnvironment] = useState<ApiExecutionInput['environment']>('');
  const [iterations, setIterations] = useState(1);
  const [rampUpTime, setRampUpTime] = useState(0);
  const [headers, setHeaders] = useState<HeaderOverride[]>(defaultHeaderOverrides);
  const [headerSequence, setHeaderSequence] = useState(defaultHeaderOverrides.length + 1);
  const [executionId, setExecutionId] = useState<string>();
  const [report, setReport] = useState<ApiExecutionReport | null>(null);
  const [selectedResult, setSelectedResult] = useState<ApiExecutionResult>();
  const [submitting, setSubmitting] = useState(false);
  const [projectId] = useState(1);
  const [systemSettings, setSystemSettings] = useState<SystemSettings>();
  const [globalConfigOpen, setGlobalConfigOpen] = useState(false);
  const [globalConfigDraft, setGlobalConfigDraft] = useState<GlobalConfigDraft>();
  const [savingGlobalConfig, setSavingGlobalConfig] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const openAnomalyAnalysis = (target: ApiExecutionResult) => {
    // 将请求、响应和断言结果组成分析上下文，保留接口失败的完整证据链。
    const failedAssertions = target.assertions.filter((assertion) => !assertion.passed);
    const assertionEvidence = failedAssertions.map((assertion) => ({
      expression: assertion.expression,
      actual: assertion.actual,
    }));
    navigate('/exception-analysis', {
      state: {
        sourceType: 'EXECUTION',
        content: JSON.stringify({
          responseCode: target.responseCode,
          response: target.responseData,
          failedAssertions,
        }, null, 2),
        context: {
          projectId,
          testCaseId: target.apiId,
          executionId,
          testCase: target.name,
          environment,
          step: failedAssertions.map((assertion) => assertion.expression).join('\n') || '接口响应校验',
          expected: failedAssertions.map((assertion) => `满足断言：${assertion.expression}`).join('\n') || '接口返回符合用例断言',
          actual: target.responseCode == null ? target.status : `HTTP ${target.responseCode}`,
          request: target.requestData,
          response: target.responseData,
          log: assertionEvidence.length ? JSON.stringify(assertionEvidence, null, 2) : undefined,
        },
      },
    });
  };

  useEffect(() => {
    let active = true;
    void Promise.all([
      service.listTestCases({ type: 'api' }),
      service.getSystemSettings(),
      service.listTestModules(),
    ]).then(([rows, settings, testModules]) => {
      if (!active) return;
      setSystemSettings(settings);
      setCases(rows);
      setPage(1);
      setEnvironments(settings.execution.environments);
      setModules(testModules);
      const defaultEnvironment = settings.execution.environments.find(
        (item) => item.id === settings.execution.defaultEnvironmentId,
      );
      setEnvironment(defaultEnvironment?.id ?? settings.execution.environments[0]?.id ?? '');
      setIterations(settings.execution.defaultIterations);
      setRampUpTime(settings.execution.defaultRampUpTime);
      const configuredHeaders = settingsHeadersToOverrides(settings.execution.globalHeaders);
      setHeaders(configuredHeaders);
      setHeaderSequence(configuredHeaders.length + 1);
    });
    return () => {
      active = false;
    };
  }, [service]);

  useEffect(() => {
    // PENDING 表示等待 Worker 领取，RUNNING 表示已开始执行；两种活动状态都要持续刷新。
    const isActiveExecution = report?.status === 'PENDING' || report?.status === 'RUNNING';
    if (!executionId || !isActiveExecution) return;
    const timer = window.setInterval(() => {
      // 页面切到后台时暂停请求，回到前台后由下一轮轮询恢复进度。
      if (document.hidden) return;
      void service.getApiExecutionReport(executionId).then(setReport).catch(() => undefined);
    }, API_REPORT_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [executionId, report?.status, service]);

  const globalHeaders = useMemo(
    () => headersToRecord(headers),
    [headers],
  );

  const run = async () => {
    // 校验选中项与项目后启动执行，并立即拉取一次初始结果。
    if (!selectedIds.length) {
      message.warning('请至少选择一个 接口自动化用例');
      return;
    }
    const projectId = modules[0]?.projectId;
    if (!projectId) {
      message.error('未找到当前项目');
      return;
    }
    setSubmitting(true);
    try {
      const started = await service.startApiExecution({
        projectId,
        suiteIds: selectedIds,
        environment,
        globalHeaders,
        iterations,
        rampUpTime,
      });
      setExecutionId(started.executionId);
      const nextReport = await service.getApiExecutionReport(started.executionId);
      setReport(nextReport);
      setSelectedResult(nextReport.results[0]);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '接口自动化执行启动失败');
    } finally {
      setSubmitting(false);
    }
  };

  const stop = async () => {
    if (!executionId) return;
    await service.stopApiExecution(executionId);
    setReport(await service.getApiExecutionReport(executionId));
  };

  const openGlobalConfig = () => {
    // 使用副本编辑，避免用户取消弹窗时意外改变正在使用的执行配置。
    setGlobalConfigDraft({
      environment,
      iterations,
      rampUpTime,
      headers: headers.map((header) => ({ ...header })),
    });
    setGlobalConfigOpen(true);
  };

  const saveGlobalConfig = async () => {
    if (!globalConfigDraft || !systemSettings) return;
    setSavingGlobalConfig(true);
    try {
      const savedSettings = await service.updateSystemSettings({
        ...systemSettings,
        execution: {
          ...systemSettings.execution,
          defaultEnvironmentId: globalConfigDraft.environment,
          globalHeaders: headersToRecord(globalConfigDraft.headers),
          defaultIterations: globalConfigDraft.iterations,
          defaultRampUpTime: globalConfigDraft.rampUpTime,
        },
      });
      setSystemSettings(savedSettings);
      setEnvironment(savedSettings.execution.defaultEnvironmentId);
      setIterations(savedSettings.execution.defaultIterations);
      setRampUpTime(savedSettings.execution.defaultRampUpTime);
      setHeaders(settingsHeadersToOverrides(savedSettings.execution.globalHeaders));
      setHeaderSequence(Object.keys(savedSettings.execution.globalHeaders).length + 1);
      setGlobalConfigOpen(false);
      message.success('全局配置已保存');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '全局配置保存失败');
    } finally {
      setSavingGlobalConfig(false);
    }
  };

  const exportReport = () => {
    // 报告以 JSON 文件下载。
    if (!report) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${report.executionId}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const rowSelection: TableRowSelection<TestCaseRecord> = {
    selectedRowKeys: selectedIds,
    onChange: (keys) => setSelectedIds(keys.map(Number)),
    getCheckboxProps: (record) => ({
      'aria-label': `选择 ${record.id} ${record.name}`,
    }),
  };

  const columns: ColumnsType<TestCaseRecord> = [
    {
      title: '接口名称',
      dataIndex: 'name',
      ellipsis: true,
      render: (name: string) => (
        <div className="execution-name-cell"><strong>{name}</strong></div>
      ),
    },
    {
      title: '模块',
      dataIndex: 'moduleName',
      width: 130,
      render: (value: string | undefined) => value || '-',
    },
    {
      title: '方法',
      dataIndex: 'method',
      width: 88,
      render: (method: string) => <Tag color={methodColors[method]}>{method}</Tag>,
    },
    { title: '接口地址', dataIndex: 'endpoint', ellipsis: true },
    { title: '预期状态', dataIndex: 'expectedStatus', width: 96 },
  ];

  const paginatedCases = useMemo(() => {
    // 表格只渲染当前页，选择状态仍由 selectedIds 保存，因此翻页不会丢失已选接口。
    const start = (page - 1) * pageSize;
    return (cases ?? []).slice(start, start + pageSize);
  }, [cases, page, pageSize]);

  useEffect(() => {
    // 用例数量变化后收敛页码，避免删除或刷新导致当前页为空。
    const totalPages = Math.max(1, Math.ceil((cases?.length ?? 0) / pageSize));
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [cases, pageSize]);

  const total = report?.summary.totalApi ?? 0;
  const passed = report?.summary.passedApi ?? 0;
  const passRate = total ? Math.round((passed / total) * 100) : 0;
  // 排队和执行中都属于活动状态，避免重复提交并允许用户取消等待中的任务。
  const isActiveExecution = report?.status === 'PENDING' || report?.status === 'RUNNING';

  return (
    <section className="page-section execution-page">
      <PageHeader title="接口自动化" description="接口集合批量执行与断言分析" />

      <section className="execution-config" aria-labelledby="api-execution-config-title">
        <div className="execution-section-title">
          {/* 内部执行编号对用户无意义（仅后端轮询与中断需要），按用户反馈移除展示，避免与业务信息混淆。 */}
          <h2 id="api-execution-config-title">执行配置</h2>
        </div>
        <div className="execution-config-grid execution-config-grid--api">
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
            <span>循环次数</span>
            <InputNumber
              aria-label="循环次数"
              min={1}
              max={100}
              value={iterations}
              onChange={(value) => setIterations(value ?? 1)}
            />
          </label>
          <label>
            <span>并发间隔 (ms)</span>
            <InputNumber
              aria-label="并发间隔"
              min={0}
              max={60000}
              step={100}
              value={rampUpTime}
              onChange={(value) => setRampUpTime(value ?? 0)}
            />
          </label>
          <div className="execution-actions">
            <Button icon={<SettingOutlined />} aria-label="全局配置" onClick={openGlobalConfig}>
              全局配置
            </Button>
            <Button type="primary" icon={<PlayCircleOutlined />} aria-label="开始执行" loading={submitting} disabled={isActiveExecution} onClick={() => void run()}>
              开始执行
            </Button>
            <Button danger icon={<CloseCircleOutlined />} disabled={!isActiveExecution} onClick={() => void stop()}>
              中断
            </Button>
            <Button icon={<DownloadOutlined />} aria-label="导出报告" disabled={!report} onClick={exportReport}>
              导出报告
            </Button>
          </div>
        </div>

        <div className="header-overrides">
          <div className="header-overrides__heading">
            <span>请求头覆盖</span>
            <Button
              type="text"
              size="small"
              icon={<PlusOutlined />}
              aria-label="添加请求头"
              onClick={() => {
                setHeaders((current) => [...current, { id: headerSequence, key: '', value: '' }]);
                setHeaderSequence((value) => value + 1);
              }}
            >
              添加请求头
            </Button>
          </div>
          {headers.map((item) => (
            <div className="header-override-row" key={item.id}>
              <Input
                aria-label={`请求头名称 ${item.id}`}
                placeholder="Header"
                value={item.key}
                onChange={(event) => setHeaders((current) => current.map((header) => header.id === item.id ? { ...header, key: event.target.value } : header))}
              />
              <Input
                aria-label={`请求头值 ${item.id}`}
                placeholder="Value"
                value={item.value}
                onChange={(event) => setHeaders((current) => current.map((header) => header.id === item.id ? { ...header, value: event.target.value } : header))}
              />
              <Button type="text" danger icon={<DeleteOutlined />} aria-label={`删除请求头 ${item.id}`} onClick={() => setHeaders((current) => current.filter((header) => header.id !== item.id))} />
            </div>
          ))}
        </div>
      </section>

      <Modal
        title="全局配置"
        open={globalConfigOpen}
        width={720}
        destroyOnHidden
        okText="保存配置"
        cancelText="取消"
        okButtonProps={{ 'aria-label': '保存全局配置' }}
        cancelButtonProps={{ 'aria-label': '取消全局配置' }}
        confirmLoading={savingGlobalConfig}
        onOk={() => void saveGlobalConfig()}
        onCancel={() => setGlobalConfigOpen(false)}
      >
        {globalConfigDraft ? (
          <div className="global-config-form">
            <div className="global-config-form__grid">
              <label>
                <span>运行环境</span>
                <Select
                  aria-label="全局配置运行环境"
                  value={globalConfigDraft.environment}
                  options={environments.map((item) => ({ value: item.id, label: item.name }))}
                  onChange={(value) => setGlobalConfigDraft((current) => current ? { ...current, environment: value } : current)}
                />
              </label>
              <label>
                <span>循环次数</span>
                <InputNumber
                  aria-label="全局配置循环次数"
                  min={1}
                  max={100}
                  value={globalConfigDraft.iterations}
                  onChange={(value) => setGlobalConfigDraft((current) => current ? { ...current, iterations: value ?? 1 } : current)}
                />
              </label>
              <label>
                <span>并发间隔 (ms)</span>
                <InputNumber
                  aria-label="全局配置并发间隔"
                  min={0}
                  max={60000}
                  step={100}
                  value={globalConfigDraft.rampUpTime}
                  onChange={(value) => setGlobalConfigDraft((current) => current ? { ...current, rampUpTime: value ?? 0 } : current)}
                />
              </label>
            </div>
            <div className="global-config-headers">
              <div className="global-config-headers__heading">
                <span>全局请求头</span>
                <Button
                  type="text"
                  size="small"
                  icon={<PlusOutlined />}
                  aria-label="添加全局请求头"
                  onClick={() => {
                    setGlobalConfigDraft((current) => current ? {
                      ...current,
                      headers: [...current.headers, { id: headerSequence, key: '', value: '' }],
                    } : current);
                    setHeaderSequence((value) => value + 1);
                  }}
                >
                  添加请求头
                </Button>
              </div>
              {globalConfigDraft.headers.map((item) => (
                <div className="header-override-row" key={item.id}>
                  <Input
                    aria-label={`全局请求头名称 ${item.id}`}
                    placeholder="Header"
                    value={item.key}
                    onChange={(event) => setGlobalConfigDraft((current) => current ? {
                      ...current,
                      headers: current.headers.map((header) => header.id === item.id ? { ...header, key: event.target.value } : header),
                    } : current)}
                  />
                  <Input
                    aria-label={`全局请求头值 ${item.id}`}
                    placeholder="Value"
                    value={item.value}
                    onChange={(event) => setGlobalConfigDraft((current) => current ? {
                      ...current,
                      headers: current.headers.map((header) => header.id === item.id ? { ...header, value: event.target.value } : header),
                    } : current)}
                  />
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    aria-label={`删除全局请求头 ${item.id}`}
                    onClick={() => setGlobalConfigDraft((current) => current ? {
                      ...current,
                      headers: current.headers.filter((header) => header.id !== item.id),
                    } : current)}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Modal>

      <section className="api-metrics" role="region" aria-label="接口执行指标">
        <div><span>总请求数</span><strong>{total}</strong></div>
        <div><span>平均响应时间</span><strong>{report?.summary.avgResponseTimeMs ?? 0}<small> ms</small></strong></div>
        <div><span>通过率</span><strong>{passRate}<small>%</small></strong></div>
        <div><span>失败接口</span><strong>{report?.summary.failedApi ?? 0}</strong></div>
      </section>

      <section className="execution-table-panel" aria-labelledby="api-cases-title">
        <div className="execution-section-title">
          <div><h2 id="api-cases-title">接口测试集</h2><span>{selectedIds.length ? `已选择 ${selectedIds.length} 条` : '选择需要执行的接口'}</span></div>
        </div>
        {cases ? (
          <Table
            rowKey={(record) => record.storageId ?? record.id}
            rowSelection={report ? undefined : rowSelection}
            columns={columns}
            dataSource={paginatedCases}
            pagination={false}
            size="small"
            scroll={{ x: 760 }}
          />
        ) : <Skeleton active paragraph={{ rows: 4 }} />}
        {cases ? (
          <AppPagination
            current={page}
            pageSize={pageSize}
            total={cases.length}
            onChange={(nextPage, nextPageSize) => {
              setPageSize(nextPageSize);
              setPage(nextPageSize === pageSize ? nextPage : 1);
            }}
          />
        ) : null}
      </section>

      <section className="api-analysis" role="region" aria-label="接口结果分析">
        <aside className="api-result-list">
          <div className="execution-section-title"><h2>请求明细</h2></div>
          {report?.results.length ? report.results.map((result) => (
            <button
              type="button"
              className={selectedResult?.apiId === result.apiId ? 'api-result-item is-selected' : 'api-result-item'}
              key={result.apiId}
              aria-label={`查看 ${result.name} 请求分析`}
              onClick={() => setSelectedResult(result)}
            >
              <span><Tag color={methodColors[result.method]}>{result.method}</Tag>{result.name}</span>
              <small>{result.responseCode ?? '-'} · {resultStatusLabels[result.status]}</small>
            </button>
          )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无执行结果" />}
        </aside>
        <div className="api-result-detail">
          {selectedResult ? (
            <>
              {selectedResult.status === 'FAILED' ? (
                <div className="api-result-detail__actions">
                  <Button
                    type="primary"
                    ghost
                    icon={<PlayCircleOutlined />}
                    onClick={() => openAnomalyAnalysis(selectedResult)}
                  >
                    AI 分析异常
                  </Button>
                </div>
              ) : null}
              <Tabs
                items={[
                {
                  key: 'request',
                  label: 'Request',
                  children: <pre>{JSON.stringify({ method: selectedResult.method, url: selectedResult.url, ...selectedResult.requestData }, null, 2)}</pre>,
                },
                {
                  key: 'response',
                  label: 'Response',
                  children: <pre>{JSON.stringify({ status: selectedResult.responseCode, body: selectedResult.responseData }, null, 2)}</pre>,
                },
                {
                  key: 'assertions',
                  label: 'Assertions',
                  children: selectedResult.assertions.length ? selectedResult.assertions.map((assertion) => (
                    <div className="assertion-row" key={assertion.expression}>
                      <span>{assertion.expression}</span>
                      <Tag color={assertion.passed ? 'success' : 'error'}>{assertion.passed ? 'Passed' : 'Failed'}</Tag>
                    </div>
                  )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无断言结果" />,
                },
                ]}
              />
            </>
          ) : <Empty description="选择一条请求查看分析" />}
        </div>
      </section>
    </section>
  );
}
