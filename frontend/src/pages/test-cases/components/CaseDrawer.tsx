/**
 * 用例编辑抽屉：按用例类型分派到功能/API/UI 各自的表单组件。
 */
import { App, Button, Checkbox, Form, Input, Modal, Select } from 'antd';
import { useEffect, useState } from 'react';
import { useAuth } from '../../../services/AuthContext';
import { usePlatformService } from '../../../services/PlatformServiceContext';
import type {
  CreateTestCaseInput,
  Priority,
  TestCaseRecord,
  TestCaseStatus,
  TestCaseType,
  TestModule,
  UserRecord,
} from '../../../services/contracts';
import { ApiAutomationCaseModal } from './ApiAutomationCaseModal';
import { UiAutomationCaseModal } from './UiAutomationCaseModal';
import { testCaseStatusOptions } from '../testCaseOptions';
import { moduleSelectOptions } from '../moduleOptions';

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
  requirementId?: string;
  precondition?: string;
  steps: string;
  expectedResult: string;
  caseType: 'functional';
  status: TestCaseStatus;
  priority: Priority;
  authorId: number;
  iteration?: string;
  isSmoke: boolean;
}

export function CaseDrawer(props: CaseDrawerProps) {
  // 按类型分派：API/UI 走专用自动化表单，其余走功能用例表单。
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
  // 功能用例表单：加载模块与用户，支持新建与编辑。
  const [form] = Form.useForm<CaseFormValues>();
  const { message } = App.useApp();
  const { user } = useAuth();
  const service = usePlatformService();
  const [discardConfirmationOpen, setDiscardConfirmationOpen] = useState(false);
  const [modules, setModules] = useState<TestModule[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const title = `${initialCase ? '编辑' : '新建'}${typeLabels.functional}`;

  useEffect(() => {
    // 打开时初始化表单；并行拉取模块与用户，避免表单空白。
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({
      name: initialCase?.name,
      moduleId: initialCase?.moduleId ?? (defaultModule === 'all' ? 'auth' : defaultModule),
      requirementId: initialCase?.requirementId,
      precondition: initialCase?.precondition ?? '',
      steps: initialCase?.steps ?? '',
      expectedResult: initialCase?.expectedResult ?? '',
      caseType: 'functional',
      status: initialCase?.status ?? '维护中',
      priority: initialCase?.priority ?? 'P1',
      authorId: user?.id ?? 1,
      iteration: initialCase?.iteration ?? '',
      isSmoke: initialCase?.isSmoke ?? false,
    });
    let active = true;
    void Promise.all([
      service.listTestModules(1, 'functional'),
      service.listUsers(),
    ]).then(
      ([nextModules, nextUsers]) => {
        if (!active) return;
        setModules(nextModules);
        setUsers(nextUsers);
        if (initialCase) {
          const author = nextUsers.find((item) => item.name === initialCase.creator);
          if (author) form.setFieldValue('authorId', Number(author.id));
        }
      },
    );
    return () => {
      active = false;
    };
  }, [defaultModule, form, initialCase, open, service, user?.id]);

  const closeDrawer = () => {
    // 有未保存输入时先确认放弃。
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
    // 提交前裁剪空白字符串；成功后复位并关闭。
    const created = await onSubmit({
      type: 'functional',
      authorId: values.authorId,
      moduleId: values.moduleId,
      name: values.name,
      priority: values.priority,
      status: values.status,
      requirementId: values.requirementId?.trim() || undefined,
      precondition: values.precondition?.trim() ?? '',
      steps: values.steps.trim(),
      expectedResult: values.expectedResult.trim(),
      iteration: values.iteration?.trim() ?? '',
      isSmoke: values.isSmoke,
    });
    form.resetFields();
    onClose();
    void message.success(`${typeLabels.functional}已${initialCase ? '更新' : '创建'}：${created.name}`);
  };

  return (
    <>
      <Modal
        title={title}
        aria-label={title}
        className="functional-case-modal"
        width={900}
        open={open}
        destroyOnHidden
        centered
        mask={{ closable: false }}
        onCancel={closeDrawer}
        footer={[
          <Button key="cancel" aria-label="取消" onClick={closeDrawer}>取消</Button>,
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
          <div className="functional-case-form-grid">
            <Form.Item name="moduleId" label="用例目录" rules={[{ required: true, message: '请选择用例目录' }]}>
              <Select
                aria-label="用例目录"
                options={moduleSelectOptions(modules)}
              />
            </Form.Item>
            <Form.Item name="name" label="用例名称" rules={[{ required: true, whitespace: true, message: '请输入用例名称' }]}>
              <Input maxLength={255} placeholder="例如：用户登录成功" />
            </Form.Item>
            <Form.Item name="requirementId" label="需求ID">
              <Input maxLength={128} placeholder="例如：REQ-1024" />
            </Form.Item>
            <Form.Item name="caseType" label="用例类型" rules={[{ required: true }]}>
              <Select aria-label="用例类型" disabled options={[{ value: 'functional', label: '功能用例' }]} />
            </Form.Item>
            <Form.Item name="status" label="用例状态" rules={[{ required: true, message: '请选择用例状态' }]}>
              <Select aria-label="用例状态" options={testCaseStatusOptions.map((value) => ({ value, label: value }))} />
            </Form.Item>
            <Form.Item name="priority" label="用例等级" rules={[{ required: true, message: '请选择用例等级' }]}>
              <Select aria-label="用例等级" options={['P0', 'P1', 'P2', 'P3'].map((value) => ({ value, label: value }))} />
            </Form.Item>
            <Form.Item name="authorId" label="创建人" rules={[{ required: true, message: '请选择创建人' }]}>
              <Select
                aria-label="创建人"
                options={users.map((item, index) => ({
                  value: Number.isFinite(Number(item.id)) ? Number(item.id) : index + 1,
                  label: item.name,
                }))}
              />
            </Form.Item>
            <Form.Item name="iteration" label="归属迭代">
              <Input maxLength={128} placeholder="例如：Sprint 12" />
            </Form.Item>
            <Form.Item name="isSmoke" label="是否冒烟" valuePropName="checked">
              <Checkbox>设为冒烟用例</Checkbox>
            </Form.Item>
            <Form.Item className="functional-case-field--full" name="precondition" label="前置条件">
              <TextArea rows={3} maxLength={10000} placeholder="描述执行用例前需要满足的条件" />
            </Form.Item>
            <Form.Item className="functional-case-field--full" name="steps" label="用例步骤" rules={[{ required: true, whitespace: true, message: '请输入用例步骤' }]}>
              <TextArea rows={5} maxLength={10000} placeholder="每行输入一个操作步骤" />
            </Form.Item>
            <Form.Item className="functional-case-field--full" name="expectedResult" label="预期结果" rules={[{ required: true, whitespace: true, message: '请输入预期结果' }]}>
              <TextArea rows={3} maxLength={10000} placeholder="描述预期的业务结果" />
            </Form.Item>
          </div>
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
        onOk={discardChanges}
        onCancel={() => setDiscardConfirmationOpen(false)}
      >
        <p>关闭后，本次填写的内容不会保留。</p>
      </Modal>
    </>
  );
}
