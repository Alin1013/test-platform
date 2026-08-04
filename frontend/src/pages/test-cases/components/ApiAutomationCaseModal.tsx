import {
  CopyOutlined,
  DeleteOutlined,
  PlusOutlined,
  SaveOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
  Checkbox,
  Form,
  Input,
  Modal,
  Segmented,
  Select,
  Space,
  Tabs,
  Tag,
  Tooltip,
} from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { UIEvent } from 'react';
import { usePlatformService } from '../../../services/PlatformServiceContext';
import type {
  ApiAssertionType,
  ApiAutomationCaseDetails,
  ApiBodyType,
  ApiComparison,
  ApiExtractVariable,
  ApiKeyValueItem,
  ApiResponseAssertion,
  CreateTestCaseInput,
  HttpMethod,
  Priority,
  TestCaseRecord,
  TestCaseStatus,
  TestModule,
} from '../../../services/contracts';
import { moduleSelectOptions } from '../moduleOptions';
import { testCaseStatusOptions } from '../testCaseOptions';

const priorityColors: Record<Priority, string | undefined> = {
  P0: 'error',
  P1: 'gold',
  P2: 'processing',
  P3: undefined,
};

const methodColors: Record<HttpMethod, string> = {
  GET: 'green',
  POST: 'blue',
  PUT: 'gold',
  DELETE: 'red',
};

const createKeyValue = (key = '', value = ''): ApiKeyValueItem => ({
  enabled: true,
  key,
  value,
});

const createAssertion = (): ApiResponseAssertion => ({
  type: 'jsonPath',
  target: '$.code',
  comparison: 'equals',
  expected: '0',
});

const createExtract = (): ApiExtractVariable => ({ name: '', jsonPath: '$.data' });

interface ApiCaseFormValues {
  name: string;
  moduleId: string;
  priority: Priority;
  method: HttpMethod;
  endpoint: string;
  headers: ApiKeyValueItem[];
  queryParams: ApiKeyValueItem[];
  bodyType: ApiBodyType;
  bodyContent: string;
  bodyFields: ApiKeyValueItem[];
  assertions: ApiResponseAssertion[];
  extracts: ApiExtractVariable[];
  status?: TestCaseStatus;
}

interface ApiAutomationCaseModalProps {
  open: boolean;
  defaultModule: string;
  initialCase?: TestCaseRecord;
  onClose: () => void;
  onSubmit: (input: CreateTestCaseInput) => Promise<TestCaseRecord>;
}

interface KeyValueEditorProps {
  name: 'headers' | 'queryParams' | 'bodyFields';
  itemLabel: string;
  addLabel: string;
  keyPlaceholder: string;
  valuePlaceholder: string;
}

function KeyValueEditor({
  name,
  itemLabel,
  addLabel,
  keyPlaceholder,
  valuePlaceholder,
}: KeyValueEditorProps) {
  return (
    <Form.List name={name}>
      {(fields, { add, remove }) => (
        <div className="api-kv-editor">
          <div className="api-kv-editor__header" aria-hidden="true">
            <span>启用</span>
            <span>Key</span>
            <span>Value</span>
            <span>操作</span>
          </div>
          {fields.map((field, index) => (
            <div className="api-kv-row" key={field.key}>
              <Form.Item name={[field.name, 'enabled']} valuePropName="checked" noStyle>
                <Checkbox aria-label={`启用${itemLabel} ${index + 1}`} />
              </Form.Item>
              <Form.Item name={[field.name, 'key']} noStyle>
                <Input
                  aria-label={`${itemLabel}键 ${index + 1}`}
                  placeholder={keyPlaceholder}
                />
              </Form.Item>
              <Form.Item name={[field.name, 'value']} noStyle>
                <Input
                  aria-label={`${itemLabel}值 ${index + 1}`}
                  placeholder={valuePlaceholder}
                />
              </Form.Item>
              <Tooltip title={`删除${itemLabel}`}>
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  aria-label={`删除${itemLabel} ${index + 1}`}
                  onClick={() => remove(field.name)}
                />
              </Tooltip>
            </div>
          ))}
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            aria-label={addLabel}
            onClick={() => add(createKeyValue())}
            block
          >
            {addLabel}
          </Button>
        </div>
      )}
    </Form.List>
  );
}

