/**
 * 用例审核视图：把待审核任务的所有生成用例放入同一个分页列表。
 * 支持逐条确认通过 / 取消确认 / 删除、跨页勾选，以及表头全选当前页后批量操作。
 * 所有通过用例统一合并到一个目标模块，点击行可打开详情弹窗。
 */
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  MergeCellsOutlined,
} from '@ant-design/icons';
import { App, Button, Empty, Select, Space, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { AppPagination, PAGINATION_PAGE_SIZE_OPTIONS } from '../../components/common';
import { usePlatformService } from '../../services/PlatformServiceContext';
import type {
  TestModule,
  XMindCaseReviewStatus,
  XMindGeneratedCase,
  XMindTaskDetail,
} from '../../services/contracts';
import { flattenModules, type FlatModule } from './XMindPage';
import { XMindCaseDetailModal } from './XMindCaseDetailModal';

const reviewStatusMeta: Record<XMindCaseReviewStatus, { color: string; label: string }> = {
  pending: { color: 'default', label: '待审核' },
  passed: { color: 'success', label: '已通过' },
  needs_modification: { color: 'warning', label: '待修改' },
};

interface XMindReviewViewProps {
  task: XMindTaskDetail;
  modules: TestModule[];
  /** 审核字段变更后回传刷新后的任务详情（由父页面维护选中任务状态）。 */
  onTaskChange: (detail: XMindTaskDetail) => void;
}

export function XMindReviewView({ task, modules, onTaskChange }: XMindReviewViewProps) {
  const service = usePlatformService();
  const { message, modal } = App.useApp();
  const flatModules = useMemo<FlatModule[]>(() => flattenModules(modules), [modules]);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGINATION_PAGE_SIZE_OPTIONS[0]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [modalCase, setModalCase] = useState<XMindGeneratedCase | null>(null);
  const [updatingCaseId, setUpdatingCaseId] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  // 合并目标模块：整任务共用一个，所有通过的用例统一入库到该模块。
  const [targetModuleId, setTargetModuleId] = useState<string>('');

  // 目录仅作为用例自身字段保留，审核列表不再按目录拆分。
  const currentCases = task.cases;
  const totalPages = Math.max(1, Math.ceil(currentCases.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedCases = currentCases.slice((safePage - 1) * pageSize, safePage * pageSize);
  const currentPageKeys = pagedCases.flatMap((item) => (item.tempId ? [item.tempId] : []));
  const passedCount = task.cases.filter((item) => item.reviewStatus === 'passed').length;
  const hasTargetModule = Boolean(targetModuleId);

  useEffect(() => {
    // 删除当前页最后一条用例后收敛到仍然存在的页，避免出现空白表格。
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  useEffect(() => {
    // 父页面切换审核任务时从第一页开始，避免沿用上一任务的页码。
    setPage(1);
    setSelectedKeys([]);
  }, [task.id]);

  const setCaseSelected = (caseItem: XMindGeneratedCase, selected: boolean) => {
    // 单行选择跨页保留，批量操作始终以 selectedKeys 中的稳定 tempId 为准。
    const key = caseItem.tempId;
    if (!key) return;
    setSelectedKeys((current) => {
      if (!selected) return current.filter((currentKey) => currentKey !== key);
      return current.includes(key) ? current : [...current, key];
    });
  };

  const setCurrentPageSelected = (selected: boolean) => {
    // 表头复选框只增删当前页键，不清除用户在其它页面已经勾选的用例。
    const pageKeySet = new Set(currentPageKeys);
    setSelectedKeys((current) => {
      if (!selected) return current.filter((key) => !pageKeySet.has(key));
      return [...new Set([...current, ...currentPageKeys])];
    });
  };

  const refreshDetail = async () => {
    // 批量/删除后统一重新拉取详情，保证列表与勾选状态一致。
    const detail = await service.getXMindTask(task.id);
    onTaskChange(detail);
  };

  const confirmCase = async (caseItem: XMindGeneratedCase) => {
    const caseId = caseItem.tempId;
    if (!caseId) {
      message.error('用例标识缺失，请刷新页面后重试');
      return;
    }
    setUpdatingCaseId(caseId);
    try {
      const detail = await service.updateXMindTaskCase(task.id, caseId, { reviewStatus: 'passed' });
      onTaskChange(detail);
      message.success('已确认通过该用例');
    } catch (reason: unknown) {
      message.error(reason instanceof Error ? reason.message : '确认用例失败');
    } finally {
      setUpdatingCaseId(null);
    }
  };

  const cancelConfirmCase = async (caseItem: XMindGeneratedCase) => {
    const caseId = caseItem.tempId;
    if (!caseId) {
      message.error('用例标识缺失，请刷新页面后重试');
      return;
    }
    setUpdatingCaseId(caseId);
    try {
      const detail = await service.updateXMindTaskCase(task.id, caseId, { reviewStatus: 'pending' });
      onTaskChange(detail);
      message.info('已取消确认，用例回到待审核状态');
    } catch (reason: unknown) {
      message.error(reason instanceof Error ? reason.message : '取消确认失败');
    } finally {
      setUpdatingCaseId(null);
    }
  };

  const deleteCase = (caseItem: XMindGeneratedCase) => {
    const caseId = caseItem.tempId;
    if (!caseId) {
      message.error('用例标识缺失，请刷新页面后重试');
      return;
    }
    // 使用应用级弹窗实例继承主题与交互上下文，避免静态弹窗脱离 App 容器。
    modal.confirm({
      title: '删除用例',
      content: `确认删除用例「${caseItem.用例名称}」吗？删除后无法恢复。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          const detail = await service.deleteXMindTaskCase(task.id, caseId);
          onTaskChange(detail);
          setSelectedKeys((keys) => keys.filter((key) => key !== caseId));
        } catch (reason: unknown) {
          message.error(reason instanceof Error ? reason.message : '删除用例失败');
        }
      },
    });
  };

  const batchConfirm = async () => {
    if (!selectedKeys.length) return;
    try {
      for (const key of selectedKeys) {
        const target = task.cases.find((item) => item.tempId === key);
        if (target && target.reviewStatus !== 'passed') {
          await service.updateXMindTaskCase(task.id, key, { reviewStatus: 'passed' });
        }
      }
      await refreshDetail();
      message.success(`已批量确认 ${selectedKeys.length} 条用例`);
      setSelectedKeys([]);
    } catch (reason: unknown) {
      message.error(reason instanceof Error ? reason.message : '批量确认失败');
    }
  };

  const batchDelete = async () => {
    if (!selectedKeys.length) return;
    modal.confirm({
      title: '批量删除用例',
      content: `确认删除选中的 ${selectedKeys.length} 条用例吗？删除后无法恢复。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          for (const key of selectedKeys) {
            await service.deleteXMindTaskCase(task.id, key);
          }
          await refreshDetail();
          message.success(`已批量删除 ${selectedKeys.length} 条用例`);
          setSelectedKeys([]);
        } catch (reason: unknown) {
          message.error(reason instanceof Error ? reason.message : '批量删除失败');
        }
      },
    });
  };

  const merge = async () => {
    if (passedCount === 0) {
      message.warning('请先确认至少一条用例后再合并');
      return;
    }
    if (!hasTargetModule) {
      message.warning('请选择目标模块后再合并');
      return;
    }
    setMerging(true);
    try {
      const result = await service.confirmXMindTask(task.id, { moduleId: targetModuleId });
      // confirmXMindTask 返回合并结果而非任务详情；任务已置为 COMPLETED，
      // 这里用最新模块拼出刷新后的任务详情回传父页面，并在弹窗中提示合并条数。
      onTaskChange({ ...task, status: 'COMPLETED', moduleMapping: {} });
      message.success(`已合并 ${result.saved_cases.length} 条通过用例到用例库`);
    } catch (reason: unknown) {
      message.error(reason instanceof Error ? reason.message : '合并用例失败');
    } finally {
      setMerging(false);
    }
  };

  const columns: ColumnsType<XMindGeneratedCase> = [
    { title: '用例名称', dataIndex: '用例名称', ellipsis: true },
    { title: '用例等级', dataIndex: '用例等级', width: 90, render: (value: string) => <Tag>{value || 'P2'}</Tag> },
    { title: '创建人', dataIndex: '创建人', width: 100 },
    {
      title: '审核状态',
      dataIndex: 'reviewStatus',
      width: 100,
      render: (value: XMindCaseReviewStatus) => {
        const meta = reviewStatusMeta[value ?? 'pending'];
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: '操作',
      width: 120,
      // 行内操作按钮阻止冒泡，避免触发整行点击打开弹窗；改用图标按钮节省列宽。
      render: (_, record) => (
        <Space size="small" onClick={(event) => event.stopPropagation()}>
          <Button
            size="small"
            type="primary"
            icon={<CheckCircleOutlined aria-hidden="true" />}
            aria-label={`确认通过 ${record.用例名称 ?? ''}`}
            title="确认通过"
            disabled={record.reviewStatus === 'passed'}
            loading={updatingCaseId === record.tempId}
            onClick={() => void confirmCase(record)}
          />
          <Button
            size="small"
            icon={<CloseCircleOutlined aria-hidden="true" />}
            aria-label={`取消确认 ${record.用例名称 ?? ''}`}
            title="取消确认"
            disabled={record.reviewStatus !== 'passed'}
            loading={updatingCaseId === record.tempId}
            onClick={() => void cancelConfirmCase(record)}
          />
          <Button
            size="small"
            danger
            icon={<DeleteOutlined aria-hidden="true" />}
            aria-label={`删除 ${record.用例名称 ?? ''}`}
            title="删除"
            onClick={() => deleteCase(record)}
          />
        </Space>
      ),
    },
  ];

  return (
    <section className="xmind-review" aria-label="XMind 用例审核">
      <div className="xmind-review__header">
        <div>
          <span className="xmind-eyebrow">用例审核</span>
          <h2>审核生成用例</h2>
          <p>
            共 {task.cases.length} 条用例，已确认通过 {passedCount} 条。点击任意行查看详情并编辑。
          </p>
        </div>
        <Space size="middle">
          <Select
            aria-label="目标模块"
            value={targetModuleId || undefined}
            placeholder="选择目标模块"
            style={{ width: 240 }}
            options={flatModules.map((module) => ({ value: module.id, label: module.label }))}
            onChange={(value) => setTargetModuleId(value)}
          />
          <Button
            type="primary"
            icon={<MergeCellsOutlined aria-hidden="true" />}
            loading={merging}
            disabled={passedCount === 0 || !hasTargetModule}
            onClick={merge}
          >
            合并到用例库
          </Button>
        </Space>
      </div>

      <Space className="xmind-review__toolbar">
        <Button
          icon={<CheckCircleOutlined aria-hidden="true" />}
          disabled={selectedKeys.length === 0}
          onClick={batchConfirm}
        >
          批量确认通过
        </Button>
        <Button
          danger
          icon={<DeleteOutlined aria-hidden="true" />}
          disabled={selectedKeys.length === 0}
          onClick={batchDelete}
        >
          批量删除
        </Button>
        <span className="xmind-review__selected">已选 {selectedKeys.length} 条</span>
      </Space>

      {currentCases.length ? (
        <>
          <Table<XMindGeneratedCase>
            rowKey="tempId"
            columns={columns}
            dataSource={pagedCases}
            pagination={false}
            size="small"
            rowSelection={{
              selectedRowKeys: selectedKeys,
              preserveSelectedRowKeys: true,
              onSelect: (record, selected) => setCaseSelected(record, selected),
              onSelectAll: (selected) => setCurrentPageSelected(selected),
            }}
            // 点击行打开详情弹窗；点击复选框或操作按钮时不触发。
            onRow={(record) => ({
              onClick: (event) => {
                const target = event.target as HTMLElement;
                if (target.closest('.ant-checkbox-wrapper') || target.closest('.ant-btn')) return;
                setModalCase(record);
              },
            })}
          />
          <AppPagination
            current={safePage}
            pageSize={pageSize}
            total={currentCases.length}
            onChange={(nextPage, nextPageSize) => {
              setPageSize(nextPageSize);
              setPage(nextPageSize === pageSize ? nextPage : 1);
            }}
          />
        </>
      ) : (
        <Empty description="暂无用例" />
      )}

      {modalCase ? (
        <XMindCaseDetailModal
          taskId={task.id}
          caseItem={modalCase}
          onUpdated={(detail) => {
            // 保存后同时刷新弹窗引用，避免继续展示更新前的字段和审核状态。
            onTaskChange(detail);
            setModalCase(detail.cases.find((item) => item.tempId === modalCase.tempId) ?? null);
          }}
          onClosed={() => setModalCase(null)}
        />
      ) : null}
    </section>
  );
}
