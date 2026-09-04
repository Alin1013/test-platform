/**
 * AI 异常分析工作台：统一处理粘贴文本、截图、日志文件与执行失败上下文。
 * 页面只负责交互和结构化展示，内容截取、脱敏、模型调用与历史隔离由后端完成。
 */
import {
  CloseOutlined,
  CopyOutlined,
  DislikeOutlined,
  FileImageOutlined,
  FileTextOutlined,
  LikeOutlined,
  ReloadOutlined,
  RobotOutlined,
  UploadOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App as AntdApp,
  Button,
  Collapse,
  Descriptions,
  Empty,
  Input,
  Segmented,
  Space,
  Tag,
  Typography,
  Upload,
} from 'antd';
import type { UploadFile } from 'antd';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClipboardEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { usePlatformService } from '../../services/PlatformServiceContext';
import type {
  AnomalyAnalysisResult,
  AnomalyContext,
  AnomalyFileAnalysisInput,
} from '../../services/contracts';
import './exception-analysis.css';

const { Text, Title } = Typography;
const MAX_TEXT_LENGTH = 100_000;
const MAX_PASTED_IMAGE_BYTES = 10 * 1024 * 1024;
const PASTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

type InputMode = 'TEXT' | 'SCREENSHOT' | 'FILE';

interface ExceptionAnalysisNavigationState {
  sourceType?: 'EXECUTION';
  content?: string;
  context?: AnomalyContext;
}

const severityLabels: Record<AnomalyAnalysisResult['severity'], string> = {
  HIGH: '高',
  MEDIUM: '中',
  LOW: '低',
  UNKNOWN: '未知',
};

const severityColors: Record<AnomalyAnalysisResult['severity'], string> = {
  HIGH: 'error',
  MEDIUM: 'warning',
  LOW: 'success',
  UNKNOWN: 'default',
};

const sourceLabels: Record<AnomalyAnalysisResult['sourceType'], string> = {
  TEXT: '粘贴文本',
  LOG: '日志文件',
  SCREENSHOT: '截图',
  FILE: '文本文件',
  EXECUTION: '执行失败',
};

function getNavigationState(value: unknown): ExceptionAnalysisNavigationState {
  // history.state 可能来自外部链接，严格筛出可用字段避免把任意对象传给 API。
  if (!value || typeof value !== 'object') return {};
  const state = value as Record<string, unknown>;
  return {
    sourceType: state.sourceType === 'EXECUTION' ? 'EXECUTION' : undefined,
    content: typeof state.content === 'string' ? state.content : undefined,
    context: state.context && typeof state.context === 'object'
      ? state.context as AnomalyContext
      : undefined,
  };
}

function formatResult(result: AnomalyAnalysisResult): string {
  // 复制内容采用稳定的纯文本结构，便于直接粘贴到 Bug 描述或群消息中。
  const sections = [
    `异常摘要\n${result.summary}`,
    `异常类型\n${result.category}`,
    `严重程度\n${severityLabels[result.severity]}`,
    `可能原因\n${result.possibleCauses.map((item, index) => `${index + 1}. ${item.cause}（${severityLabels[item.level]}）\n   依据：${item.evidence}`).join('\n') || '暂无'}`,
    `分析依据\n${result.analysisBasis.map((item, index) => `${index + 1}. ${item}`).join('\n') || '暂无'}`,
    `建议排查\n${result.suggestions.map((item, index) => `${index + 1}. ${item}`).join('\n') || '暂无'}`,
    `解决提示\n${result.solutions.map((item, index) => `${index + 1}. ${item}`).join('\n') || '暂无'}`,
    `验证方式\n${result.verification.map((item, index) => `${index + 1}. ${item}`).join('\n') || '暂无'}`,
  ];
  if (result.requiredInformation.length) {
    sections.push(`还需补充\n${result.requiredInformation.map((item, index) => `${index + 1}. ${item}`).join('\n')}`);
  }
  return sections.join('\n\n');
}

