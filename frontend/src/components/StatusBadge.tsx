/**
 * 用例状态徽章：把内部状态映射为 Ant Design Tag 的颜色。
 */
import { Tag } from 'antd';
import type { TestCaseStatus } from '../services/contracts';

const statusColors: Record<TestCaseStatus, string> = {
  // 用例状态已收敛为“正常”，颜色保持稳定以兼容现有列表视觉。
  正常: 'success',
};

export function StatusBadge({ status }: { status: TestCaseStatus }) {
  /** 按状态渲染带颜色的 Tag。 */
  return <Tag color={statusColors[status]}>{status}</Tag>;
}
