import type { TestCaseStatus } from '../../services/contracts';

export const testCaseStatusOptions = [
  '维护中',
  '已通过',
  '草稿',
  '已失败',
  '已停用',
] satisfies TestCaseStatus[];
