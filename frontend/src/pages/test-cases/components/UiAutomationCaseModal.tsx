import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  HolderOutlined,
  PlusOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Alert, App, Button, Form, Input, InputNumber, Modal, Select, Tag, Tooltip } from 'antd';
import { useEffect, useState } from 'react';
import { useAuth } from '../../../services/AuthContext';
import { usePlatformService } from '../../../services/PlatformServiceContext';
import type {
  CreateTestCaseInput,
  ApiKeyValueItem,
  Priority,
  TestCaseRecord,
  TestCaseStatus,
  TestEnvironment,
  TestModule,
  UiAction,
  UiAssertion,
  UiAutomationStep,
  UiDebugResult,
} from '../../../services/contracts';
import { DebugVariableEditor, debugVariablesToRecord } from './DebugVariableEditor';
import { moduleSelectOptions } from '../moduleOptions';
import { testCaseStatusOptions } from '../testCaseOptions';

const { TextArea } = Input;

const actionOptions: Array<{ value: UiAction; label: string }> = [
  { value: 'click', label: 'Click（点击）' },
  { value: 'input', label: 'Input（输入）' },
  { value: 'navigate', label: 'Navigate（页面跳转）' },
  { value: 'hover', label: 'Hover（悬停）' },
  { value: 'wait', label: 'Wait（等待）' },
  { value: 'assert', label: 'Assert（断言）' },
];

const locatorOptions = [
  { value: 'xpath', label: 'XPath' },
  { value: 'css', label: 'CSS Selector' },
  { value: 'id', label: 'ID' },
  { value: 'text', label: 'Text' },
];

const assertionOptions: Array<{ value: UiAssertion; label: string }> = [
  { value: 'none', label: '无断言' },
  { value: 'textEquals', label: '元素文本等于' },
  { value: 'isVisible', label: '元素可见' },
  { value: 'urlEquals', label: '页面 URL 等于' },
];

const priorityColors: Record<Priority, string | undefined> = {
  P0: 'error',
  P1: 'gold',
  P2: 'gold',
  P3: 'gold',
};

const createStep = (action: UiAction = 'navigate'): UiAutomationStep => ({
  action,
  locatorType: 'css',
  target: '',
  value: '',
  assertion: 'none',
  expected: '',
});

const buildTraceViewerUrl = (traceUrl: string | null | undefined) => {
  if (!traceUrl) return null;
  const absoluteTraceUrl = /^https?:\/\//.test(traceUrl)
    ? traceUrl
    : new URL(traceUrl, globalThis.location?.origin ?? 'http://localhost').toString();
  return `https://trace.playwright.dev/?trace=${encodeURIComponent(absoluteTraceUrl)}`;
};

interface UiCaseFormValues {
  name: string;
  moduleId: string;
  priority: Priority;
  maintainer: string;
  description: string;
  dependencyCaseId?: number;
  browser: 'chrome' | 'firefox';
  environment: string;
  timeoutSeconds: number;
  retryCount: number;
  steps: UiAutomationStep[];
  debugVariables: ApiKeyValueItem[];
  status?: TestCaseStatus;
}

const uiDebugFieldNames: Array<keyof UiCaseFormValues> = [
  'browser',
  'environment',
  'timeoutSeconds',
  'steps',
  'debugVariables',
];

interface UiAutomationCaseModalProps {
  open: boolean;
  defaultModule: string;
  initialCase?: TestCaseRecord;
  onClose: () => void;
  onSubmit: (input: CreateTestCaseInput) => Promise<TestCaseRecord>;
}

interface StepFieldsProps {
  index: number;
}