function ContextSummary({ context }: { context?: AnomalyContext }) {
  /** 展示从执行页带入的关键上下文，不在这里展示完整日志以保持页面可扫描。 */
  if (!context || Object.values(context).every((value) => value == null || value === '')) return null;
  const items = [
    ['项目', context.project ?? context.projectId],
    ['测试用例', context.testCase ?? context.testCaseId],
    ['环境', context.environment],
    ['执行步骤', context.step],
    ['预期结果', context.expected],
    ['实际结果', context.actual],
  ].filter(([, value]) => value != null && value !== '');
  return (
    <div className="anomaly-context" aria-label="已带入的测试上下文">
      <div className="anomaly-section-heading">
        <div>
          <Text type="secondary">测试执行上下文</Text>
          <span className="anomaly-context__hint">已从执行结果带入，可在补充说明中继续完善</span>
        </div>
      </div>
      <Descriptions size="small" column={{ xs: 1, sm: 2, lg: 3 }} items={items.map(([label, value]) => ({
        key: label,
        label,
        children: String(value),
      }))} />
    </div>
  );
}

function ResultPanel({
  result,
  onCopy,
  onReset,
  onContinue,
  onFeedback,
}: {
  result: AnomalyAnalysisResult;
  onCopy: () => void;
  onReset: () => void;
  onContinue: () => void;
  onFeedback: (helpful: boolean) => void;
}) {
  /** 结构化展示模型结果，避免用户需要从大段 Markdown 中提取排查结论。 */
  const hasHighRisk = result.risk === 'HIGH';
  return (
    <section className="anomaly-result" aria-labelledby="anomaly-result-title">
      <div className="anomaly-result__header">
        <div>
          <Text type="secondary">分析结果 · {sourceLabels[result.sourceType]}</Text>
          <Title level={2} id="anomaly-result-title">{result.summary}</Title>
        </div>
        <Space wrap>
          <Tag color={severityColors[result.severity]}>严重程度：{severityLabels[result.severity]}</Tag>
          <Tag>{result.category}</Tag>
          {hasHighRisk ? <Tag color="error" icon={<WarningOutlined />}>高风险建议</Tag> : null}
        </Space>
      </div>

      {hasHighRisk ? (
        <Alert
          type="warning"
          showIcon
          message="建议包含高风险操作"
          description="系统不会自动执行命令。请确认影响范围、权限和回滚方案后再人工处理。"
        />
      ) : null}

      <div className="anomaly-result__grid">
        <section className="anomaly-result__section">
          <h3>可能原因</h3>
          {result.possibleCauses.length ? (
            <Collapse
              items={result.possibleCauses.map((cause, index) => ({
                key: String(index),
                label: <span><strong>{index + 1}. {cause.cause}</strong><Tag color={severityColors[cause.level]}>{severityLabels[cause.level]}</Tag></span>,
                children: <p className="anomaly-evidence">分析依据：{cause.evidence || '未提供明确证据'}</p>,
              }))}
            />
          ) : <Text type="secondary">模型未给出具体原因，请补充更多上下文。</Text>}
        </section>
        <section className="anomaly-result__section">
          <h3>分析依据</h3>
          {result.analysisBasis.length ? (
            <ul className="anomaly-plain-list">
              {result.analysisBasis.map((item) => <li key={item}>{item}</li>)}
            </ul>
          ) : <Text type="secondary">暂无明确依据</Text>}
        </section>
      </div>

      <div className="anomaly-result__grid">
        {[
          ['建议排查', result.suggestions],
          ['解决提示', result.solutions],
          ['验证方式', result.verification],
        ].map(([title, items]) => (
          <section className="anomaly-result__section" key={title as string}>
            <h3>{title as string}</h3>
            {(items as string[]).length ? (
              <ol className="anomaly-plain-list anomaly-plain-list--numbered">
                {(items as string[]).map((item, index) => <li key={`${title}-${item}`}><span className="anomaly-number">{index + 1}</span>{item}</li>)}
              </ol>
            ) : <Text type="secondary">暂无建议</Text>}
          </section>
        ))}
      </div>

      {result.requiredInformation.length ? (
        <Alert
          type="info"
          showIcon
          message="当前信息不足以判断具体原因"
          description={<ul>{result.requiredInformation.map((item) => <li key={item}>{item}</li>)}</ul>}
        />
      ) : null}

      <div className="anomaly-result__footer">
        <Space wrap>
          <Button icon={<CopyOutlined />} onClick={onCopy}>复制结果</Button>
          <Button icon={<ReloadOutlined />} onClick={onReset}>重新分析</Button>
          <Button type="link" onClick={onContinue}>补充信息继续分析</Button>
        </Space>
        <Space>
          <Text type="secondary">这个分析结果有帮助吗？</Text>
          <Button type={result.helpful === true ? 'primary' : 'text'} icon={<LikeOutlined />} aria-label="分析结果有帮助" onClick={() => onFeedback(true)} />
          <Button type={result.helpful === false ? 'primary' : 'text'} icon={<DislikeOutlined />} aria-label="分析结果没有帮助" onClick={() => onFeedback(false)} />
        </Space>
      </div>
    </section>
  );
}

