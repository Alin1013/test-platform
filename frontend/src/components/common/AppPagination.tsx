import { InputNumber, Pagination } from 'antd';
import type { PaginationProps } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import './AppPagination.css';

export const PAGINATION_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

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
  const [instanceId] = useState(() => ++paginationInstanceSequence);
  const [jumpPage, setJumpPage] = useState(current);

  useEffect(() => {
    setJumpPage(current);
  }, [current]);

  const normalizedPageSize = useMemo(
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
