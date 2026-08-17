/**
 * 通用分页组件：AntD 分页 + 数字跳页输入框。
 */
import { InputNumber, Pagination } from 'antd';
import type { PaginationProps } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import './AppPagination.css';

export const PAGINATION_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

// 全局自增序列，用于生成每页条数选择器的唯一 id。
let paginationInstanceSequence = 0;

export interface AppPaginationProps {
  current?: number;
  pageSize?: number;
  total: number;
  onChange: (page: number, pageSize: number) => void;
  className?: string;
  size?: PaginationProps['size'];
}

export function AppPagination({
  current = 1,
  pageSize = 10,
  total,
  onChange,
  className,
  size = 'small',
}: AppPaginationProps) {
  // 跳页输入框与当前页同步，页码超出范围时收敛到边界。
  const [instanceId] = useState(() => ++paginationInstanceSequence);
  const [jumpPage, setJumpPage] = useState(current);

  useEffect(() => {
    setJumpPage(current);
  }, [current]);

  const normalizedPageSize = useMemo(
    // 非法的每页条数回退到 10，避免空选项或异常值。
    () =>
      PAGINATION_PAGE_SIZE_OPTIONS.includes(
        pageSize as (typeof PAGINATION_PAGE_SIZE_OPTIONS)[number],
      )
        ? pageSize
        : 10,
    [pageSize],
  );
  const totalPages = Math.max(1, Math.ceil(total / normalizedPageSize));

  const handleJump = () => {
    // 跳页：钳制在 1..totalPages 之间后触发 onChange。
    const nextPage = Math.min(totalPages, Math.max(1, jumpPage || 1));
    setJumpPage(nextPage);
    onChange(nextPage, normalizedPageSize);
  };

  return (
    <div className={`app-pagination${className ? ` ${className}` : ''}`} aria-label="分页">
      <Pagination
        current={current}
        pageSize={normalizedPageSize}
        total={total}
        size={size}
        showSizeChanger={{
          id: `app-pagination-page-size-${instanceId}`,
          'aria-label': '每页条数',
        }}
        pageSizeOptions={[...PAGINATION_PAGE_SIZE_OPTIONS]}
        showQuickJumper={false}
        onChange={(page, nextPageSize) => onChange(page, nextPageSize)}
      />
      <span className="app-pagination__jumper">
        <span>跳至</span>
        <InputNumber
          aria-label="跳转页码"
          min={1}
          max={totalPages}
          value={jumpPage}
          size={size}
          controls={false}
          onChange={(value) => setJumpPage(value ?? 1)}
          onPressEnter={handleJump}
        />
        <span>页</span>
      </span>
    </div>
  );
}
