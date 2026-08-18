/**
 * 用例详情弹窗：展示并编辑单条用例的全部字段，并提供确认通过 / 取消确认 / 删除操作。
 * 底部按钮始终可点击：允许在已通过时再次确认（幂等）、在未通过时取消确认（回到待审核）。
 * 用例目录（XMind 解析时的归属目录）不在此处展示/编辑，由解析器与任务预览固化。
 */
import { CheckCircleOutlined, CloseCircleOutlined, DeleteOutlined, SaveOutlined } from '@ant-design/icons';
import { App, Button, Input, Modal, Select, Tag } from 'antd';
import { useEffect, useState } from 'react';
import { usePlatformService } from '../../services/PlatformServiceContext';
import type {
  XMindCaseReviewStatus,
  XMindGeneratedCase,
  XMindTaskDetail,
} from '../../services/contracts';

/** 详情弹窗可编辑的字段草稿（用例目录由解析器固化，不在此处编辑）。 */
interface CaseDraft {
  用例名称: string;
  需求ID: string;
  前置条件: string;
  用例等级: string;
  归属迭代: string;
  用例步骤: string;
  预期结果: string;
}

const PRIORITY_OPTIONS = ['P0', 'P1', 'P2', 'P3'];

const reviewStatusMeta: Record<XMindCaseReviewStatus, { color: string; label: string }> = {
  pending: { color: 'default', label: '待审核' },
  passed: { color: 'success', label: '已通过' },
  needs_modification: { color: 'warning', label: '待修改' },
};

interface XMindCaseDetailModalProps {
  taskId: number;
  caseItem: XMindGeneratedCase;
  /** 审核字段变更后回传刷新后的任务详情。 */
  onUpdated: (detail: XMindTaskDetail) => void;
  onClosed: () => void;
}

function buildDraft(caseItem: XMindGeneratedCase): CaseDraft {
  // 用当前用例字段初始化编辑草稿，字段缺失时给合理默认值；用例目录不在草稿中。
  return {
    用例名称: caseItem.用例名称 ?? '',
    需求ID: caseItem.需求ID ?? '',
    前置条件: caseItem.前置条件 ?? '',
    用例等级: caseItem.用例等级 ?? 'P2',
    归属迭代: caseItem.归属迭代 ?? '',
    用例步骤: caseItem.用例步骤 ?? '',
    预期结果: caseItem.预期结果 ?? '',
  };
}