function JsonCodeEditor({ value = '', onChange }: { value?: string; onChange?: (value: string) => void }) {
  const highlightRef = useRef<HTMLPreElement>(null);
  const highlighted = useMemo(() => {
    const tokenPattern = /("(?:\\.|[^"\\])*")(\s*:)?|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b/g;
    const parts: Array<{ text: string; type?: string }> = [];
    let cursor = 0;
    for (const match of value.matchAll(tokenPattern)) {
      const index = match.index ?? 0;
      if (index > cursor) parts.push({ text: value.slice(cursor, index) });
      const token = match[0];
      let type = 'number';
      if (token.startsWith('"')) type = match[2] ? 'key' : 'string';
      else if (token === 'true' || token === 'false') type = 'boolean';
      else if (token === 'null') type = 'null';
      parts.push({ text: token, type });
      cursor = index + token.length;
    }
    if (cursor < value.length) parts.push({ text: value.slice(cursor) });
    return parts;
  }, [value]);

  const syncScroll = (event: UIEvent<HTMLTextAreaElement>) => {
    if (!highlightRef.current) return;
    highlightRef.current.scrollTop = event.currentTarget.scrollTop;
    highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
  };

  return (
    <div className="api-json-editor">
      <pre ref={highlightRef} aria-hidden="true">
        {highlighted.map((part, index) => (
          <span className={part.type ? `is-${part.type}` : undefined} key={`${index}-${part.text}`}>
            {part.text}
          </span>
        ))}
        {'\n'}
      </pre>
      <textarea
        aria-label="请求体"
        value={value}
        spellCheck={false}
        onChange={(event) => onChange?.(event.target.value)}
        onScroll={syncScroll}
      />
    </div>
  );
}

function AssertionEditor() {
  const form = Form.useFormInstance<ApiCaseFormValues>();

  return (
    <Form.List
      name="assertions"
      rules={[
        {
          validator: async (_, assertions?: ApiResponseAssertion[]) => {
            if (!assertions?.length) throw new Error('请至少添加一条响应断言');
          },
        },
      ]}
    >
      {(fields, { add, remove }, { errors }) => (
        <div className="api-rule-editor">
          <div className="api-rule-editor__header api-rule-editor__header--assertion" aria-hidden="true">
            <span>断言类型</span>
            <span>目标表达式</span>
            <span>比较条件</span>
            <span>期望值</span>
            <span>操作</span>
          </div>
          {fields.map((field, index) => (
            <Form.Item noStyle shouldUpdate key={field.key}>
              {({ getFieldValue }) => {
                const type = getFieldValue(['assertions', field.name, 'type']) as
                  | ApiAssertionType
                  | undefined;
                const comparison = getFieldValue(['assertions', field.name, 'comparison']) as
                  | ApiComparison
                  | undefined;
                const targetDisabled = type === 'statusCode' || type === 'responseTime';
                return (
                  <div className="api-rule-row api-rule-row--assertion">
                    <Form.Item name={[field.name, 'type']} noStyle>
                      <Select
                        aria-label={`断言 ${index + 1} 类型`}
                        options={[
                          { value: 'statusCode', label: 'Status Code' },
                          { value: 'jsonPath', label: 'JSONPath' },
                          { value: 'responseTime', label: 'Response Time' },
                        ]}
                        onChange={(nextType: ApiAssertionType) => {
                          if (nextType !== 'jsonPath') {
                            form.setFieldValue(['assertions', field.name, 'comparison'], 'equals');
                            form.setFieldValue(['assertions', field.name, 'target'], '');
                          }
                        }}
                      />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'target']}
                      rules={targetDisabled ? [] : [{ required: true, whitespace: true, message: '请输入 JSONPath' }]}
                      noStyle
                    >
                      <Input
                        aria-label={`断言 ${index + 1} 目标表达式`}
                        disabled={targetDisabled}
                        placeholder={targetDisabled ? '-' : '$.code'}
                      />
                    </Form.Item>
                    <Form.Item name={[field.name, 'comparison']} noStyle>
                      <Select
                        aria-label={`断言 ${index + 1} 比较条件`}
                        options={
                          type === 'jsonPath'
                            ? [
                                { value: 'equals', label: '等于 (==)' },
                                { value: 'contains', label: '包含 (contains)' },
                                { value: 'notNull', label: '不为空 (not null)' },
                              ]
                            : [{ value: 'equals', label: '等于 (==)' }]
                        }
                      />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'expected']}
                      rules={[
                        {
                          validator: async (_, value?: string) => {
                            if (comparison === 'notNull') return;
                            if (!value?.trim()) throw new Error('请输入期望值');
                            if (type === 'statusCode') {
                              const status = Number(value);
                              if (!Number.isInteger(status) || status < 100 || status > 599) {
                                throw new Error('状态码应为 100 到 599 的整数');
                              }
                            }
                            if (type === 'responseTime') {
                              const duration = Number(value);
                              if (!Number.isFinite(duration) || duration < 0) {
                                throw new Error('响应耗时应为大于或等于 0 的数字');
                              }
                            }
                          },
                        },
                      ]}
                      noStyle
                    >
                      <Input
                        aria-label={`断言 ${index + 1} 期望值`}
                        disabled={comparison === 'notNull'}
                        placeholder={type === 'responseTime' ? '例如：500' : '期望值'}
                      />
                    </Form.Item>
                    <Tooltip title="删除断言">
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        aria-label={`删除断言 ${index + 1}`}
                        disabled={fields.length === 1}
                        onClick={() => remove(field.name)}
                      />
                    </Tooltip>
                  </div>
                );
              }}
            </Form.Item>
          ))}
          <Form.ErrorList errors={errors} />
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            aria-label="添加断言"
            onClick={() => add(createAssertion())}
            block
          >
            添加断言
          </Button>
        </div>
      )}
    </Form.List>
  );
}

