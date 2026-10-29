/**
 * 用例状态筛选选项（与后端枚举保持一致）。
 */
import type { TestCaseStatus } from '../../services/contracts';

export const testCaseStatusOptions = [
  // 所有测试用例状态统一为正常，审核结果由 XMind reviewStatus 单独展示。
  '正常',
] satisfies TestCaseStatus[];