export function XMindCaseDetailModal({
  taskId,
  caseItem,
  onUpdated,
  onClosed,
}: XMindCaseDetailModalProps) {
  const service = usePlatformService();
  const { message } = App.useApp();
  const [draft, setDraft] = useState<CaseDraft>(() => buildDraft(caseItem));
  const [saving, setSaving] = useState(false);
  // 用例状态跟随用例本身，弹窗内仅作展示。
  const status = (caseItem.reviewStatus ?? 'pending') as XMindCaseReviewStatus;

  // 切换用例时以最新字段重建草稿。
  useEffect(() => {
    setDraft(buildDraft(caseItem));
  }, [caseItem]);

  const updateField = <Key extends keyof CaseDraft>(key: Key, value: CaseDraft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const persistDraft = async (reviewStatus?: XMindCaseReviewStatus) => {
    // 把编辑草稿与（可选的）审核状态一并提交到后端；用例目录由解析器固化，原样回传避免被清空。
    setSaving(true);
    try {
      const detail = await service.updateXMindTaskCase(taskId, caseItem.tempId ?? '', {
        ...draft,
        用例目录: caseItem.用例目录 ?? '',
        ...(reviewStatus ? { reviewStatus } : {}),
      });
      onUpdated(detail);
      return detail;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    await persistDraft();
    message.success('已保存用例修改');
  };

  const handleConfirm = async () => {
    await persistDraft('passed');
    message.success('已确认通过该用例');
    onClosed();
  };

  const handleCancelConfirm = async () => {
    // 取消确认：把审核状态回退为待审核，保留字段编辑。
    setSaving(true);
    try {
      const detail = await service.updateXMindTaskCase(taskId, caseItem.tempId ?? '', { reviewStatus: 'pending' });
      onUpdated(detail);
      message.info('已取消确认，用例回到待审核');
      onClosed();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Modal.confirm({
      title: '删除用例',
      content: `确认删除用例「${caseItem.用例名称}」吗？删除后无法恢复。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          const detail = await service.deleteXMindTaskCase(taskId, caseItem.tempId ?? '');
          onUpdated(detail);
          message.success('已删除用例');
          onClosed();
        } catch (reason: unknown) {
          message.error(reason instanceof Error ? reason.message : '删除用例失败');
        }
      },
    });
  };

  return (
    <Modal
      title={`用例详情：${caseItem.用例名称}`}
      open
      width={720}
      footer={[
        <Button key="close" onClick={onClosed}>关闭</Button>,
        <Button
          key="delete"
          danger
          icon={<DeleteOutlined aria-hidden="true" />}
          onClick={handleDelete}
        >
          删除
        </Button>,
        <Button
          key="cancel-confirm"
          icon={<CloseCircleOutlined aria-hidden="true" />}
          // 始终可点击：未通过时调用为幂等（pending→pending），通过后回退为待审核。
          onClick={handleCancelConfirm}
        >
          取消确认
        </Button>,
        <Button key="save" icon={<SaveOutlined aria-hidden="true" />} loading={saving} onClick={handleSave}>
          保存修改
        </Button>,
        <Button
          key="confirm"
          type="primary"
          icon={<CheckCircleOutlined aria-hidden="true" />}
          loading={saving}
          // 始终可点击：已通过时再确认为幂等（passed→passed）。
          onClick={handleConfirm}
        >
          确认
        </Button>,
      ]}
      onCancel={onClosed}
    >
      <div className="xmind-case-detail">
        <div className="xmind-case-detail__status">
          <span>当前审核状态：</span>
          <Tag color={reviewStatusMeta[status].color}>{reviewStatusMeta[status].label}</Tag>
        </div>
        <div className="xmind-case-detail__grid">
          <label className="xmind-case-detail__field">
            <span>用例名称</span>
            <Input value={draft.用例名称} onChange={(event) => updateField('用例名称', event.target.value)} />
          </label>
          <label className="xmind-case-detail__field">
            <span>需求ID</span>
            <Input value={draft.需求ID} onChange={(event) => updateField('需求ID', event.target.value)} />
          </label>
          <label className="xmind-case-detail__field">
            <span>用例等级</span>
            <Select
              value={draft.用例等级}
              options={PRIORITY_OPTIONS.map((priority) => ({ value: priority, label: priority }))}
              onChange={(value) => updateField('用例等级', value)}
            />
          </label>
          <label className="xmind-case-detail__field xmind-case-detail__field--wide">
            <span>前置条件</span>
            <Input.TextArea
              rows={2}
              value={draft.前置条件}
              onChange={(event) => updateField('前置条件', event.target.value)}
            />
          </label>
          <label className="xmind-case-detail__field">
            <span>归属迭代</span>
            <Input value={draft.归属迭代} onChange={(event) => updateField('归属迭代', event.target.value)} />
          </label>
          <label className="xmind-case-detail__field xmind-case-detail__field--wide">
            <span>用例步骤</span>
            <Input.TextArea
              rows={4}
              value={draft.用例步骤}
              onChange={(event) => updateField('用例步骤', event.target.value)}
            />
          </label>
          <label className="xmind-case-detail__field xmind-case-detail__field--wide">
            <span>预期结果</span>
            <Input.TextArea
              rows={3}
              value={draft.预期结果}
              onChange={(event) => updateField('预期结果', event.target.value)}
            />
          </label>
        </div>
      </div>
    </Modal>
  );
}
