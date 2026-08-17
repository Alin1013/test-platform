/**
 * 用例生成器页：上传 XMind 创建生成任务、查看进度、映射模块并确认入库。
 */
import {
  ApartmentOutlined,
  CheckCircleFilled,
  CloudUploadOutlined,
  DownloadOutlined,
  FileOutlined,
  ReloadOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { Alert, App, Button, Empty, Progress, Select, Skeleton, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { useAuth } from '../../services/AuthContext';
import { usePlatformService } from '../../services/PlatformServiceContext';
import type {
  TestModule,
  XMindGeneratedCase,
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

const statusLabels: Record<XMindTaskStatus, string> = {
  PENDING: '排队中',
  RUNNING: '生成中',
  WAITING_REVIEW: '待审核',
  FAILED: '失败',
  COMPLETED: '已完成',
};

const statusColors: Record<XMindTaskStatus, string> = {
  PENDING: 'default',
  RUNNING: 'processing',
  WAITING_REVIEW: 'warning',
  FAILED: 'error',
  COMPLETED: 'success',
};

interface FlatModule {
  id: string;
  label: string;
  name: string;
}

function flattenModules(modules: TestModule[], parentPath = ''): FlatModule[] {
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

function previewDirectories(cases: XMindGeneratedCase[]): string[] {
  // 提取预览用例中出现的目录集合（去重保序）。
  return [...new Set(cases.map((item) => item.用例目录).filter(Boolean))];
}

function normalizeModulePath(path: string): string {
  // 归一化目录路径：去空格、合并连续斜杠。
  return path
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/');
}

function findMappedModule(directory: string, modules: FlatModule[]): FlatModule | undefined {
  // 先按完整路径精确匹配，再按叶子名称唯一匹配，避免误映射。
  const normalizedDirectory = normalizeModulePath(directory);
  const exactMatch = modules.find((module) => normalizeModulePath(module.label) === normalizedDirectory);
  if (exactMatch) return exactMatch;
  const leafName = normalizedDirectory.split('/').at(-1);
  if (!leafName) return undefined;
  const leafMatches = modules.filter((module) => module.name.trim() === leafName);
  return leafMatches.length === 1 ? leafMatches[0] : undefined;
}

function taskStatus(status: XMindTaskStatus) {
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
  const [modules, setModules] = useState<TestModule[]>([]);
  const [moduleMapping, setModuleMapping] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const uploadTimer = useRef<number | null>(null);
  const flatModules = useMemo(() => flattenModules(modules), [modules]);

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
    void Promise.all([service.listXMindTasks(1, 20), service.listTestModules()])
      .then(([taskPage, nextModules]) => {
        if (!active) return;
        setTasks(taskPage.items);
        setModules(nextModules);
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
        const defaults = Object.fromEntries(
          previewDirectories(nextDetail.cases).map((directory) => [
            directory,
            nextDetail.moduleMapping[directory] ?? findMappedModule(directory, flatModules)?.id ?? '',
          ]),
        );
        setModuleMapping(defaults);
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
  }, [detail?.id, detail?.status, flatModules, loadTasks, selectedTaskId, service]);

  const directories = useMemo(() => previewDirectories(detail?.cases ?? []), [detail?.cases]);

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
        setModuleMapping(created.moduleMapping);
        setReloadToken((token) => token + 1);
        void message.success('已创建生成任务，可离开页面后在任务列表查看进度');
      })
      .catch((reason: unknown) => {
        clearUploadTimer();
        setUpload({ status: 'idle' });
        setError(reason instanceof Error ? reason.message : 'XMind 用例生成失败，请稍后重试');
      });
  };

  const confirmTask = async () => {
    // 确认入库：先校验所有目录都已映射模块，再提交后端。
    if (!detail || detail.status !== 'WAITING_REVIEW') return;
    if (directories.some((directory) => !moduleMapping[directory])) {
      setError('请为每个用例目录选择目标模块');
      return;
    }
    setConfirming(true);
    try {
      const result = await service.confirmXMindTask(detail.id, { moduleMapping });
      setDetail({ ...detail, status: 'COMPLETED', moduleMapping });
      setTasks((current) => current?.map((task) => task.id === detail.id ? { ...task, status: 'COMPLETED' } : task) ?? current);
      void message.success(`已合并 ${result.saved_cases.length} 条功能用例`);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '保存用例失败，请重试');
    } finally {
      setConfirming(false);
    }
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

  const taskColumns: ColumnsType<XMindTaskRecord> = [
    { title: '文件', dataIndex: 'fileName', ellipsis: true },
    { title: '状态', dataIndex: 'status', width: 100, render: taskStatus },
    { title: '用例数', dataIndex: 'parsedCasesCount', width: 82 },
    { title: '提交人', dataIndex: 'uploaderName', width: 100 },
    { title: '更新时间', dataIndex: 'createdAt', width: 170, render: (value: string) => new Date(value).toLocaleString('zh-CN') },
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
