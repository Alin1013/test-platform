import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Drawer, Form, Input, Modal, Select, Space } from 'antd';
import { useEffect, useState } from 'react';
import type { CreateTestCaseInput, TestCaseRecord, TestCaseType } from '../../../services/contracts';

const { TextArea } = Input;

const typeLabels: Record<TestCaseType, string> = {
  functional: '功能用例',
  api: '接口用例',
  ui: 'UI自动化',
};

interface CaseDrawerProps {
  type: TestCaseType;
  open: boolean;
  defaultModule: string;
  onClose: () => void;
  onSubmit: (input: CreateTestCaseInput) => Promise<TestCaseRecord>;
}

interface CaseFormValues {
  name: string;
  moduleId: string;
  priority: CreateTestCaseInput['priority'];
  endpoint?: string;
  method?: CreateTestCaseInput['method'];
  headers?: Array<{ key?: string; value?: string }>;
  requestBody?: string;
  assertions?: string;
  precondition?: string;
  steps?: string;
  expected?: string;
  pageUrl?: string;
  selector?: string;
  environment?: string;
}

export function CaseDrawer({ type, open, defaultModule, onClose, onSubmit }: CaseDrawerProps) {
  const [form] = Form.useForm<CaseFormValues>();
  const { message } = App.useApp();
  const [discardConfirmationOpen, setDiscardConfirmationOpen] = useState(false);
  const title = `新建${typeLabels[type]}`;

  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        moduleId: defaultModule === 'all' ? 'auth' : defaultModule,
        priority: 'P1',
        method: 'POST',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
        environment: '测试环境',
      });
    }
  }, [defaultModule, form, open, type]);

  const closeDrawer = () => {
    if (!form.isFieldsTouched()) {
      form.resetFields();
      onClose();
      return;
    }
    setDiscardConfirmationOpen(true);
  };

  const discardChanges = () => {
    setDiscardConfirmationOpen(false);
    form.resetFields();
    onClose();
  };

  const submit = async (values: CaseFormValues) => {
    const created = await onSubmit({
      type,
      moduleId: values.moduleId,
      name: values.name,
      priority: values.priority,
      status: '维护中',
      endpoint: type === 'api' ? values.endpoint : undefined,
      method: type === 'api' ? values.method : undefined,
      expectedStatus: type === 'api' ? 200 : undefined,
    });
    form.resetFields();
    onClose();
    void message.success(`${typeLabels[type]}已创建：${created.name}`);
  };

  return (
    <>
      <Drawer
        title={title}
        aria-label={title}
        className="case-drawer"
        placement="right"
        size={520}
        open={open}
        destroyOnHidden
        onClose={closeDrawer}
        footer={
          <div className="case-drawer__footer">
            <Button aria-label="取消" onClick={closeDrawer}>
              取消
            </Button>
            <Button type="primary" onClick={() => form.submit()}>
              创建用例
            </Button>
          </div>
        }
      >
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          onFinish={(values) => void submit(values)}
        >
          <Form.Item name="name" label="用例名称" rules={[{ required: true, message: '请输入用例名称' }]}>
            <Input placeholder="例如：刷新访问令牌" />
          </Form.Item>

          <div className="case-drawer__grid">
            <Form.Item name="moduleId" label="所属模块" rules={[{ required: true }]}>
              <Select
                id="case-module-select"
                options={[
                  { value: 'auth', label: '鉴权' },
                  { value: 'payments', label: '支付' },
                  { value: 'profile', label: '用户资料' },
                ]}
              />
            </Form.Item>
            <Form.Item name="priority" label="优先级" rules={[{ required: true }]}>
              <Select
                id="case-priority-select"
                options={['P0', 'P1', 'P2', 'P3'].map((value) => ({ value, label: value }))}
              />
            </Form.Item>
          </div>

          {type === 'api' ? (
            <>
              <Form.Item
                name="endpoint"
                label="接口地址"
                rules={[{ required: true, message: '请输入接口地址' }]}
              >
                <Input prefix="URL" placeholder="/api/example" />
              </Form.Item>
              <Form.Item name="method" label="HTTP 方法">
                <Select
                  id="case-method-select"
                  options={['GET', 'POST', 'PUT', 'DELETE'].map((value) => ({ value, label: value }))}
                />
              </Form.Item>
              <Form.List name="headers">
                {(fields, { add, remove }) => (
                  <Form.Item label="请求头">
                    <div className="case-drawer__headers">
                      {fields.map(({ key, name }) => (
                        <Space.Compact key={key} block>
                          <Form.Item name={[name, 'key']} noStyle>
                            <Input aria-label={`请求头键 ${name + 1}`} placeholder="键" />
                          </Form.Item>
                          <Form.Item name={[name, 'value']} noStyle>
                            <Input aria-label={`请求头值 ${name + 1}`} placeholder="值" />
                          </Form.Item>
                          <Button
                            icon={<DeleteOutlined />}
                            aria-label={`删除请求头 ${name + 1}`}
                            onClick={() => remove(name)}
                          />
                        </Space.Compact>
                      ))}
                      <Button
                        type="dashed"
                        icon={<PlusOutlined />}
                        aria-label="添加请求头"
                        onClick={() => add({ key: '', value: '' })}
                        block
                      >
                        添加请求头
                      </Button>
                    </div>
                  </Form.Item>
                )}
              </Form.List>
              <Form.Item
                name="requestBody"
                label="请求体"
                rules={[
                  {
                    validator: async (_, value?: string) => {
                      if (!value?.trim()) return;
                      try {
                        JSON.parse(value);
                      } catch {
                        throw new Error('请输入有效的 JSON');
                      }
                    },
                  },
                ]}
              >
                <TextArea className="case-drawer__code" rows={7} placeholder={'{\n  "key": "value"\n}'} />
              </Form.Item>
              <Form.Item name="assertions" label="断言规则">
                <TextArea rows={3} placeholder="例如：响应状态等于 200" />
              </Form.Item>
            </>
          ) : null}

          {type === 'functional' ? (
            <>
              <Form.Item name="precondition" label="前置条件">
                <TextArea rows={3} placeholder="描述执行用例前需要满足的条件" />
              </Form.Item>
              <Form.Item name="steps" label="测试步骤" rules={[{ required: true, message: '请输入测试步骤' }]}>
                <TextArea rows={6} placeholder="每行输入一个操作步骤" />
              </Form.Item>
              <Form.Item name="expected" label="预期结果" rules={[{ required: true, message: '请输入预期结果' }]}>
                <TextArea rows={4} placeholder="描述预期的业务结果" />
              </Form.Item>
            </>
          ) : null}

          {type === 'ui' ? (
            <>
              <Form.Item name="pageUrl" label="页面地址" rules={[{ required: true, message: '请输入页面地址' }]}>
                <Input placeholder="https://example.com/login" />
              </Form.Item>
              <Form.Item name="selector" label="定位方式" rules={[{ required: true, message: '请输入定位方式' }]}>
                <Input placeholder="例如：data-testid=login-button" />
              </Form.Item>
              <Form.Item name="environment" label="执行环境">
                <Select
                  id="case-environment-select"
                  options={['测试环境', '预发布环境', '生产镜像环境'].map((value) => ({ value, label: value }))}
                />
              </Form.Item>
            </>
          ) : null}
        </Form>
      </Drawer>
      <Modal
        title="放弃未保存内容？"
        open={discardConfirmationOpen}
        okText="放弃"
        cancelText="继续编辑"
        okButtonProps={{ 'aria-label': '放弃' }}
        cancelButtonProps={{ 'aria-label': '继续编辑' }}
        destroyOnHidden
        onOk={discardChanges}
        onCancel={() => setDiscardConfirmationOpen(false)}
      >
        <p>关闭后，本次填写的内容不会保留。</p>
      </Modal>
    </>
  );
}
