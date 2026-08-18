/**
 * 审核测试点页：独立路由 /xmind-cases，专注「待审核」XMind 任务的用例审核与合并入库。
 * 与用例生成器（/xmind）解耦：从生成器的「审核」按钮以 ?taskId= 深链直达某个任务；
 * 进入后若未指定深链，默认选中任务列表中的首个待审核任务，便于直接开始审核。
 */
import { ArrowLeftOutlined, AuditOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Empty, Skeleton, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppPagination, PAGINATION_PAGE_SIZE_OPTIONS } from '../../components/common/AppPagination';
import { PageHeader } from '../../components/PageHeader';
import { usePlatformService } from '../../services/PlatformServiceContext';
import type { TestModule, XMindTaskDetail, XMindTaskRecord } from '../../services/contracts';
import { XMindReviewView } from './XMindReviewView';
import { flattenModules, taskStatus, type FlatModule } from './XMindPage';
import './xmind.css';

export function XMindCasesPage() {
  // 路由跳转与 ?taskId= 深链解析；默认选中首个待审核任务。
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const service = usePlatformService();
  // 生成器通过 taskId 深链进入时，只展示该任务的审核内容，不重复展示任务列表。
  const deepTaskId = Number(searchParams.get('taskId'));
  const hasDeepLink = Number.isInteger(deepTaskId) && deepTaskId > 0;
  const [tasks, setTasks] = useState<XMindTaskRecord[] | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [detail, setDetail] = useState<XMindTaskDetail | null>(null);
  const [modules, setModules] = useState<TestModule[]>([]);
  const [error, setError] = useState<string>();
  const [reloadToken, setReloadToken] = useState(0);
  const flatModules = useMemo<FlatModule[]>(() => flattenModules(modules), [modules]);
  // 标记是否已根据首次加载的任务列表自动选中过任务，避免后续刷新重复覆盖用户选择。
  const didAutoSelect = useRef(false);
  // 任务列表分页状态：分页重置回首页，避免刷新后停留在越界页码导致空列表。
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGINATION_PAGE_SIZE_OPTIONS[0]);
  const totalTasks = tasks?.length ?? 0;
  const pagedTasks = useMemo<XMindTaskRecord[]>(() => {
    if (!tasks) return [];
    const start = (page - 1) * pageSize;
    return tasks.slice(start, start + pageSize);
  }, [tasks, page, pageSize]);

  useEffect(() => {
    // 加载审核任务列表与模块树；优先按 URL 的 taskId 深链选中对应任务。
    let active = true;
    setTasks(null);
    const deepId = Number(searchParams.get('taskId'));
    const hasDeep = !Number.isNaN(deepId) && deepId > 0;
    void Promise.all([service.listXMindTasks(1, 20), service.listTestModules()])
      .then(([taskPage, nextModules]) => {
        if (!active) return;
        setTasks(taskPage.items);
        setModules(nextModules);
        setPage(1);
        if (hasDeep) {
          // 深链任务可能不在当前分页，直接加载详情而不是依赖列表命中。
          setSelectedTaskId(deepId);
        } else if (!didAutoSelect.current && taskPage.items[0]) {
          // 未指定深链时默认选中首个待审核任务，便于直接开始审核。
          const firstReview = taskPage.items.find((item) => item.status === 'WAITING_REVIEW');
          setSelectedTaskId(firstReview ? firstReview.id : taskPage.items[0].id);
        }
        didAutoSelect.current = true;
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : '审核任务加载失败');
      });
    return () => {
      active = false;
    };
  }, [reloadToken, searchParams, service]);

  useEffect(() => {
    // 选中任务变化时加载详情；PENDING/RUNNING 期间轮询，待审核为终态不再轮询。
    if (selectedTaskId === null) {
      setDetail(null);
      return;
    }
    let active = true;
    const loadDetail = async () => {
      try {
        const nextDetail = await service.getXMindTask(selectedTaskId);
        if (!active) return;
        setDetail(nextDetail);
      } catch (reason: unknown) {
        if (active) setError(reason instanceof Error ? reason.message : '审核任务详情加载失败');
      }
    };
    void loadDetail();
    const shouldPoll = detail?.status === 'PENDING' || detail?.status === 'RUNNING';
    if (!shouldPoll) return () => { active = false; };
    const timer = window.setInterval(() => void loadDetail(), 1500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [detail?.status, selectedTaskId, service]);

  const handleTaskChange = useCallback((nextDetail: XMindTaskDetail) => {
    // 审核字段变更/合并后回传最新详情，并同步任务列表中的状态（如合并后变为 COMPLETED）。
    setDetail(nextDetail);
    setTasks((current) =>
      current?.map((item) => (item.id === nextDetail.id ? { ...item, status: nextDetail.status } : item)) ?? current,
    );
  }, []);

  const openReview = (task: XMindTaskRecord) => {
    // 行内「审核」仅对待审核任务可用，点击跳转本页并带 taskId 深链。
    navigate(`/xmind-cases?taskId=${task.id}`);
  };

  const taskColumns: ColumnsType<XMindTaskRecord> = [
    { title: '文件', dataIndex: 'fileName', ellipsis: true },
    { title: '状态', dataIndex: 'status', width: 100, render: taskStatus },
    { title: '用例数', dataIndex: 'parsedCasesCount', width: 82 },
    { title: '提交人', dataIndex: 'uploaderName', width: 100 },
    { title: '更新时间', dataIndex: 'createdAt', width: 170, render: (value: string) => new Date(value).toLocaleString('zh-CN') },
    {
      title: '操作',
      width: 100,
      // 审核按钮仅待审核任务可用；点击跳转独立审核页（带深链）。
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          icon={<AuditOutlined aria-hidden="true" />}
          aria-label={`审核 ${record.fileName}`}
          disabled={record.status !== 'WAITING_REVIEW'}
          title={record.status !== 'WAITING_REVIEW' ? '仅待审核任务可审核' : '审核任务'}
          onClick={(event) => {
            event.stopPropagation();
            openReview(record);
          }}
        >
          审核
        </Button>
      ),
    },
  ];

  return (
    <section className="page-section xmind-cases-page">
      <PageHeader
        title="审核测试点"
        description={hasDeepLink ? '审核当前 XMind 任务的生成用例' : '对待审核的 XMind 生成用例逐条确认、修改或删除，并合并到用例库'}
        actions={
          hasDeepLink ? (
            <Button type="link" icon={<ArrowLeftOutlined aria-hidden="true" />} onClick={() => navigate('/xmind-cases')}>
              返回任务列表
            </Button>
          ) : undefined
        }
      />

      {error ? <Alert type="error" showIcon message={error} closable onClose={() => setError(undefined)} /> : null}

      {!hasDeepLink ? (
        <div className="xmind-task-list" aria-label="待审核 XMind 任务列表">
          <div className="xmind-preview__header">
            <div>
              <span className="xmind-eyebrow">用例审核</span>
              <h2>待审核任务</h2>
              <p>选择「待审核」任务进入用例审核与合并入库。</p>
            </div>
            <Button aria-label="刷新审核任务" icon={<ReloadOutlined />} onClick={() => setReloadToken((token) => token + 1)} />
          </div>
          {tasks ? (
            tasks.length ? (
              <>
                <Table<XMindTaskRecord>
                  rowKey="id"
                  columns={taskColumns}
                  dataSource={pagedTasks}
                  pagination={false}
                  size="small"
                  rowClassName={(record) => (record.id === selectedTaskId ? 'xmind-task-row--selected' : '')}
                  onRow={(record) => ({ onClick: () => setSelectedTaskId(record.id) })}
                />
                {totalTasks > pageSize ? (
                  <AppPagination
                    className="xmind-task-list__pagination"
                    current={page}
                    pageSize={pageSize}
                    total={totalTasks}
                    onChange={(nextPage, nextPageSize) => {
                      setPage(nextPage);
                      setPageSize(nextPageSize);
                    }}
                  />
                ) : null}
              </>
            ) : <Empty description="暂无生成任务" />
          ) : <Skeleton active paragraph={{ rows: 3 }} />}
        </div>
      ) : null}

      {/* 只有待审核任务展示审核区；其它状态已由任务列表中的状态列完整表达。 */}
      {detail && detail.status === 'WAITING_REVIEW' ? (
        <XMindReviewView task={detail} modules={modules} onTaskChange={handleTaskChange} />
      ) : null}
    </section>
  );
}
