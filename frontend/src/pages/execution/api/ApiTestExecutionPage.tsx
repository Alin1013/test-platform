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
} from '@ant-design/icons';
import {
  App as AntdApp,
  Button,
  Empty,
  Input,
  InputNumber,
  Select,
  Skeleton,
  Table,
  Tabs,
  Tag,
} from 'antd';
import type { ColumnsType, TableRowSelection } from 'antd/es/table/interface';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../../components/PageHeader';
import { usePlatformService } from '../../../services/PlatformServiceContext';
import type {
  ApiExecutionReport,
  ApiExecutionResult,
  ApiExecutionInput,
  ExecutionDetailStatus,
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

export function ApiTestExecutionPage() {
  // 初次加载拉取接口用例与环境；执行中每 2 秒轮询报告。
  const service = usePlatformService();
  const { message } = AntdApp.useApp();
  const [cases, setCases] = useState<TestCaseRecord[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [environments, setEnvironments] = useState<TestEnvironment[]>([]);
  const [modules, setModules] = useState<TestModule[]>([]);
  const [environment, setEnvironment] = useState<ApiExecutionInput['environment']>('');
  const [iterations, setIterations] = useState(1);
  const [rampUpTime, setRampUpTime] = useState(0);
  const [headers, setHeaders] = useState<HeaderOverride[]>([]);
  const [headerSequence, setHeaderSequence] = useState(1);
  const [executionId, setExecutionId] = useState<string>();
  const [report, setReport] = useState<ApiExecutionReport | null>(null);
  const [selectedResult, setSelectedResult] = useState<ApiExecutionResult>();
  const [submitting, setSubmitting] = useState(false);
  const [projectId] = useState(1);

  useEffect(() => {
    let active = true;
    void Promise.all([
      service.listTestCases({ type: 'api' }),
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
    // 仅 RUNNING 状态轮询报告，终态后停止请求。
    if (!executionId || report?.status !== 'RUNNING') return;
    const timer = window.setInterval(() => {
      void service.getApiExecutionReport(executionId).then(setReport).catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [executionId, report?.status, service]);

  const globalHeaders = useMemo(
    // 过滤空 key 的覆盖头，转为对象传给后端。
    () => Object.fromEntries(headers.filter((item) => item.key.trim()).map((item) => [item.key.trim(), item.value])),
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
        envId: 0
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

  const total = report?.summary.totalApi ?? 0;
  const passed = report?.summary.passedApi ?? 0;
  const passRate = total ? Math.round((passed / total) * 100) : 0;

  return (
    <section className="page-section execution-page">
      <PageHeader title="接口自动化" description="接口集合批量执行与断言分析" />

      <section className="execution-config" aria-labelledby="api-execution-config-title">
        <div className="execution-section-title">
          <h2 id="api-execution-config-title">执行配置</h2>
          {executionId ? <code>{executionId}</code> : null}
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
            <Button type="primary" icon={<PlayCircleOutlined />} aria-label="开始执行" loading={submitting} disabled={report?.status === 'RUNNING'} onClick={() => void run()}>
              开始执行
            </Button>
            <Button danger icon={<CloseCircleOutlined />} disabled={report?.status !== 'RUNNING'} onClick={() => void stop()}>
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
            dataSource={cases}
            pagination={false}
            size="small"
            scroll={{ x: 760 }}
          />
        ) : <Skeleton active paragraph={{ rows: 4 }} />}
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
          ) : <Empty description="选择一条请求查看分析" />}
        </div>
      </section>
    </section>
  );
}
