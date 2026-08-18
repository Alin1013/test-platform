/**
 * 用例生成器页：上传 XMind 创建生成任务、查看进度、映射模块并确认入库。
 */
import {
  ApartmentOutlined,
  CheckCircleFilled,
  CloseCircleOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileOutlined,
  ReloadOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { Alert, App, Button, Empty, Modal, Progress, Select, Skeleton, Space, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { useAuth } from '../../services/AuthContext';
import { usePlatformService } from '../../services/PlatformServiceContext';
import type {
  TestModule,
  XMindTaskDetail,
  XMindTaskRecord,
  XMindTaskStatus,
  XMindTreeNode,
} from '../../services/contracts';
import './xmind.css';

type UploadState =
  // 上传阶段状态机：idle 可上传，uploading 展示模拟进度。
  | { status: 'idle'; error?: string }
  | { status: 'uploading'; fileName: string; progress: number };

export const statusLabels: Record<XMindTaskStatus, string> = {
  PENDING: '排队中',
  RUNNING: '生成中',
  WAITING_REVIEW: '待审核',
  FAILED: '失败',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
};

export const statusColors: Record<XMindTaskStatus, string> = {
  PENDING: 'default',
  RUNNING: 'processing',
  WAITING_REVIEW: 'warning',
  FAILED: 'error',
  COMPLETED: 'success',
  CANCELLED: 'default',
};

export interface FlatModule {
  id: string;
  label: string;
  name: string;
}

export function flattenModules(modules: TestModule[], parentPath = ''): FlatModule[] {
  // 递归展开模块树，label 为完整路径，便于与 XMind 目录名匹配。
  return modules.flatMap((module) => {
    const path = parentPath ? `${parentPath} / ${module.name}` : module.name;
    return [
      { id: module.id, label: path, name: module.name },
      ...flattenModules(module.children, path),
    ];
  });
}

function countNodes(nodes: XMindTreeNode[]): number {
  // 递归统计节点数（含自身）。
  return nodes.reduce((count, node) => count + 1 + countNodes(node.children), 0);
}

function renderTreeNode(node: XMindTreeNode, level: number, key: string): JSX.Element {
  // 递归渲染节点树，叶子节点用不同样式区分。
  const hasChildren = node.children.length > 0;
  return (
    <div key={key} className="xmind-tree__branch">
      <div role="treeitem" aria-level={level} aria-expanded={hasChildren || undefined}>
        <span className={hasChildren ? 'xmind-tree__node' : 'xmind-tree__leaf'} aria-hidden="true" />
        {node.title}
      </div>
      {hasChildren ? (
        <div className="xmind-tree__children" role="group">
          {node.children.map((child, index) => renderTreeNode(child, level + 1, `${key}-${index}`))}
        </div>
      ) : null}
    </div>
  );
}

function normalizeModulePath(path: string): string {
  // 归一化目录路径：去空格、合并连续斜杠。
  return path
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/');
}

export function findMappedModule(directory: string, modules: FlatModule[]): FlatModule | undefined {
  // 先按完整路径精确匹配，再按叶子名称唯一匹配，避免误映射。
  const normalizedDirectory = normalizeModulePath(directory);
  const exactMatch = modules.find((module) => normalizeModulePath(module.label) === normalizedDirectory);
  if (exactMatch) return exactMatch;
  const leafName = normalizedDirectory.split('/').at(-1);
  if (!leafName) return undefined;
  const leafMatches = modules.filter((module) => module.name.trim() === leafName);
  return leafMatches.length === 1 ? leafMatches[0] : undefined;
}

export function taskStatus(status: XMindTaskStatus) {
  return <Tag color={statusColors[status]}>{statusLabels[status]}</Tag>;
}

export function XMindPage() {
  // uploadTimer 用于上传中的模拟进度；任务详情按状态轮询刷新。
  const navigate = useNavigate();
  const service = usePlatformService();
  const { message } = App.useApp();
  const { user } = useAuth();
  const [upload, setUpload] = useState<UploadState>({ status: 'idle' });
  const [tasks, setTasks] = useState<XMindTaskRecord[] | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [detail, setDetail] = useState<XMindTaskDetail | null>(null);
  const [error, setError] = useState<string>();
  const [reloadToken, setReloadToken] = useState(0);
  const uploadTimer = useRef<number | null>(null);
  const clearUploadTimer = useCallback(() => {
    if (uploadTimer.current !== null) {
      window.clearInterval(uploadTimer.current);
      uploadTimer.current = null;
    }
  }, []);

  useEffect(() => () => clearUploadTimer(), [clearUploadTimer]);

  const loadTasks = useCallback(async () => {
    const result = await service.listXMindTasks(1, 20);
    setTasks(result.items);
    if (selectedTaskId === null && result.items[0]) setSelectedTaskId(result.items[0].id);
  }, [selectedTaskId, service]);

  useEffect(() => {
    let active = true;
    setTasks(null);
    void service.listXMindTasks(1, 20)
      .then((taskPage) => {
        if (!active) return;
        setTasks(taskPage.items);
        if (selectedTaskId === null && taskPage.items[0]) setSelectedTaskId(taskPage.items[0].id);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : '生成任务加载失败');
      });
    return () => {
      active = false;
    };
  }, [reloadToken, service]);

  useEffect(() => {
    // 选中任务变化时加载详情；PENDING/RUNNING 期间每 1.2 秒轮询。
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
        await loadTasks();
      } catch (reason: unknown) {
        if (active) setError(reason instanceof Error ? reason.message : '生成任务详情加载失败');
      }
    };
    void loadDetail();
    const shouldPoll = detail?.id !== selectedTaskId || detail.status === 'PENDING' || detail.status === 'RUNNING';
    if (!shouldPoll) return () => { active = false; };
    const timer = window.setInterval(() => void loadDetail(), 1200);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [detail?.id, detail?.status, loadTasks, selectedTaskId, service]);

  const startUpload = (file: File) => {
    // 校验扩展名后创建生成任务，成功后自动选中新任务并刷新列表。
    clearUploadTimer();
    setError(undefined);
    if (!file.name.toLowerCase().endsWith('.xmind')) {
      setUpload({ status: 'idle', error: '仅支持 .xmind 文件' });
      return;
    }
    setUpload({ status: 'uploading', fileName: file.name, progress: 12 });
    let progress = 12;
    uploadTimer.current = window.setInterval(() => {
      progress = Math.min(progress + 22, 88);
      setUpload({ status: 'uploading', fileName: file.name, progress });
    }, 160);
    void service
      .generateXMind(file, Number(user?.id ?? 1))
      .then((created) => {
        clearUploadTimer();
        setUpload({ status: 'idle' });
        setSelectedTaskId(created.id);
        setDetail(created);
        setReloadToken((token) => token + 1);
        void message.success('已创建生成任务，可离开页面后在任务列表查看进度');
      })
      .catch((reason: unknown) => {
        clearUploadTimer();
        setUpload({ status: 'idle' });
        setError(reason instanceof Error ? reason.message : 'XMind 用例生成失败，请稍后重试');
      });
  };

  const retryTask = async () => {
    if (!detail) return;
    try {
      const nextDetail = await service.retryXMindTask(detail.id);
      setDetail(nextDetail);
      setError(undefined);
      setReloadToken((token) => token + 1);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '重试生成任务失败');
    }
  };

  const exportPreview = async () => {
    if (!detail?.cases.length) return;
    try {
      const blob = await service.exportXMind(detail.cases);
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${detail.fileName.replace(/\.xmind$/i, '')}-功能用例.xlsx`;
      anchor.click();
      window.URL.revokeObjectURL(url);
    } catch (reason: unknown) {
      void message.error(reason instanceof Error ? reason.message : '导出失败，请重试');
    }
  };

  // 审核按钮：待审核任务跳转独立的审核测试点路由，按 taskId 深链直达该任务。
  const reviewTask = (task: XMindTaskRecord) => {
    navigate(`/xmind-cases?taskId=${task.id}`);
  };

  // 删除任务：Modal 二次确认后调用后端，删除后立即从列表中移除并清空选中。
  const deleteTask = (task: XMindTaskRecord) => {
    // 运行中任务后端会拒绝（409），前端提前禁用即可，避免无意义的确认弹窗。
    if (task.status === 'RUNNING') return;
    Modal.confirm({
      title: '删除生成任务',
      content: `确认删除任务「${task.fileName}」吗？删除后无法恢复。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await service.deleteXMindTask(task.id);
          setTasks((current) => current?.filter((item) => item.id !== task.id) ?? current);
          if (selectedTaskId === task.id) {
            setSelectedTaskId(null);
            setDetail(null);
          }
          void message.success('已删除生成任务');
        } catch (reason: unknown) {
          void message.error(reason instanceof Error ? reason.message : '删除任务失败');
        }
      },
    });
  };

  // 取消生成：仅排队中/生成中可取消；二次确认后调用后端并将任务就地标记为已取消。
  const cancelTask = (task: XMindTaskRecord) => {
    if (task.status !== 'PENDING' && task.status !== 'RUNNING') return;
    Modal.confirm({
      title: '取消生成任务',
      content: `确认取消任务「${task.fileName}」的生成吗？取消后任务将停留在「已取消」状态。`,
      okText: '取消生成',
      okButtonProps: { danger: true },
      cancelText: '返回',
      onOk: async () => {
        try {
          const updated = await service.cancelXMindTask(task.id);
          setTasks((current) =>
            current?.map((item) => (item.id === updated.id ? updated : item)) ?? current,
          );
          if (selectedTaskId === task.id) setDetail((current) => (current ? { ...current, status: 'CANCELLED' } : current));
          void message.success('已取消生成任务');
        } catch (reason: unknown) {
          void message.error(reason instanceof Error ? reason.message : '取消任务失败');
        }
      },
    });
  };

  const taskColumns: ColumnsType<XMindTaskRecord> = [
    { title: '文件', dataIndex: 'fileName', ellipsis: true },
    { title: '状态', dataIndex: 'status', width: 100, render: taskStatus },
    { title: '用例数', dataIndex: 'parsedCasesCount', width: 82 },
    { title: '提交人', dataIndex: 'uploaderName', width: 100 },
    { title: '更新时间', dataIndex: 'createdAt', width: 170, render: (value: string) => new Date(value).toLocaleString('zh-CN') },
    {
      title: '操作',
      width: 200,
      // 三个操作按钮常驻展示：审核仅待审核可用，取消生成仅排队中/生成中可用，
      // 删除仅非进行中的状态可用；不同状态下对应按钮置灰，行点击仍选中任务。
      render: (_, record) => (
        <Space size="small" onClick={(event) => event.stopPropagation()}>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined aria-hidden="true" />}
            aria-label={`审核 ${record.fileName}`}
            // 仅待审核状态有可审内容，其余状态置灰。
            disabled={record.status !== 'WAITING_REVIEW'}
            title={record.status !== 'WAITING_REVIEW' ? '仅待审核任务可审核' : '审核任务'}
            onClick={() => reviewTask(record)}
          >
        
          </Button>
          <Button
            type="link"
            size="small"
            icon={<CloseCircleOutlined aria-hidden="true" />}
            aria-label={`取消生成 ${record.fileName}`}
            // 仅排队中/生成中可取消，终态任务置灰。
            disabled={record.status !== 'PENDING' && record.status !== 'RUNNING'}
            title={
              record.status === 'PENDING' || record.status === 'RUNNING'
                ? '取消生成'
                : '仅排队中或生成中的任务可取消'
            }
            onClick={() => cancelTask(record)}
          >
          
          </Button>
          <Button
            type="link"
            size="small"
            danger
            icon={<DeleteOutlined aria-hidden="true" />}
            aria-label={`删除 ${record.fileName}`}
            // 进行中（排队中/生成中）的任务需先取消或等待，删除置灰。
            disabled={record.status === 'PENDING' || record.status === 'RUNNING'}
            title={
              record.status === 'PENDING' || record.status === 'RUNNING'
                ? '进行中的任务需先取消生成'
                : '删除任务'
            }
            onClick={() => deleteTask(record)}
          >
            
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <section className="page-section xmind-page">
      <PageHeader title="用例生成器" description="将思维导图节点解析为结构化功能测试用例" />

      {upload.status === 'idle' ? (
        <div
          className="xmind-dropzone"
          aria-label="XMind 文件上传区"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files.item(0);
            if (file) startUpload(file);
          }}
        >
          <div className="xmind-dropzone__icon" aria-hidden="true"><CloudUploadOutlined /></div>
          <h2>拖拽 XMind 文件到此处</h2>
          <p>支持文件扩展名 .xmind，上传后进入生成任务列表</p>
          <input
            id="xmind-file-input"
            className="xmind-file-input"
            type="file"
            aria-label="选择 XMind 文件"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) startUpload(file);
              event.target.value = '';
            }}
          />
          <label className="xmind-file-button" htmlFor="xmind-file-input">
            <FileOutlined aria-hidden="true" />
            选择 XMind 文件
          </label>
          {upload.error ? <div className="xmind-dropzone__error" role="alert">{upload.error}</div> : null}
        </div>
      ) : (
        <div className="xmind-uploading" aria-live="polite">
          <div className="xmind-stage-heading">
            <div className="xmind-stage-heading__icon" aria-hidden="true"><FileOutlined /></div>
            <div><span>正在创建生成任务</span><h2>{upload.fileName}</h2></div>
          </div>
          <Progress percent={upload.progress} status="active" strokeColor="#1677ff" />
        </div>
      )}

      {error ? <Alert type="error" showIcon message={error} closable onClose={() => setError(undefined)} /> : null}

      <div className="xmind-task-list" aria-label="XMind 生成任务列表">
        <div className="xmind-preview__header">
          <div><span className="xmind-eyebrow">后台生成</span><h2>生成任务</h2><p>任务独立于当前页面，生成完成后状态变为待审核。</p></div>
          <Button aria-label="刷新生成任务" icon={<ReloadOutlined />} onClick={() => setReloadToken((token) => token + 1)} />
        </div>
        {tasks ? (
          tasks.length ? (
            <Table<XMindTaskRecord>
              rowKey="id"
              columns={taskColumns}
              dataSource={tasks}
              pagination={false}
              size="small"
              rowClassName={(record) => record.id === selectedTaskId ? 'xmind-task-row--selected' : ''}
              onRow={(record) => ({ onClick: () => setSelectedTaskId(record.id) })}
            />
          ) : <Empty description="暂无生成任务" />
        ) : <Skeleton active paragraph={{ rows: 3 }} />}
      </div>

    </section>
  );
}
