/**
 * 添加用户抽屉：表单填写 + 未保存离开时的放弃确认。
 */
import { App, Button, Drawer, Form, Input, Modal, Select } from 'antd';
import { useEffect, useState } from 'react';
import type {
  CreateUserInput,
  PermissionRole,
  UserRecord,
  UserRole,
} from '../../../services/contracts';

interface UserDrawerProps {
  open: boolean;
  /** 当前角色及权限配置；为空时使用内置角色，避免加载期间无法创建用户。 */
  roles: PermissionRole[] | null;
  onClose: () => void;
  onSubmit: (input: CreateUserInput) => Promise<UserRecord>;
}

const roleOptions: UserRole[] = ['测试负责人', '测试工程师', '开发人员'];

export function UserDrawer({ open, roles, onClose, onSubmit }: UserDrawerProps) {
  const [form] = Form.useForm<CreateUserInput>();
  const { message } = App.useApp();
  const [discardConfirmationOpen, setDiscardConfirmationOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const roleSelectOptions = (roles?.length ? roles.map((role) => role.name) : roleOptions).map(
    (value) => ({ value, label: value }),
  );

  useEffect(() => {
    // 每次打开时重置部门与角色的默认值。
    if (open) {
      form.setFieldsValue({ department: '质量保障部', role: '测试工程师' });
    }
  }, [form, open]);

  const closeDrawer = () => {
    // 表单未填写时直接关闭；已填写则先弹放弃确认。
    if (submitting) return;

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

  const submit = async (values: CreateUserInput) => {
    // 提交成功后复位表单并关闭抽屉。
    setSubmitting(true);
    try {
      await onSubmit(values);
      form.resetFields();
      onClose();
      void message.success('用户添加成功');
    } catch {
      void message.error('添加用户失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Drawer
        title="添加用户"
        aria-label="添加用户"
        className="user-drawer"
        rootClassName="user-drawer-root"
        placement="right"
        size={480}
        open={open}
        destroyOnHidden
        maskClosable={!submitting}
        closable={!submitting}
        onClose={closeDrawer}
        footer={
          <div className="user-drawer__footer">
            <Button aria-label="取消" disabled={submitting} onClick={closeDrawer}>
              取消
            </Button>
            <Button
              type="primary"
              aria-label="添加"
              loading={submitting}
              onClick={() => form.submit()}
            >
              添加
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
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input autoComplete="name" placeholder="请输入姓名" />
          </Form.Item>
          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' },
            ]}
          >
            <Input autoComplete="email" placeholder="name@example.com" />
          </Form.Item>
          <Form.Item name="department" label="部门" rules={[{ required: true, message: '请选择部门' }]}>
            <Select
              id="user-department-select"
              aria-label="部门"
              options={['质量保障部', '研发部', '产品部'].map((value) => ({ value, label: value }))}
            />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true, message: '请选择角色' }]}>
            <Select
              id="user-role-select"
              aria-label="角色"
              options={roleSelectOptions}
            />
          </Form.Item>
          <Form.Item
            name="password"
            label="初始密码"
            rules={[
              { required: true, message: '请输入初始密码' },
              { min: 8, message: '初始密码至少 8 位' },
            ]}
          >
            <Input.Password autoComplete="new-password" placeholder="至少 8 位" />
          </Form.Item>
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