function StepFields({ index }: StepFieldsProps) {
  return (
    <Form.Item noStyle shouldUpdate>
      {({ getFieldValue, setFieldValue }) => {
        const action = getFieldValue(['steps', index, 'action']) as UiAction | undefined;
        const assertion = getFieldValue(['steps', index, 'assertion']) as UiAssertion | undefined;
        const skipsLocator = action === 'navigate' || action === 'wait';
        const skipsValue = action === 'navigate' || action === 'click' || action === 'hover' || action === 'assert';

        return (
          <>
            <Form.Item
              className="ui-step-field"
              name={[index, 'action']}
              label="操作类型"
              rules={[{ required: true, message: '请选择操作类型' }]}
            >
              <Select
                aria-label={`步骤 ${index + 1} 操作类型`}
                options={actionOptions}
                onChange={(nextAction: UiAction) => {
                  if (
                    nextAction === 'assert' &&
                    getFieldValue(['steps', index, 'assertion']) === 'none'
                  ) {
                    setFieldValue(['steps', index, 'assertion'], 'textEquals');
                  }
                }}
              />
            </Form.Item>
            <Form.Item
              className="ui-step-field"
              name={[index, 'locatorType']}
              label="定位方式"
              rules={skipsLocator ? [] : [{ required: true, message: '请选择定位方式' }]}
            >
              <Select
                aria-label={`步骤 ${index + 1} 定位方式`}
                disabled={skipsLocator}
                options={locatorOptions}
              />
            </Form.Item>
            <Form.Item
              className="ui-step-field ui-step-field--target"
              name={[index, 'target']}
              label={action === 'navigate' ? '目标 URL' : '元素定位值'}
              rules={
                action === 'wait'
                  ? []
                  : [{ required: true, whitespace: true, message: '请输入目标地址或元素定位值' }]
              }
            >
              <Input
                aria-label={`步骤 ${index + 1} 元素定位值`}
                disabled={action === 'wait'}
                placeholder={action === 'navigate' ? 'https://test.example.com/login' : '#username-input'}
              />
            </Form.Item>
            <Form.Item
              className="ui-step-field"
              name={[index, 'value']}
              label="操作值"
              rules={
                action === 'input' || action === 'wait'
                  ? [{ required: true, whitespace: true, message: '请输入操作值' }]
                  : []
              }
            >
              <Input
                aria-label={`步骤 ${index + 1} 操作值`}
                disabled={skipsValue}
                placeholder={action === 'wait' ? '等待毫秒数' : '输入文本'}
              />
            </Form.Item>
            <Form.Item
              className="ui-step-field"
              name={[index, 'assertion']}
              label="预期断言"
              rules={[
                {
                  validator: async (_, value: UiAssertion) => {
                    if (action === 'assert' && value === 'none') {
                      throw new Error('Assert 步骤必须选择断言');
                    }
                  },
                },
              ]}
            >
              <Select aria-label={`步骤 ${index + 1} 预期断言`} options={assertionOptions} />
            </Form.Item>
            <Form.Item
              className="ui-step-field"
              name={[index, 'expected']}
              label="断言期望值"
              rules={
                assertion && assertion !== 'none' && assertion !== 'isVisible'
                  ? [{ required: true, whitespace: true, message: '请输入断言期望值' }]
                  : []
              }
            >
              <Input
                aria-label={`步骤 ${index + 1} 断言期望值`}
                disabled={!assertion || assertion === 'none' || assertion === 'isVisible'}
                placeholder={assertion === 'urlEquals' ? 'https://test.example.com/home' : '期望文本'}
              />
            </Form.Item>
          </>
        );
      }}
    </Form.Item>
  );
}

