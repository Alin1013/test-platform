import {
  ApartmentOutlined,
  ArrowRightOutlined,
  CheckCircleFilled,
  CloseOutlined,
  CloudUploadOutlined,
  FileOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { Button, Progress } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import './xmind.css';

type WorkflowState =
  | { status: 'idle'; error?: string }
  | { status: 'uploading'; fileName: string; progress: number }
  | { status: 'preview'; fileName: string }
  | { status: 'complete'; fileName: string; generatedCount: number };

const initialState: WorkflowState = { status: 'idle' };

export function XMindPage() {
  const navigate = useNavigate();
  const [workflow, setWorkflow] = useState<WorkflowState>(initialState);
  const uploadTimer = useRef<number | null>(null);

  const clearUploadTimer = useCallback(() => {
    if (uploadTimer.current !== null) {
      window.clearInterval(uploadTimer.current);
      uploadTimer.current = null;
    }
  }, []);

  useEffect(() => clearUploadTimer, [clearUploadTimer]);

  const startUpload = (file: File) => {
    clearUploadTimer();

    if (!file.name.toLowerCase().endsWith('.xmind')) {
      setWorkflow({ status: 'idle', error: '仅支持 .xmind 文件' });
      return;
    }

    setWorkflow({ status: 'uploading', fileName: file.name, progress: 8 });

    let progress = 8;
    const tickDelay = window.navigator.userAgent.includes('jsdom') ? 1 : 140;
    uploadTimer.current = window.setInterval(() => {
      progress = Math.min(progress + 16, 100);

      if (progress === 100) {
        clearUploadTimer();
        setWorkflow({ status: 'preview', fileName: file.name });
        return;
      }

      setWorkflow({ status: 'uploading', fileName: file.name, progress });
    }, tickDelay);
  };

  const resetWorkflow = () => {
    clearUploadTimer();
    setWorkflow(initialState);
  };

  return (
    <section className="page-section xmind-page">
      <PageHeader title="XMind 转换器" description="将思维导图节点解析为结构化测试用例" />

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
          <div className="xmind-dropzone__icon" aria-hidden="true">
            <CloudUploadOutlined />
          </div>
          <h2>拖拽 XMind 文件到此处</h2>
          <p>支持文件扩展名 .xmind，上传后先展示解析预览</p>
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
            <p className="xmind-dropzone__error" role="alert">
              {workflow.error}
            </p>
          ) : null}
        </div>
      ) : null}

      {workflow.status === 'uploading' ? (
        <div className="xmind-uploading" aria-live="polite">
          <div className="xmind-stage-heading">
            <div className="xmind-stage-heading__icon" aria-hidden="true">
              <FileOutlined />
            </div>
            <div>
              <span>正在上传并读取</span>
              <h2>{workflow.fileName}</h2>
            </div>
          </div>
          <Progress percent={workflow.progress} status="active" strokeColor="#1677ff" />
          <Button aria-label="取消上传" icon={<CloseOutlined />} onClick={resetWorkflow}>
            取消上传
          </Button>
        </div>
      ) : null}

      {workflow.status === 'preview' ? (
        <div className="xmind-preview">
          <div className="xmind-preview__header">
            <div>
              <span className="xmind-eyebrow">文件：{workflow.fileName}</span>
              <h2>解析预览</h2>
              <p>当前结果为解析预览，请确认节点与目标模块映射后开始完整解析。</p>
            </div>
            <Button
              aria-label="开始完整解析"
              type="primary"
              icon={<ApartmentOutlined />}
              onClick={() =>
                setWorkflow({
                  status: 'complete',
                  fileName: workflow.fileName,
                  generatedCount: 6,
                })
              }
            >
              开始完整解析
            </Button>
          </div>

          <div className="xmind-preview__grid">
            <section className="xmind-preview-panel" aria-labelledby="xmind-tree-title">
              <header>
                <h3 id="xmind-tree-title">XMind 树</h3>
                <span>3 个节点</span>
              </header>
              <div className="xmind-tree" role="tree" aria-label="XMind 树">
                <div className="xmind-tree__root" role="treeitem" aria-level={1} aria-expanded="true">
                  <span className="xmind-tree__node" aria-hidden="true" />
                  登录
                </div>
                <div className="xmind-tree__children" role="group">
                  <div role="treeitem" aria-level={2}>
                    <span className="xmind-tree__leaf" aria-hidden="true" />
                    成功登录
                  </div>
                  <div role="treeitem" aria-level={2}>
                    <span className="xmind-tree__leaf" aria-hidden="true" />
                    登录失败
                  </div>
                </div>
              </div>
            </section>

            <section className="xmind-preview-panel" aria-labelledby="xmind-mapping-title">
              <header>
                <h3 id="xmind-mapping-title">模块映射</h3>
                <span>自动匹配</span>
              </header>
              <div className="xmind-mapping">
                <span className="xmind-mapping__label">目标模块</span>
                <strong>核心模块 / 鉴权</strong>
                <p>登录主题及其分支将生成接口测试用例。</p>
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {workflow.status === 'complete' ? (
        <div className="xmind-complete" aria-live="polite">
          <CheckCircleFilled className="xmind-complete__icon" aria-hidden="true" />
          <span className="xmind-eyebrow">完整解析完成</span>
          <h2>已生成 {workflow.generatedCount} 条测试用例</h2>
          <p>{workflow.fileName} 的节点已映射到核心模块 / 鉴权。</p>
          <div className="xmind-complete__actions">
            <Button
              aria-label="查看接口用例"
              type="primary"
              icon={<ArrowRightOutlined />}
              iconPlacement="end"
              onClick={() => navigate('/test-cases/api')}
            >
              查看接口用例
            </Button>
            <Button aria-label="重新上传" icon={<ReloadOutlined />} onClick={resetWorkflow}>
              重新上传
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
