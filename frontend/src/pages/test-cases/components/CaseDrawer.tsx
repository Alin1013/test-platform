import { App, Button, Drawer, Form, Input, Modal, Select } from 'antd';
import { useEffect, useState } from 'react';
import type {
  CreateTestCaseInput,
  TestCaseRecord,
  TestCaseStatus,
  TestCaseType,
} from '../../../services/contracts';
import { ApiAutomationCaseModal } from './ApiAutomationCaseModal';
import { UiAutomationCaseModal } from './UiAutomationCaseModal';
import { testCaseStatusOptions } from '../testCaseOptions';

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
  initialCase?: TestCaseRecord;
  onClose: () => void;
  onSubmit: (input: CreateTestCaseInput) => Promise<TestCaseRecord>;
}

interface CaseFormValues {
  name: string;
  moduleId: string;
  priority: CreateTestCaseInput['priority'];
  status: TestCaseStatus;
  precondition?: string;
  steps?: string;
  expected?: string;
}

export function CaseDrawer(props: CaseDrawerProps) {
  if (props.type === 'api') {
    return (
      <ApiAutomationCaseModal
        open={props.open}
        defaultModule={props.defaultModule}
        initialCase={props.initialCase}
        onClose={props.onClose}
        onSubmit={props.onSubmit}
      />
    );
  }

  if (props.type === 'ui') {
    return (
      <UiAutomationCaseModal
        open={props.open}
        defaultModule={props.defaultModule}
        initialCase={props.initialCase}
        onClose={props.onClose}
        onSubmit={props.onSubmit}
      />
    );
  }

  return <FunctionalCaseDrawer {...props} />;
}

function FunctionalCaseDrawer({
  open,
  defaultModule,
  initialCase,
  onClose,
  onSubmit,
}: CaseDrawerProps) {
  const [form] = Form.useForm<CaseFormValues>();
  const { message } = App.useApp();
  const [discardConfirmationOpen, setDiscardConfirmationOpen] = useState(false);
  const title = `${initialCase ? '编辑' : '新建'}${typeLabels.functional}`;

  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        name: initialCase?.name,
        moduleId: initialCase?.moduleId ?? (defaultModule === 'all' ? 'auth' : defaultModule),
        priority: initialCase?.priority ?? 'P1',
        status: initialCase?.status ?? '维护中',
      });
    }
  }, [defaultModule, form, initialCase, open]);

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
      type: 'functional',
      moduleId: values.moduleId,
      name: values.name,
      priority: values.priority,
      status: values.status,
    });
    form.resetFields();
    onClose();
    void message.success(`${typeLabels.functional}已${initialCase ? '更新' : '创建'}：${created.name}`);
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
            <Button
              type="primary"
              aria-label={initialCase ? '保存' : '创建用例'}
              onClick={() => form.submit()}
            >
              {initialCase ? '保存' : '创建用例'}
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
          </div>

          {!initialCase ? (
            <>
              <Form.Item name="precondition" label="前置条件">
                <TextArea rows={3} placeholder="描述执行用例前需要满足的条件" />
              </Form.Item>
              <Form.Item
                name="steps"
                label="测试步骤"
                rules={[{ required: true, message: '请输入测试步骤' }]}
              >
                <TextArea rows={6} placeholder="每行输入一个操作步骤" />
              </Form.Item>
              <Form.Item
                name="expected"
                label="预期结果"
                rules={[{ required: true, message: '请输入预期结果' }]}
              >
                <TextArea rows={4} placeholder="描述预期的业务结果" />
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