function ExtractEditor() {
  const { message } = App.useApp();

  return (
    <Form.List name="extracts">
      {(fields, { add, remove }) => (
        <div className="api-rule-editor">
          <div className="api-rule-editor__header api-rule-editor__header--extract" aria-hidden="true">
            <span>变量名称</span>
            <span>JSONPath 表达式</span>
            <span>引用预览</span>
            <span>操作</span>
          </div>
          {fields.map((field, index) => (
            <Form.Item noStyle shouldUpdate key={field.key}>
              {({ getFieldValue }) => {
                const variableName = String(getFieldValue(['extracts', field.name, 'name']) ?? 'variable');
                return (
                  <div className="api-rule-row api-rule-row--extract">
                    <Form.Item
                      name={[field.name, 'name']}
                      rules={[
                        { required: true, whitespace: true, message: '请输入变量名称' },
                        { pattern: /^[A-Za-z_][A-Za-z0-9_]*$/, message: '仅支持字母、数字和下划线' },
                      ]}
                      noStyle
                    >
                      <Input aria-label={`提取变量 ${index + 1} 名称`} placeholder="orderId" />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'jsonPath']}
                      rules={[{ required: true, whitespace: true, message: '请输入 JSONPath' }]}
                      noStyle
                    >
                      <Input aria-label={`提取变量 ${index + 1} JSONPath`} placeholder="$.data.orderId" />
                    </Form.Item>
                    <div className="api-variable-preview-wrap">
                      <code className="api-variable-preview">{`{{${variableName || 'variable'}}}`}</code>
                      <Tooltip title="复制变量引用">
                        <Button
                          type="text"
                          size="small"
                          icon={<CopyOutlined />}
                          aria-label={`复制变量引用 ${index + 1}`}
                          onClick={() => {
                            const reference = `{{${variableName || 'variable'}}}`;
                            if (!navigator.clipboard) {
                              void message.error('当前浏览器不支持复制变量引用');
                              return;
                            }
                            void navigator.clipboard.writeText(reference).then(
                              () => message.success(`已复制 ${reference}`),
                              () => message.error('变量引用复制失败'),
                            );
                          }}
                        />
                      </Tooltip>
                    </div>
                    <Tooltip title="删除变量">
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        aria-label={`删除提取变量 ${index + 1}`}
                        onClick={() => remove(field.name)}
                      />
                    </Tooltip>
                  </div>
                );
              }}
            </Form.Item>
          ))}
          {fields.length === 0 ? (
            <div className="api-rule-editor__empty">尚未配置变量提取</div>
          ) : null}
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            aria-label="添加提取变量"
            onClick={() => add(createExtract())}
            block
          >
            添加提取变量
          </Button>
        </div>
      )}
    </Form.List>
  );
}

