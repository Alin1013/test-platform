/**
 * 用例列表筛选器：统一功能、接口与 UI 自动化用例的通用筛选，并按类型追加业务字段。
 */
import { CloseOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Dropdown, Input, Select } from 'antd';
import type {
  Priority,
  TestCaseFilterOptions,
  TestCaseStatus,
  TestCaseType,
} from '../../../services/contracts';
import { testCaseStatusOptions } from '../testCaseOptions';

export type CaseFilterKey = 'priority' | 'status' | 'creator' | 'smoke' | 'iteration';

interface CaseListFiltersProps {
  type: TestCaseType;
  activeFilters: CaseFilterKey[];
  keyword: string;
  priority: Priority | undefined;
  status: TestCaseStatus | undefined;
  creatorId: number | undefined;
  iteration: string | undefined;
  smokeFilter: 'smoke' | 'non-smoke' | undefined;
  filterOptions: TestCaseFilterOptions;
  onActiveFiltersChange: (fields: CaseFilterKey[]) => void;
  onKeywordChange: (value: string) => void;
  onPriorityChange: (value: Priority | undefined) => void;
  onStatusChange: (value: TestCaseStatus | undefined) => void;
  onCreatorChange: (value: number | undefined) => void;
  onIterationChange: (value: string | undefined) => void;
  onSmokeFilterChange: (value: 'smoke' | 'non-smoke' | undefined) => void;
}

const FILTER_LABELS: Record<CaseFilterKey, string> = {
  priority: '用例等级',
  status: '状态',
  creator: '创建人',
  smoke: '是否冒烟',
  iteration: '归属迭代',
};

/** 按用例类型提供与列表表头对应的可选筛选字段。 */
function getAvailableFilters(type: TestCaseType): CaseFilterKey[] {
  return type === 'functional'
    ? ['priority', 'status', 'creator', 'smoke', 'iteration']
    : ['priority', 'status', 'creator'];
}

/** 统一渲染三类用例的筛选字段，并维护字段显示/隐藏与字段值的边界。 */
export function CaseListFilters({
  type,
  activeFilters,
  keyword,
  priority,
  status,
  creatorId,
  iteration,
  smokeFilter,
  filterOptions,
  onActiveFiltersChange,
  onKeywordChange,
  onPriorityChange,
  onStatusChange,
  onCreatorChange,
  onIterationChange,
  onSmokeFilterChange,
}: CaseListFiltersProps) {
  const availableFilters = getAvailableFilters(type);
  const addableFilters = availableFilters.filter((field) => !activeFilters.includes(field));
  const removeFilter = (field: CaseFilterKey) => {
    // 移除字段时同时清空值，防止用户看不到的条件继续影响列表结果。
    if (field === 'priority') onPriorityChange(undefined);
    if (field === 'status') onStatusChange(undefined);
    if (field === 'creator') onCreatorChange(undefined);
    if (field === 'smoke') onSmokeFilterChange(undefined);
    if (field === 'iteration') onIterationChange(undefined);
    onActiveFiltersChange(activeFilters.filter((item) => item !== field));
  };

  const renderFilter = (field: CaseFilterKey) => {
    const commonProps = {
      allowClear: true,
      placeholder: FILTER_LABELS[field],
      className: 'case-list-filter-field__select',
    };
    const select = field === 'priority' ? (
      <Select
        {...commonProps}
        id="priority-filter"
        aria-label="筛选优先级"
        value={priority}
        options={['P0', 'P1', 'P2', 'P3'].map((value) => ({ value, label: value }))}
        onChange={onPriorityChange}
      />
    ) : field === 'status' ? (
      <Select
        {...commonProps}
        id="status-filter"
        aria-label="筛选状态"
        value={status}
        options={testCaseStatusOptions.map((value) => ({ value, label: value }))}
        onChange={onStatusChange}
      />
    ) : field === 'creator' ? (
      <Select
        {...commonProps}
        id="creator-filter"
        aria-label="筛选创建人"
        value={creatorId}
        options={filterOptions.creators.map((creator) => ({
          value: creator.id,
          label: creator.name,
        }))}
        onChange={onCreatorChange}
      />
    ) : field === 'smoke' ? (
      <Select
        {...commonProps}
        id="smoke-filter"
        aria-label="筛选是否冒烟"
        value={smokeFilter}
        options={[
          { value: 'smoke', label: '是' },
          { value: 'non-smoke', label: '否' },
        ]}
        onChange={onSmokeFilterChange}
      />
    ) : (
      <Select
        {...commonProps}
        id="iteration-filter"
        aria-label="筛选归属迭代"
        value={iteration}
        options={filterOptions.iterations.map((value) => ({ value, label: value }))}
        onChange={onIterationChange}
      />
    );

    return (
      <div className="case-list-filter-field" key={field}>
        {select}
        <Button
          type="text"
          size="small"
          className="case-list-filter-field__remove"
          aria-label={`移除${FILTER_LABELS[field]}筛选`}
          icon={<CloseOutlined />}
          onClick={() => removeFilter(field)}
        />
      </div>
    );
  };

  return (
    <div className="case-list-filters">
      <Input
        className="case-list-toolbar__search"
        prefix={<SearchOutlined />}
        placeholder="搜索用例名称或接口地址"
        allowClear
        value={keyword}
        onChange={(event) => onKeywordChange(event.target.value)}
      />
      <div className="case-list-filter-fields">
        {activeFilters.filter((field) => availableFilters.includes(field)).map(renderFilter)}
        <Dropdown
          trigger={['click']}
          disabled={!addableFilters.length}
          menu={{
            items: addableFilters.map((field) => ({ key: field, label: FILTER_LABELS[field] })),
            onClick: ({ key }) => {
              onActiveFiltersChange([...activeFilters, key as CaseFilterKey]);
            },
          }}
        >
          <Button
            type="dashed"
            size="small"
            icon={<PlusOutlined />}
            aria-label="添加筛选字段"
          >
            添加字段
          </Button>
        </Dropdown>
      </div>
    </div>
  );
}