export function UiAutomationCaseModal({
  open,
  defaultModule,
  initialCase,
  onClose,
  onSubmit,
}: UiAutomationCaseModalProps) {
  const [form] = Form.useForm<UiCaseFormValues>();
  const { message } = App.useApp();
  const { user } = useAuth();
  const service = usePlatformService();
  const [dependencyCases, setDependencyCases] = useState<TestCaseRecord[]>([]);
  const [modules, setModules] = useState<TestModule[]>([]);
  const [environments, setEnvironments] = useState<TestEnvironment[]>([]);
  const [discardConfirmationOpen, setDiscardConfirmationOpen] = useState(false);
  const [draggedStep, setDraggedStep] = useState<number | null>(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugResult, setDebugResult] = useState<UiDebugResult | null>(null);
  const [debugError, setDebugError] = useState<string | null>(null);
  const steps = Form.useWatch('steps', form) ?? [];
  const traceViewerUrl = buildTraceViewerUrl(debugResult?.traceUrl);

  useEffect(() => {
    if (!open) return;
    const details = initialCase?.uiDetails;
    form.resetFields();
    form.setFieldsValue({
      name: initialCase?.name,
      moduleId: initialCase?.moduleId ?? (defaultModule === 'all' ? 'auth' : defaultModule),
      priority: initialCase?.priority ?? 'P1',
      status: initialCase?.status ?? '维护中',
      maintainer: initialCase?.maintainer ?? user?.name ?? '当前用户',
      description: details?.description ?? '',
      dependencyCaseId: details?.dependencyCaseId,
      browser: details?.browser ?? 'chrome',
      environment: details?.environment,
      timeoutSeconds: details?.timeoutSeconds ?? 30,
      retryCount: details?.retryCount ?? 1,
      steps: details?.steps?.length ? details.steps : [createStep()],
      debugVariables: [],
    });
    setDebugResult(null);
    setDebugError(null);
    let active = true;
    void Promise.all([
      service.listTestCases({ type: 'ui' }),
      service.listTestModules(1),
      service.getSystemSettings(),
    ]).then(
      ([cases, nextModules, settings]) => {
        if (!active) return;
        setDependencyCases(cases);
        setModules(nextModules);
        setEnvironments(settings.execution.environments);
        if (!details?.environment && !form.isFieldTouched('environment')) {
          form.setFieldValue('environment', settings.execution.defaultEnvironmentId);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [defaultModule, form, initialCase, open, service, user?.name]);

  const requestClose = () => {
    if (!form.isFieldsTouched()) {
      form.resetFields();
      onClose();
      return;
    }
    setDiscardConfirmationOpen(true);
  };

  const submit = async (values: UiCaseFormValues) => {
    const created = await onSubmit({
      type: 'ui',
      authorId: user?.id,
      moduleId: values.moduleId,
      name: values.name,
      priority: values.priority,
      status: values.status ?? '维护中',
      uiDetails: {
        description: values.description?.trim() ?? '',
        dependencyCaseId: values.dependencyCaseId,
        browser: values.browser,
        environment: values.environment,
        timeoutSeconds: values.timeoutSeconds,
        retryCount: values.retryCount,
        steps: values.steps,
      },
    });
    form.resetFields();
    onClose();
    void message.success(`UI自动化已${initialCase ? '更新' : '创建'}：${created.name}`);
  };

  const debugRequest = async () => {
    try {
      const values = await form.validateFields(uiDebugFieldNames, { recursive: true });
      setDebugLoading(true);
      setDebugResult(null);
      setDebugError(null);
      const result = await service.debugUiCase({
        environment: values.environment,
        variables: debugVariablesToRecord(values.debugVariables),
        browser: values.browser,
        headless: true,
        timeoutSeconds: values.timeoutSeconds,
        steps: values.steps.map((step, index) => ({
          ...step,
          stepIndex: index + 1,
          value: step.action === 'navigate' ? step.target : step.value,
        })),
      });
      setDebugResult(result);
    } catch (error) {
      const validationErrors = form
        .getFieldsError(uiDebugFieldNames)
        .some((field) => field.errors.length > 0);
      if (validationErrors) {
        void message.warning('请先补全必填项并修正配置错误');
      } else {
        setDebugError(error instanceof Error ? error.message : 'UI 调试运行失败');
      }
    } finally {
      setDebugLoading(false);
    }
  };

  return (
    <>
      <Modal
        title={`${initialCase ? '编辑' : '新建'}UI自动化`}
        aria-label={`${initialCase ? '编辑' : '新建'}UI自动化`}
        className="ui-case-modal"
        width={1120}
        open={open}
        destroyOnHidden
        mask={{ closable: false }}
        onCancel={requestClose}
        footer={[
          <Button
            key="debug"
            className="ui-debug-button"
            icon={<ThunderboltOutlined />}
            aria-label="调试运行"
            loading={debugLoading}
            disabled={debugLoading}
            onClick={() => void debugRequest()}
          >
            调试运行
          </Button>,
          <Button key="cancel" aria-label="取消" onClick={requestClose}>
            取消
          </Button>,
          <Button
            key="submit"
            type="primary"
            aria-label={initialCase ? '保存' : '创建用例'}
            onClick={() => form.submit()}
          >
            {initialCase ? '保存' : '创建用例'}
          </Button>,
        ]}
      >
        <Form
          form={form}
          layout="vertical"
          requiredMark="optional"
          onFinish={(values) => void submit(values)}
        >
          <section className="ui-case-section" aria-labelledby="ui-basic-info-title">
            <h3 id="ui-basic-info-title" className="ui-case-section__title">
              基本信息
            </h3>
            <div className="ui-case-basic-grid">
              <Form.Item
                className="ui-case-field--wide"
                name="name"
                label="用例名称"
                rules={[{ required: true, whitespace: true, message: '请输入用例名称' }]}
              >
                <Input placeholder="例如：用户登录 - 密码错误提示校验" maxLength={255} />
              </Form.Item>
              <Form.Item name="moduleId" label="所属模块" rules={[{ required: true, message: '请选择所属模块' }]}>
                <Select aria-label="所属模块" options={moduleSelectOptions(modules)} />
              </Form.Item>
              <Form.Item name="priority" label="优先级" rules={[{ required: true, message: '请选择优先级' }]}>
                <Select
                  aria-label="优先级"
                  options={(Object.keys(priorityColors) as Priority[]).map((priority) => ({
                    value: priority,
                    label: <Tag color={priorityColors[priority]}>{priority}</Tag>,
                  }))}
                />
              </Form.Item>
              {initialCase ? (
                <Form.Item name="status" label="状态" rules={[{ required: true }]}>
                  <Select
                    aria-label="状态"
                    options={testCaseStatusOptions.map((value) => ({
                      value,
                      label: value,
                    }))}
                  />
                </Form.Item>
              ) : null}
              <Form.Item name="maintainer" label="维护人">
                <Input aria-label="维护人" disabled />
              </Form.Item>
              <Form.Item className="ui-case-field--full" name="description" label="用例描述">
                <TextArea
                  rows={3}
                  maxLength={4000}
                  showCount
                  placeholder="说明前置条件、测试目的和需要关注的业务风险"
                />
              </Form.Item>
            </div>
          </section>

          <section className="ui-case-section" aria-labelledby="ui-execution-config-title">
            <h3 id="ui-execution-config-title" className="ui-case-section__title">
              执行配置
            </h3>
            <div className="ui-case-config-grid">
              <Form.Item name="dependencyCaseId" label="前置依赖用例">
                <Select
                  aria-label="前置依赖用例"
                  allowClear
                  placeholder="无前置依赖"
                  options={dependencyCases.map((testCase) => ({
                    value: testCase.storageId,
                    label: `${testCase.id} · ${testCase.name}`,
                  }))}
                />
              </Form.Item>
              <Form.Item name="browser" label="默认浏览器" rules={[{ required: true }]}>
                <Select
                  aria-label="默认浏览器"
                  options={[
                    { value: 'chrome', label: 'Chrome' },
                    { value: 'firefox', label: 'Firefox' },
                  ]}
                />
              </Form.Item>
              <Form.Item name="environment" label="默认环境" rules={[{ required: true }]}>
                <Select
                  aria-label="默认环境"
                  options={environments.map((environment) => ({
                    value: environment.id,
                    label: environment.name,
                  }))}
                />
              </Form.Item>
              <Form.Item name="timeoutSeconds" label="超时时间（秒）" rules={[{ required: true }]}>
                <InputNumber aria-label="超时时间" min={1} max={3600} controls className="ui-case-number" />
              </Form.Item>
              <Form.Item name="retryCount" label="失败重试次数" rules={[{ required: true }]}>
                <InputNumber aria-label="失败重试次数" min={0} max={3} controls className="ui-case-number" />
              </Form.Item>
            </div>
            <div className="ui-debug-variables">
              <span className="ui-debug-variables__label">临时变量</span>
              <DebugVariableEditor />
            </div>
          </section>

          <section className="ui-case-section" aria-labelledby="ui-step-editor-title">
            <div className="ui-case-section__heading">
              <h3 id="ui-step-editor-title" className="ui-case-section__title">
                自动化步骤
              </h3>
              <span className="ui-case-section__count">{steps.length} 个步骤</span>
            </div>
            <Form.List
              name="steps"
              rules={[
                {
                  validator: async (_, value?: UiAutomationStep[]) => {
                    if (!value?.length) throw new Error('请至少添加一个自动化步骤');
                  },
                },
              ]}
            >
              {(fields, { add, remove, move }, { errors }) => (
                <div className="ui-step-editor">
                  {fields.map((field, index) => (
                    <div
                      className="ui-step-row"
                      key={field.key}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => {
                        if (draggedStep !== null && draggedStep !== index) move(draggedStep, index);
                        setDraggedStep(null);
                      }}
                    >
                      <div className="ui-step-row__header">
                        <div
                          className="ui-step-row__drag"
                          role="button"
                          aria-label={`拖拽步骤 ${index + 1}`}
                          tabIndex={0}
                          draggable
                          onDragStart={() => setDraggedStep(index)}
                          onDragEnd={() => setDraggedStep(null)}
                        >
                          <HolderOutlined />
                          <strong>步骤 {index + 1}</strong>
                        </div>
                        <div className="ui-step-row__actions">
                          <Tooltip title="上移">
                            <Button
                              type="text"
                              size="small"
                              icon={<ArrowUpOutlined />}
                              aria-label={`上移步骤 ${index + 1}`}
                              disabled={index === 0}
                              onClick={() => move(index, index - 1)}
                            />
                          </Tooltip>
                          <Tooltip title="下移">
                            <Button
                              type="text"
                              size="small"
                              icon={<ArrowDownOutlined />}
                              aria-label={`下移步骤 ${index + 1}`}
                              disabled={index === fields.length - 1}
                              onClick={() => move(index, index + 1)}
                            />
                          </Tooltip>
                          <Tooltip title="删除步骤">
                            <Button
                              type="text"
                              size="small"
                              danger
                              icon={<DeleteOutlined />}
                              aria-label={`删除步骤 ${index + 1}`}
                              onClick={() => remove(field.name)}
                            />
                          </Tooltip>
                        </div>
                      </div>
                      <div className="ui-step-row__fields">
                        <StepFields index={field.name} />
                      </div>
                    </div>
                  ))}
                  <Form.ErrorList errors={errors} />
                  <Button
                    type="dashed"
                    icon={<PlusOutlined />}
                    aria-label="添加步骤"
                    block
                    onClick={() => add(createStep('click'))}
                  >
                    添加步骤
                  </Button>
                </div>
              )}
            </Form.List>
          </section>

          {debugResult || debugError ? (
            <section className="ui-case-section ui-debug-result" aria-labelledby="ui-debug-result-title">
              <div className="ui-debug-result__heading">
                <h3 id="ui-debug-result-title" className="ui-case-section__title">
                  调试结果
                </h3>
                {debugResult ? (
                  <div className="ui-debug-result__metrics">
                    <Tag color={debugResult.success ? 'success' : 'error'}>{debugResult.status}</Tag>
                    <span>{debugResult.durationMs} ms</span>
                  </div>
                ) : null}
              </div>
              {debugError || debugResult?.errorMessage ? (
                <Alert
                  type="error"
                  showIcon
                  title={debugError ?? debugResult?.errorMessage}
                />
              ) : null}
              {debugResult ? (
                <>
                  <div className="ui-debug-steps" aria-label="调试步骤结果">
                    {debugResult.stepResults.map((step) => {
                      const action = step.action
                        ? `${step.action.charAt(0).toUpperCase()}${step.action.slice(1)}`
                        : 'Step';
                      return (
                        <div className="ui-debug-step" key={`${step.stepIndex}-${step.action ?? 'unknown'}`}>
                          <Tag color={step.status === 'PASSED' ? 'success' : 'error'}>{step.status}</Tag>
                          <strong>{`步骤 ${step.stepIndex} · ${action}`}</strong>
                          <span>{step.durationMs} ms</span>
                          {step.errorMessage ? <span className="ui-debug-step__error">{step.errorMessage}</span> : null}
                        </div>
                      );
                    })}
                  </div>
                  {debugResult.logs.length ? (
                    <div className="ui-debug-logs">
                      <span className="ui-debug-logs__label">执行日志</span>
                      <pre>{debugResult.logs.join('\n')}</pre>
                    </div>
                  ) : null}
                  {debugResult.screenshotUrl || debugResult.videoUrl || traceViewerUrl ? (
                    <div className="ui-debug-artifacts">
                      {debugResult.screenshotUrl ? (
                        <a href={debugResult.screenshotUrl} target="_blank" rel="noreferrer">
                          查看截图
                        </a>
                      ) : null}
                      {debugResult.videoUrl ? (
                        <a href={debugResult.videoUrl} target="_blank" rel="noreferrer">
                          查看录屏
                        </a>
                      ) : null}
                      {traceViewerUrl ? (
                        <a href={traceViewerUrl} target="_blank" rel="noreferrer">
                          查看 Trace Viewer
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : null}
            </section>
          ) : null}
        </Form>
      </Modal>

      <Modal
        title="放弃未保存内容？"
        open={discardConfirmationOpen}
        okText="放弃"
        cancelText="继续编辑"
        okButtonProps={{ 'aria-label': '放弃' }}
        cancelButtonProps={{ 'aria-label': '继续编辑' }}
        destroyOnHidden
        onOk={() => {
          setDiscardConfirmationOpen(false);
          form.resetFields();
          onClose();
        }}
        onCancel={() => setDiscardConfirmationOpen(false)}
      >
        <p>关闭后，本次填写的内容不会保留。</p>
      </Modal>
    </>
  );
}
