import { Tag } from 'antd';
import type { TestCaseStatus } from '../services/contracts';

const statusColors: Record<TestCaseStatus, string> = {
  已通过: 'success',
  维护中: 'processing',
  草稿: 'default',
  已停用: 'error',
};

export function StatusBadge({ status }: { status: TestCaseStatus }) {
  return <Tag color={statusColors[status]}>{status}</Tag>;
}
