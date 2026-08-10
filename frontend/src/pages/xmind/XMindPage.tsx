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
  return modules.flatMap((module) => {
    const path = parentPath ? `${parentPath} / ${module.name}` : module.name;
    return [
      { id: module.id, label: path, name: module.name },
      ...flattenModules(module.children, path),
    ];
  });
}

function countNodes(nodes: XMindTreeNode[]): number {
  return nodes.reduce((count, node) => count + 1 + countNodes(node.children), 0);
}

function renderTreeNode(node: XMindTreeNode, level: number, key: string): JSX.Element {
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
  return [...new Set(cases.map((item) => item.用例目录).filter(Boolean))];
}

function normalizeModulePath(path: string): string {
  return path
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/');
}

function findMappedModule(directory: string, modules: FlatModule[]): FlatModule | undefined {
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

      {detail ? (
        <div className="xmind-preview">
          <div className="xmind-preview__header">
            <div><span className="xmind-eyebrow">文件：{detail.fileName}</span><h2>任务详情 {taskStatus(detail.status)}</h2><p>{detail.status === 'WAITING_REVIEW' ? '请审核生成预览并确认模块映射。' : '生成任务状态会自动刷新。'}</p></div>
            <div className="xmind-preview__actions">
              {detail.cases.length ? <Button icon={<DownloadOutlined />} onClick={() => void exportPreview()}>导出 XLSX</Button> : null}
              {detail.status === 'FAILED' ? <Button type="primary" icon={<ReloadOutlined />} onClick={() => void retryTask()}>重新执行</Button> : null}
              {detail.status === 'WAITING_REVIEW' ? <Button type="primary" icon={<SaveOutlined />} loading={confirming} onClick={() => void confirmTask()}>审核并合并</Button> : null}
              {detail.status === 'COMPLETED' ? <Button type="primary" onClick={() => navigate('/test-cases/functional')}>查看功能用例</Button> : null}
            </div>
          </div>
          {detail.status === 'FAILED' && detail.lastError ? <Alert type="error" showIcon message={detail.lastError} /> : null}
          {detail.cases.length ? (
            <div className="xmind-preview__grid">
              <section className="xmind-preview-panel" aria-labelledby="xmind-tree-title">
                <header><h3 id="xmind-tree-title">XMind 树</h3><span>{countNodes(detail.tree)} 个节点</span></header>
                <div className="xmind-tree" role="tree" aria-label="XMind 树">
                  {detail.tree.map((node, index) => renderTreeNode(node, 1, String(index)))}
                </div>
              </section>
              <section className="xmind-preview-panel" aria-labelledby="xmind-mapping-title">
                <header><h3 id="xmind-mapping-title">模块映射</h3><span>{detail.cases.length} 条用例</span></header>
                <div className="xmind-mapping-list">
                  {directories.map((directory) => {
                    const match = findMappedModule(directory, flatModules);
                    return (
                      <div className="xmind-mapping" key={directory}>
                        <span className="xmind-mapping__label">用例目录</span>
                        <strong>目录路径：{directory.replaceAll('/', ' / ')}</strong>
                        <Select
                          aria-label={`选择 ${directory} 目标模块`}
                          value={moduleMapping[directory] || match?.id || undefined}
                          placeholder="选择目标模块"
                          options={flatModules.map((module) => ({ value: module.id, label: module.label }))}
                          onChange={(value) => setModuleMapping((current) => ({ ...current, [directory]: value }))}
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          ) : detail.status === 'PENDING' || detail.status === 'RUNNING' ? (
            <div className="xmind-uploading" aria-live="polite"><ApartmentOutlined /><p>后台正在生成，离开页面不会中断任务。</p></div>
          ) : null}
          {detail.cases.length ? (
            <section className="xmind-case-preview" aria-labelledby="xmind-case-title">
              <header><h3 id="xmind-case-title">功能用例预览</h3><span>{detail.cases.length} 条</span></header>
              <div className="xmind-case-preview__table-wrap">
                <table><thead><tr><th>用例目录</th><th>用例名称</th><th>用例等级</th><th>用例步骤</th><th>预期结果</th></tr></thead>
                  <tbody>{detail.cases.map((item, index) => <tr key={`${item.用例名称}-${index}`}><td>{item.用例目录}</td><td>{item.用例名称}</td><td>{item.用例等级}</td><td>{item.用例步骤}</td><td>{item.预期结果}</td></tr>)}</tbody>
                </table>
              </div>
            </section>
          ) : null}
          {detail.status === 'COMPLETED' ? <div className="xmind-complete" aria-live="polite"><CheckCircleFilled className="xmind-complete__icon" aria-hidden="true" /><h2>已合并到功能用例</h2><p>{detail.fileName} 已按模块映射写入用例库。</p></div> : null}
        </div>
      ) : null}
    </section>
  );
}
