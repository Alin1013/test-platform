import {
  ApartmentOutlined,
  ArrowRightOutlined,
  CheckCircleFilled,
  CloseOutlined,
  CloudUploadOutlined,
  DownloadOutlined,
  FileOutlined,
  ReloadOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { Alert, App, Button, Progress, Select, Spin } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { useAuth } from '../../services/AuthContext';
import { usePlatformService } from '../../services/PlatformServiceContext';
import type {
  TestModule,
  XMindGeneratedCase,
  XMindGenerationResult,
  XMindTreeNode,
} from '../../services/contracts';
import './xmind.css';

type WorkflowState =
  | { status: 'idle'; error?: string }
  | { status: 'uploading'; fileName: string; progress: number }
  | { status: 'generating'; fileName: string }
  | {
      status: 'preview';
      fileName: string;
      result: XMindGenerationResult;
      modules: TestModule[];
      moduleMapping: Record<string, string>;
      error?: string;
    }
  | { status: 'complete'; fileName: string; generatedCount: number };

const initialState: WorkflowState = { status: 'idle' };

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
  const exactMatch = modules.find(
    (module) => normalizeModulePath(module.label) === normalizedDirectory,
  );
  if (exactMatch) return exactMatch;

  const leafName = normalizedDirectory.split('/').at(-1);
  if (!leafName) return undefined;
  const leafMatches = modules.filter((module) => module.name.trim() === leafName);
  return leafMatches.length === 1 ? leafMatches[0] : undefined;
}

