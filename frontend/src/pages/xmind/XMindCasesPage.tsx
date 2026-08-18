/**
 * 审核测试点页：独立路由 /xmind-cases，专注「待审核」XMind 任务的用例审核与合并入库。
 * 与用例生成器（/xmind）解耦：从生成器的「审核」按钮以 ?taskId= 深链直达某个任务；
 * 进入后若未指定深链，默认选中任务列表中的首个待审核任务，便于直接开始审核。
 */
import { AuditOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Empty, Skeleton, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { usePlatformService } from '../../services/PlatformServiceContext';
import type { TestModule, XMindTaskDetail, XMindTaskRecord } from '../../services/contracts';
import { XMindReviewView } from './XMindReviewView';
import { flattenModules, statusLabels, taskStatus, type FlatModule } from './XMindPage';
import './xmind.css';

export function XMindCasesPage() {
  // 路由跳转与 ?taskId= 深链解析；默认选中首个待审核任务。
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const service = usePlatformService();
  const [tasks, setTasks] = useState<XMindTaskRecord[] | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [detail, setDetail] = useState<XMindTaskDetail | null>(null);
  const [modules, setModules] = useState<TestModule[]>([]);
  const [error, setError] = useState<string>();
  const [reloadToken, setReloadToken] = useState(0);
  const flatModules = useMemo<FlatModule[]>(() => flattenModules(modules), [modules]);
  // 标记是否已根据首次加载的任务列表自动选中过任务，避免后续刷新重复覆盖用户选择。
  const didAutoSelect = useRef(false);

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
        if (hasDeep && taskPage.items.some((item) => item.id === deepId)) {
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
      <PageHeader title="审核测试点" description="对待审核的 XMind 生成用例逐条确认、修改或删除，并合并到用例库" />

      {error ? <Alert type="error" showIcon message={error} closable onClose={() => setError(undefined)} /> : null}

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
            <Table<XMindTaskRecord>
              rowKey="id"
              columns={taskColumns}
              dataSource={tasks}
              pagination={false}
              size="small"
              rowClassName={(record) => (record.id === selectedTaskId ? 'xmind-task-row--selected' : '')}
              onRow={(record) => ({ onClick: () => setSelectedTaskId(record.id) })}
            />
          ) : <Empty description="暂无生成任务" />
        ) : <Skeleton active paragraph={{ rows: 3 }} />}
      </div>

      {detail && detail.status === 'WAITING_REVIEW' ? (
        // 待审核任务：渲染用例审核视图，逐条/批量确认与合并入库。
        <XMindReviewView task={detail} modules={modules} onTaskChange={handleTaskChange} />
      ) : null}

      {detail && detail.status !== 'WAITING_REVIEW' ? (
        // 非待审核任务（如已合并/生成中/已取消）给出状态提示，引导回到待审核任务。
        <Alert
          type={detail.status === 'COMPLETED' ? 'success' : 'info'}
          showIcon
          className="xmind-goto-review"
          message={detail.status === 'COMPLETED' ? '该任务已合并入库' : `任务当前状态：${statusLabels[detail.status]}，暂无可审核内容`}
          description={<span>可在上方任务列表选择「待审核」任务进入审核，或返回用例生成器查看生成进度。</span>}
        />
      ) : null}
    </section>
  );
}
