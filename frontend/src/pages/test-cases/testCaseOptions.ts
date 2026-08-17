/**
 * 用例状态筛选选项（与后端枚举保持一致）。
 */
import type { TestCaseStatus } from '../../services/contracts';

export const testCaseStatusOptions = [
  // 下拉框顺序：维护中 -> 已通过 -> 草稿 -> 已失败 -> 已停用。
  '维护中',
  '已通过',
  '草稿',
  '已失败',
  '已停用',
] satisfies TestCaseStatus[];
