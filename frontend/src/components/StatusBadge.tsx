/**
 * 用例状态徽章：把内部状态映射为 Ant Design Tag 的颜色。
 */
import { Tag } from 'antd';
import type { TestCaseStatus } from '../services/contracts';

const statusColors: Record<TestCaseStatus, string> = {
  // 维护中视为“处理中”进行中状态，失败/停用统一红色。
  已通过: 'success',
  维护中: 'processing',
  草稿: 'default',
  已失败: 'error',
  已停用: 'error',
};

export function StatusBadge({ status }: { status: TestCaseStatus }) {
  /** 按状态渲染带颜色的 Tag。 */
  return <Tag color={statusColors[status]}>{status}</Tag>;
}