export function XMindPage() {
  const navigate = useNavigate();
  const service = usePlatformService();
  const { message } = App.useApp();
  const { user } = useAuth();
  const [workflow, setWorkflow] = useState<WorkflowState>(initialState);
  const [confirming, setConfirming] = useState(false);
  const uploadTimer = useRef<number | null>(null);
  const generationController = useRef<AbortController | null>(null);
  const requestSequence = useRef(0);

  const clearUploadTimer = useCallback(() => {
    if (uploadTimer.current !== null) {
      window.clearInterval(uploadTimer.current);
      uploadTimer.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      clearUploadTimer();
      generationController.current?.abort();
    },
    [clearUploadTimer],
  );

  const startUpload = (file: File) => {
    clearUploadTimer();
    generationController.current?.abort();
    generationController.current = null;
    const requestId = ++requestSequence.current;

    if (!file.name.toLowerCase().endsWith('.xmind')) {
      setWorkflow({ status: 'idle', error: '仅支持 .xmind 文件' });
      return;
    }

    setWorkflow({ status: 'uploading', fileName: file.name, progress: 8 });
    let progress = 8;
    const tickDelay = window.navigator.userAgent.includes('jsdom') ? 1 : 140;
    uploadTimer.current = window.setInterval(() => {
      progress = Math.min(progress + 16, 100);
      if (progress !== 100) {
        setWorkflow({ status: 'uploading', fileName: file.name, progress });
        return;
      }
      clearUploadTimer();
      setWorkflow({ status: 'generating', fileName: file.name });
      const controller = new AbortController();
      generationController.current = controller;
      void service
        .generateXMind(file, Number(user?.id ?? 1), controller.signal)
        .then(async (result) => {
          if (requestId !== requestSequence.current) return;
          let modules: TestModule[] = [];
          try {
            modules = await service.listTestModules();
          } catch {
            // 生成结果仍然可预览，用户可以稍后重试目录加载。
          }
          const flatModules = flattenModules(modules);
          const moduleMapping = Object.fromEntries(
            previewDirectories(result.cases).map((directory) => {
              const match = findMappedModule(directory, flatModules);
              return [directory, match?.id ?? ''];
            }),
          );
          setWorkflow({
            status: 'preview',
            fileName: file.name,
            result,
            modules,
            moduleMapping,
          });
        })
        .catch((error: unknown) => {
          if (requestId !== requestSequence.current) return;
          setWorkflow({
            status: 'idle',
            error: error instanceof Error ? error.message : 'XMind 用例生成失败，请稍后重试',
          });
        })
        .finally(() => {
          if (generationController.current === controller) {
            generationController.current = null;
          }
        });
    }, tickDelay);
  };

  const resetWorkflow = () => {
    requestSequence.current += 1;
    clearUploadTimer();
    generationController.current?.abort();
    generationController.current = null;
    setConfirming(false);
    setWorkflow(initialState);
  };

  const flatModules = useMemo(
    () => (workflow.status === 'preview' ? flattenModules(workflow.modules) : []),
    [workflow],
  );

  const updateMapping = (directory: string, moduleId: string) => {
    if (workflow.status !== 'preview') return;
    setWorkflow({
      ...workflow,
      moduleMapping: { ...workflow.moduleMapping, [directory]: moduleId },
      error: undefined,
    });
  };

  const confirmPreview = async () => {
    if (workflow.status !== 'preview') return;
    const directories = previewDirectories(workflow.result.cases);
    if (directories.some((directory) => !workflow.moduleMapping[directory])) {
      setWorkflow({ ...workflow, error: '请为每个用例目录选择目标模块' });
      return;
    }
    setConfirming(true);
    try {
      const saved = await service.confirmXMind({
        uploaderId: Number(user?.id ?? 1),
        moduleMapping: workflow.moduleMapping,
        cases: workflow.result.cases,
      });
      setWorkflow({
        status: 'complete',
        fileName: workflow.fileName,
        generatedCount: saved.saved_cases.length,
      });
    } catch (error: unknown) {
      setWorkflow({
        ...workflow,
        error: error instanceof Error ? error.message : '保存用例失败，请重试',
      });
    } finally {
      setConfirming(false);
    }
  };

  const exportPreview = async () => {
    if (workflow.status !== 'preview') return;
    try {
      const blob = await service.exportXMind(workflow.result.cases);
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${workflow.fileName.replace(/\.xmind$/i, '')}-功能用例.xlsx`;
      anchor.click();
      window.URL.revokeObjectURL(url);
      void message.success('已导出生成预览');
    } catch (error: unknown) {
      void message.error(error instanceof Error ? error.message : '导出失败，请重试');
    }
  };

  return (
    <section className="page-section xmind-page">
      <PageHeader title="用例生成器" description="将思维导图节点解析为结构化功能测试用例" />

      {workflow.status === 'idle' ? (
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
          <p>支持文件扩展名 .xmind，上传后生成完整功能用例预览</p>
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
          {workflow.error ? (
            <div className="xmind-dropzone__error" role="alert">
              <span>{workflow.error}</span>
              {workflow.error.includes('LLM API Key') ? (
                <Button type="link" onClick={() => navigate('/settings?tab=ai')}>前往 AI 设置</Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {workflow.status === 'uploading' ? (
        <div className="xmind-uploading" aria-live="polite">
          <div className="xmind-stage-heading">
            <div className="xmind-stage-heading__icon" aria-hidden="true"><FileOutlined /></div>
            <div><span>正在上传文件</span><h2>{workflow.fileName}</h2></div>
          </div>
          <Progress percent={workflow.progress} status="active" strokeColor="#1677ff" />
          <Button aria-label="取消上传" icon={<CloseOutlined />} onClick={resetWorkflow}>取消上传</Button>
        </div>
      ) : null}

      {workflow.status === 'generating' ? (
        <div className="xmind-uploading" aria-live="polite">
          <div className="xmind-stage-heading">
            <div className="xmind-stage-heading__icon" aria-hidden="true"><ApartmentOutlined /></div>
            <div><span>正在生成完整功能用例</span><h2>{workflow.fileName}</h2></div>
          </div>
          <Spin size="large" aria-label="正在生成" />
          <p className="xmind-generating-note">所有节点分组成功后才会展示预览。</p>
          <Button aria-label="取消生成" icon={<CloseOutlined />} onClick={resetWorkflow}>取消生成</Button>
        </div>
      ) : null}

      {workflow.status === 'preview' ? (
        <div className="xmind-preview">
          <div className="xmind-preview__header">
            <div>
              <span className="xmind-eyebrow">文件：{workflow.fileName}</span>
              <h2>解析预览</h2>
              <p>已完成全部节点分组生成，请确认目录映射后保存正式功能用例。</p>
            </div>
            <div className="xmind-preview__actions">
              <Button icon={<DownloadOutlined />} onClick={() => void exportPreview()}>导出 XLSX</Button>
              <Button
                aria-label="开始完整解析"
                type="primary"
                icon={<SaveOutlined />}
                loading={confirming}
                onClick={() => void confirmPreview()}
              >
                确认并生成用例
              </Button>
            </div>
          </div>
          {workflow.error ? <Alert type="error" showIcon message={workflow.error} /> : null}
          <div className="xmind-preview__grid">
            <section className="xmind-preview-panel" aria-labelledby="xmind-tree-title">
              <header><h3 id="xmind-tree-title">XMind 树</h3><span>{countNodes(workflow.result.tree)} 个节点</span></header>
              <div className="xmind-tree" role="tree" aria-label="XMind 树">
                {workflow.result.tree.map((node, index) => renderTreeNode(node, 1, String(index)))}
              </div>
            </section>
            <section className="xmind-preview-panel" aria-labelledby="xmind-mapping-title">
              <header><h3 id="xmind-mapping-title">模块映射</h3><span>{workflow.result.cases.length} 条用例</span></header>
              <div className="xmind-mapping-list">
                {previewDirectories(workflow.result.cases).map((directory) => (
                  <div className="xmind-mapping" key={directory}>
                    <span className="xmind-mapping__label">用例目录</span>
                    <strong>目录路径：{directory.replaceAll('/', ' / ')}</strong>
                    <Select
                      aria-label={`选择 ${directory} 目标模块`}
                      value={workflow.moduleMapping[directory] || undefined}
                      placeholder="选择目标模块"
                      options={flatModules.map((module) => ({ value: module.id, label: module.label }))}
                      onChange={(value) => updateMapping(directory, value)}
                    />
                  </div>
                ))}
              </div>
            </section>
          </div>
          <section className="xmind-case-preview" aria-labelledby="xmind-case-title">
            <header><h3 id="xmind-case-title">功能用例预览</h3><span>{workflow.result.cases.length} 条</span></header>
            <div className="xmind-case-preview__table-wrap">
              <table><thead><tr><th>用例目录</th><th>用例名称</th><th>用例等级</th><th>用例步骤</th><th>预期结果</th></tr></thead>
                <tbody>{workflow.result.cases.map((item, index) => <tr key={`${item.用例名称}-${index}`}><td>{item.用例目录}</td><td>{item.用例名称}</td><td>{item.用例等级}</td><td>{item.用例步骤}</td><td>{item.预期结果}</td></tr>)}</tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {workflow.status === 'complete' ? (
        <div className="xmind-complete" aria-live="polite">
          <CheckCircleFilled className="xmind-complete__icon" aria-hidden="true" />
          <span className="xmind-eyebrow">功能用例生成完成</span>
          <h2>已生成 {workflow.generatedCount} 条测试用例</h2>
          <p>{workflow.fileName} 的节点已完成目录映射并保存到用例库。</p>
          <div className="xmind-complete__actions">
            <Button aria-label="查看功能用例" type="primary" icon={<ArrowRightOutlined />} iconPlacement="end" onClick={() => navigate('/test-cases/functional')}>查看功能用例</Button>
            <Button aria-label="重新上传" icon={<ReloadOutlined />} onClick={resetWorkflow}>重新上传</Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