export function ApiAutomationCaseModal({
  open,
  defaultModule,
  initialCase,
  onClose,
  onSubmit,
}: ApiAutomationCaseModalProps) {
  const [form] = Form.useForm<ApiCaseFormValues>();
  const { message } = App.useApp();
  const service = usePlatformService();
  const [modules, setModules] = useState<TestModule[]>([]);
  const [discardConfirmationOpen, setDiscardConfirmationOpen] = useState(false);
  const headers = Form.useWatch('headers', form) ?? [];
  const queryParams = Form.useWatch('queryParams', form) ?? [];
  const assertions = Form.useWatch('assertions', form) ?? [];
  const extracts = Form.useWatch('extracts', form) ?? [];
  const bodyType = Form.useWatch('bodyType', form) ?? 'json';

  useEffect(() => {
    if (!open) return;
    const details = initialCase?.apiDetails;
    form.resetFields();
    form.setFieldsValue({
      name: initialCase?.name,
      moduleId: initialCase?.moduleId ?? (defaultModule === 'all' ? 'auth' : defaultModule),
      priority: initialCase?.priority ?? 'P1',
      status: initialCase?.status ?? '维护中',
      method: initialCase?.method ?? 'POST',
      endpoint: initialCase?.endpoint ?? '',
      headers:
        details?.headers ??
        [
          createKeyValue('Content-Type', 'application/json'),
          createKeyValue('Authorization', 'Bearer {{token}}'),
        ],
      queryParams: details?.queryParams ?? [],
      bodyType: details?.bodyType ?? 'json',
      bodyContent:
        details?.bodyContent ??
        '{\n  "itemId": 10086,\n  "quantity": 2,\n  "couponId": "{{coupon_id}}"\n}',
      bodyFields: details?.bodyFields ?? [createKeyValue()],
      assertions: details?.assertions ?? [
        {
          type: 'statusCode',
          target: '',
          comparison: 'equals',
          expected: String(initialCase?.expectedStatus ?? 200),
        },
        { type: 'jsonPath', target: '$.code', comparison: 'equals', expected: '0' },
      ],
      extracts: details?.extracts ?? [],
    });
    let active = true;
    void service.listTestModules(1).then((nextModules) => {
      if (active) setModules(nextModules);
    });
    return () => {
      active = false;
    };
  }, [defaultModule, form, initialCase, open, service]);

  const requestClose = () => {
    if (!form.isFieldsTouched()) {
      form.resetFields();
      onClose();
      return;
    }
    setDiscardConfirmationOpen(true);
  };

  const submit = async (values: ApiCaseFormValues) => {
    const statusAssertion = values.assertions.find((assertion) => assertion.type === 'statusCode');
    const parsedStatus = Number(statusAssertion?.expected ?? 200);
    const apiDetails: ApiAutomationCaseDetails = {
      headers: values.headers ?? [],
      queryParams: values.queryParams ?? [],
      bodyType: values.bodyType,
      bodyContent: values.bodyType === 'json' ? values.bodyContent ?? '' : '',
      bodyFields: values.bodyFields ?? [],
      assertions: values.assertions,
      extracts: values.extracts ?? [],
    };
    const created = await onSubmit({
      type: 'api',
      moduleId: values.moduleId,
      name: values.name,
      priority: values.priority,
      status: values.status ?? '维护中',
      endpoint: values.endpoint,
      method: values.method,
      expectedStatus: statusAssertion ? parsedStatus : 200,
      apiDetails,
    });
    form.resetFields();
    onClose();
    void message.success(`接口用例已${initialCase ? '更新' : '创建'}：${created.name}`);
  };

  const validateJson = async (_: unknown, value?: string) => {
    if (bodyType !== 'json' || !value?.trim()) return;
    try {
      JSON.parse(value);
    } catch {
      throw new Error('请输入有效的 JSON');
    }
  };

  const debugRequest = async () => {
    try {
      await form.validateFields();
      void message.success('请求配置校验通过，可以发送调试请求');
    } catch {
      void message.warning('请先补全必填项并修正配置错误');
    }
  };

  const requestItems = [
    {
      key: 'headers',
      label: `Headers (${headers.filter((item) => item?.key?.trim()).length})`,
      forceRender: true,
      children: (
        <KeyValueEditor
          name="headers"
          itemLabel="请求头"
          addLabel="添加请求头"
          keyPlaceholder="例如：Content-Type"
          valuePlaceholder="例如：application/json"
        />
      ),
    },
    {
      key: 'params',
      label: `Params (${queryParams.filter((item) => item?.key?.trim()).length})`,
      forceRender: true,
      children: (
        <KeyValueEditor
          name="queryParams"
          itemLabel="Query 参数"
          addLabel="添加 Query 参数"
          keyPlaceholder="例如：page"
          valuePlaceholder="例如：1 或 {{page}}"
        />
      ),
    },
    {
      key: 'body',
      label: 'Body',
      forceRender: true,
      children: (
        <div className="api-body-editor">
          <Form.Item name="bodyType" noStyle>
            <Segmented
              aria-label="请求体类型"
              block
              options={[
                { label: 'none', value: 'none' },
                { label: 'JSON', value: 'json' },
                { label: 'form-data', value: 'form-data' },
                { label: 'x-www-form-urlencoded', value: 'x-www-form-urlencoded' },
              ]}
            />
          </Form.Item>
          {bodyType === 'json' ? (
            <>
              <div className="api-editor-meta">
                <span>JSON</span>
                <span>支持全局变量，如 {`{{token}}`}</span>
              </div>
              <Form.Item
                className="api-json-editor-field"
                name="bodyContent"
                rules={[{ validator: validateJson }]}
              >
                <JsonCodeEditor />
              </Form.Item>
            </>
          ) : bodyType === 'none' ? (
            <div className="api-body-empty">此请求不发送请求体</div>
          ) : (
            <KeyValueEditor
              name="bodyFields"
              itemLabel="请求体字段"
              addLabel="添加请求体字段"
              keyPlaceholder="字段名"
              valuePlaceholder="字段值或 {{variable}}"
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <Modal
        title={
          <span aria-label={`${initialCase ? '编辑' : '新建'}接口用例`}>
            {initialCase ? '编辑接口自动化测试用例' : '新建接口自动化测试用例'}
          </span>
        }
        className="api-case-modal"
        width={1040}
        open={open}
        destroyOnHidden
        mask={{ closable: false }}
        onCancel={requestClose}
        footer={[
          <Button key="debug" icon={<ThunderboltOutlined />} onClick={() => void debugRequest()}>
            发送请求（Debug）
          </Button>,
          <Button key="cancel" aria-label="取消" onClick={requestClose}>
            取消
          </Button>,
          <Button
            key="submit"
            type="primary"
            icon={<SaveOutlined />}
            aria-label={initialCase ? '保存' : '创建用例'}
            onClick={() => form.submit()}
          >
            {initialCase ? '保存' : '保存用例'}
          </Button>,
        ]}
      >
        <Form
          form={form}
          layout="vertical"
          requiredMark="optional"
          onFinish={(values) => void submit(values)}
        >
          <section className="api-case-section" aria-labelledby="api-basic-info-title">
            <h3 id="api-basic-info-title" className="api-case-section__title">
              基本信息
            </h3>
            <div className="api-case-basic-grid">
              <Form.Item
                className="api-case-field--wide"
                name="name"
                label="用例/接口名称"
                rules={[{ required: true, whitespace: true, message: '请输入用例名称' }]}
              >
                <Input
                  aria-label="用例名称"
                  maxLength={255}
                  placeholder="例如：创建订单 - 正常下单流程"
                />
              </Form.Item>
              <Form.Item
                name="moduleId"
                label="所属模块"
                rules={[{ required: true, message: '请选择所属模块' }]}
              >
                <Select aria-label="所属模块" options={moduleSelectOptions(modules)} />
              </Form.Item>
              <Form.Item
                name="priority"
                label="优先级"
                rules={[{ required: true, message: '请选择优先级' }]}
              >
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
              <Form.Item
                className="api-case-field--endpoint"
                label="请求方式 & 路径"
                required
              >
                <Space.Compact block>
                  <Form.Item name="method" noStyle>
                    <Select
                      aria-label="请求方式"
                      className="api-method-select"
                      options={(Object.keys(methodColors) as HttpMethod[]).map((method) => ({
                        value: method,
                        label: <Tag color={methodColors[method]}>{method}</Tag>,
                      }))}
                    />
                  </Form.Item>
                  <Form.Item
                    name="endpoint"
                    rules={[{ required: true, whitespace: true, message: '请输入接口路径或 URL' }]}
                    noStyle
                  >
                    <Input
                      aria-label="接口地址"
                      className="api-endpoint-input"
                      placeholder="例如：/v1/orders/create 或 https://api.example.com/orders"
                    />
                  </Form.Item>
                </Space.Compact>
              </Form.Item>
            </div>
          </section>

          <section className="api-case-section" aria-labelledby="api-request-setup-title">
            <h3 id="api-request-setup-title" className="api-case-section__title">
              请求参数配置
            </h3>
            <Tabs className="api-config-tabs" defaultActiveKey="body" items={requestItems} />
          </section>

          <section className="api-case-section" aria-labelledby="api-post-actions-title">
            <h3 id="api-post-actions-title" className="api-case-section__title">
              后置断言与变量提取
            </h3>
            <Tabs
              className="api-config-tabs"
              defaultActiveKey="assertions"
              items={[
                {
                  key: 'assertions',
                  label: `响应断言 (${assertions.length})`,
                  forceRender: true,
                  children: <AssertionEditor />,
                },
                {
                  key: 'extracts',
                  label: `参数提取 (${extracts.length})`,
                  forceRender: true,
                  children: <ExtractEditor />,
                },
              ]}
            />
          </section>
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
