/**
 * 用例列表筛选器：统一功能、接口与 UI 自动化用例的通用筛选，并按类型追加业务字段。
 */
import { SearchOutlined } from '@ant-design/icons';
import { Input, Select } from 'antd';
import type {
  Priority,
  TestCaseFilterOptions,
  TestCaseStatus,
  TestCaseType,
} from '../../../services/contracts';
import { testCaseStatusOptions } from '../testCaseOptions';

interface CaseListFiltersProps {
  type: TestCaseType;
  keyword: string;
  priority: Priority | undefined;
  status: TestCaseStatus | undefined;
  projectName: string | undefined;
  iteration: string | undefined;
  smokeFilter: 'smoke' | 'non-smoke' | undefined;
  filterOptions: TestCaseFilterOptions;
  onKeywordChange: (value: string) => void;
  onPriorityChange: (value: Priority | undefined) => void;
  onStatusChange: (value: TestCaseStatus | undefined) => void;
  onProjectNameChange: (value: string | undefined) => void;
  onIterationChange: (value: string | undefined) => void;
  onSmokeFilterChange: (value: 'smoke' | 'non-smoke' | undefined) => void;
}

/** 按用例类型渲染列表筛选项；功能用例保留项目、冒烟与迭代的附加筛选。 */
export function CaseListFilters({
  type,
  keyword,
  priority,
  status,
  projectName,
  iteration,
  smokeFilter,
  filterOptions,
  onKeywordChange,
  onPriorityChange,
  onStatusChange,
  onProjectNameChange,
  onIterationChange,
  onSmokeFilterChange,
}: CaseListFiltersProps) {
  // Fragment 保证筛选项仍是工具栏 grid 的直接子项，不改变既有的响应式栅格规则。
  return (
    <>
      <Input
        className="case-list-toolbar__search"
        prefix={<SearchOutlined />}
        placeholder="搜索用例名称或接口地址"
        allowClear
        value={keyword}
        onChange={(event) => onKeywordChange(event.target.value)}
      />
      <Select
        id="priority-filter"
        aria-label="筛选优先级"
        placeholder="优先级"
        allowClear
        value={priority}
        options={['P0', 'P1', 'P2', 'P3'].map((value) => ({ value, label: value }))}
        onChange={onPriorityChange}
      />
      <Select
        id="status-filter"
        aria-label="筛选状态"
        placeholder="状态"
        allowClear
        value={status}
        options={testCaseStatusOptions.map((value) => ({ value, label: value }))}
        onChange={onStatusChange}
      />
      {type === 'functional' ? (
        <div className="case-list-toolbar__functional-filters">
          <Select
            id="project-filter"
            aria-label="筛选项目归属"
            placeholder="项目归属"
            allowClear
            value={projectName}
            options={filterOptions.projectNames.map((value) => ({ value, label: value }))}
            onChange={onProjectNameChange}
          />
          <Select
            id="smoke-filter"
            aria-label="筛选是否冒烟"
            placeholder="是否冒烟"
            allowClear
            value={smokeFilter}
            options={[
              { value: 'smoke', label: '是' },
              { value: 'non-smoke', label: '否' },
            ]}
            onChange={onSmokeFilterChange}
          />
          <Select
            id="iteration-filter"
            aria-label="筛选归属迭代"
            placeholder="归属迭代"
            allowClear
            value={iteration}
            options={filterOptions.iterations.map((value) => ({ value, label: value }))}
            onChange={onIterationChange}
          />
        </div>
      ) : null}
    </>
  );
}