export function ExceptionAnalysisPage() {
  // 页面状态与服务调用解耦，便于在真实 API 与内存 Mock 间切换。
  const service = usePlatformService();
  const { message } = AntdApp.useApp();
  const location = useLocation();
  const navigationState = useMemo(() => getNavigationState(location.state), [location.state]);
  const [mode, setMode] = useState<InputMode>('TEXT');
  const [content, setContent] = useState(navigationState.content ?? '');
  const [description, setDescription] = useState('');
  const [context, setContext] = useState<AnomalyContext | undefined>(navigationState.context);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [pastedImage, setPastedImage] = useState<File>();
  const [pastedImagePreview, setPastedImagePreview] = useState<string>();
  const [result, setResult] = useState<AnomalyAnalysisResult>();
  const [history, setHistory] = useState<AnomalyAnalysisResult[]>([]);
  const [loading, setLoading] = useState(false);
  const descriptionRef = useRef<TextAreaRef>(null);

  useEffect(() => {
    // 进入页面立即读取历史，失败时保留输入能力并仅提示一次。
    void service.listAnomalyHistory().then((response) => setHistory(response.items)).catch(() => undefined);
  }, [service]);

  useEffect(() => {
    // 执行页带入上下文后默认聚焦文本模式，用户仍可改为上传证据。
    if (navigationState.content || navigationState.context) {
      setMode('TEXT');
      setContent(navigationState.content ?? '');
      setContext(navigationState.context);
      setResult(undefined);
    }
  }, [navigationState]);

  useEffect(() => {
    // 剪贴板截图使用 object URL 预览；每次替换或离开页面都要释放，避免长时间操作累积内存。
    if (!pastedImage) {
      setPastedImagePreview(undefined);
      return undefined;
    }
    const previewUrl = URL.createObjectURL(pastedImage);
    setPastedImagePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [pastedImage]);

  const canAnalyze = mode === 'TEXT'
    ? Boolean(content.trim() || context || pastedImage)
    : fileList.length > 0;

  const handleTextPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    // 微信/钉钉截图会以 image/* 剪贴板条目提供；只拦截图片，普通文字仍走浏览器默认粘贴。
    const imageItem = Array.from(event.clipboardData.items).find(
      (item) => item.kind === 'file' && PASTED_IMAGE_TYPES.has(item.type),
    );
    if (!imageItem) return;
    const image = imageItem.getAsFile();
    if (!image) return;
    event.preventDefault();
    if (image.size > MAX_PASTED_IMAGE_BYTES) {
      message.warning('粘贴的截图超过 10 MB 限制，请压缩后重试');
      return;
    }
    const file = image.name
      ? image
      : new File([image], `pasted-screenshot-${Date.now()}.png`, { type: image.type });
    setPastedImage(file);
    setFileList([]);
    message.success('截图已粘贴，可与文本一起分析');
  };

  const resetInput = () => {
    // 清空证据但保留执行上下文，方便用户在同一失败记录上重新补充分析。
    setResult(undefined);
    setContent('');
    setDescription('');
    setFileList([]);
    setPastedImage(undefined);
  };

  const analyze = async () => {
    if (!canAnalyze || loading) return;
    setLoading(true);
    try {
      // 图片粘贴时沿用上传接口，并把文本框内容压缩到补充说明上限内一起提交。
      const pastedText = pastedImage && content.trim()
        ? `粘贴文本：\n${content.trim().slice(0, 4_000)}`
        : '';
      const next = mode === 'TEXT' && !pastedImage
        ? await service.analyzeAnomaly({
            sourceType: navigationState.sourceType ?? 'TEXT',
            content: content.slice(0, MAX_TEXT_LENGTH),
            context,
            additionalDescription: description,
          })
        : await service.analyzeAnomalyFile({
            file: pastedImage ?? fileList[0].originFileObj as File,
            sourceType: pastedImage || mode === 'SCREENSHOT' ? 'SCREENSHOT' : 'FILE',
            context,
            additionalDescription: [description.trim(), pastedText].filter(Boolean).join('\n\n'),
          } satisfies AnomalyFileAnalysisInput);
      setResult(next);
      setHistory((current) => [next, ...current.filter((item) => item.analysisId !== next.analysisId)]);
      message.success('异常分析已完成');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '异常分析失败');
    } finally {
      setLoading(false);
    }
  };

  const copyResult = async () => {
    if (!result) return;
    await navigator.clipboard?.writeText(formatResult(result));
    message.success('分析结果已复制');
  };

  const continueAnalysis = () => {
    // 把焦点放回补充说明，用户可直接输入新证据后再次提交。
    descriptionRef.current?.focus();
  };

  const feedback = async (helpful: boolean) => {
    if (!result) return;
    try {
      const updated = await service.feedbackAnomaly(result.analysisId, helpful);
      setResult(updated);
      setHistory((current) => current.map((item) => item.analysisId === updated.analysisId ? updated : item));
      message.success('感谢反馈');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '反馈保存失败');
    }
  };

  return (
    <section className="page-section exception-analysis-page">
      <PageHeader title="异常分析" description="把测试失败证据整理成可执行的排查方向" />

      <section className="anomaly-workspace" aria-labelledby="anomaly-input-title">
        <div className="anomaly-section-heading">
          <div>
            <Title level={2} id="anomaly-input-title">开始一次分析</Title>
            <Text type="secondary">支持日志、接口响应、错误信息、截图和常见文本文件</Text>
          </div>
          <RobotOutlined className="anomaly-workspace__icon" aria-hidden="true" />
        </div>

        <Segmented
          className="anomaly-mode-switch"
          value={mode}
          onChange={(value) => {
            setMode(value as InputMode);
            setFileList([]);
            setPastedImage(undefined);
          }}
          options={[
            { label: '粘贴文本', value: 'TEXT', icon: <FileTextOutlined /> },
            { label: '上传截图', value: 'SCREENSHOT', icon: <FileImageOutlined /> },
            { label: '上传文件', value: 'FILE', icon: <UploadOutlined /> },
          ]}
        />

        {mode === 'TEXT' ? (
          <>
            <Input.TextArea
              className="anomaly-content-input"
              aria-label="异常内容"
              value={content}
              onChange={(event) => setContent(event.target.value.slice(0, MAX_TEXT_LENGTH))}
              placeholder="请粘贴日志、报错信息、接口请求或响应内容"
              autoSize={{ minRows: 9, maxRows: 18 }}
              showCount
              maxLength={MAX_TEXT_LENGTH}
              onPaste={handleTextPaste}
            />
            {pastedImage ? (
              <div className="anomaly-pasted-image" aria-label="已粘贴截图预览">
                {pastedImagePreview ? <img src={pastedImagePreview} alt="已粘贴截图预览" /> : null}
                <div className="anomaly-pasted-image__meta">
                  <Text>截图已粘贴{content.trim() ? '，文本会作为补充说明' : ''}</Text>
                  <Button
                    type="text"
                    icon={<CloseOutlined />}
                    aria-label="移除已粘贴截图"
                    title="移除截图"
                    onClick={() => setPastedImage(undefined)}
                  />
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <Upload.Dragger
            className="anomaly-upload"
            accept={mode === 'SCREENSHOT' ? 'image/png,image/jpeg,image/webp,image/gif' : '.txt,.log,.json,.xml,.yaml,.yml'}
            maxCount={1}
            fileList={fileList}
            beforeUpload={() => false}
            onChange={({ fileList: next }) => setFileList(next)}
            onRemove={() => setFileList([])}
          >
            <p className="ant-upload-drag-icon"><UploadOutlined /></p>
            <p className="ant-upload-text">点击或拖拽文件到这里</p>
            <p className="ant-upload-hint">{mode === 'SCREENSHOT' ? '支持 PNG、JPEG、WebP、GIF，最大 10 MB' : '支持 txt、log、json、xml、yaml，最大 5 MB'}</p>
          </Upload.Dragger>
        )}

        <ContextSummary context={context} />
        <label className="anomaly-description">
          <span>补充说明</span>
          <Input.TextArea
            ref={descriptionRef}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="例如：执行订单创建接口测试时出现异常"
            autoSize={{ minRows: 2, maxRows: 5 }}
            maxLength={4_000}
            showCount
          />
        </label>
        <div className="anomaly-input-footer">
          <Text type="secondary">发送前会自动遮盖 Token、Cookie、密码和常见个人敏感信息</Text>
          <Space>
            <Button onClick={resetInput} disabled={!content && !fileList.length && !description}>清空</Button>
            <Button type="primary" icon={<RobotOutlined />} loading={loading} disabled={!canAnalyze} onClick={() => void analyze()}>开始分析</Button>
          </Space>
        </div>
      </section>

      {result ? (
        <ResultPanel
          result={result}
          onCopy={() => void copyResult()}
          onReset={() => { setResult(undefined); setMode('TEXT'); }}
          onContinue={continueAnalysis}
          onFeedback={(helpful) => void feedback(helpful)}
        />
      ) : null}

      <section className="anomaly-history" aria-labelledby="anomaly-history-title">
        <div className="anomaly-section-heading">
          <div>
            <Title level={2} id="anomaly-history-title">分析历史</Title>
            <Text type="secondary">仅展示当前登录用户创建的记录</Text>
          </div>
        </div>
        {history.length ? (
          <div className="anomaly-history-list">
            {history.map((item) => (
              <div className="anomaly-history-item" key={item.analysisId}>
                <RobotOutlined className="anomaly-history__icon" aria-hidden="true" />
                <div className="anomaly-history-item__body">
                  <div className="anomaly-history-item__title">
                    <strong>{item.summary}</strong>
                    <Tag color={severityColors[item.severity]}>{severityLabels[item.severity]}</Tag>
                  </div>
                  <Text type="secondary">{sourceLabels[item.sourceType]} · {new Date(item.createdAt).toLocaleString('zh-CN')}</Text>
                </div>
                <Button type="link" onClick={() => setResult(item)}>查看结果</Button>
              </div>
            ))}
          </div>
        ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无分析记录" />}
      </section>
    </section>
  );
}
