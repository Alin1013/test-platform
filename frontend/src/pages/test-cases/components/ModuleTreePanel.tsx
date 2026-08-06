import {
  CaretDownOutlined,
  CaretRightOutlined,
  EllipsisOutlined,
  MenuFoldOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { App, Button, Dropdown, Input, Modal, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { usePlatformService } from '../../../services/PlatformServiceContext';
import type { TestModule } from '../../../services/contracts';
import { visibleModuleTree } from '../moduleOptions';

interface ModuleNode {
  id: string;
  label: string;
  children?: ModuleNode[];
}

interface ModuleTreePanelProps {
  selectedModule: string;
  width: number;
  hidden: boolean;
  refreshToken?: number;
  onSelect: (moduleId: string) => void;
  onWidthChange: (width: number) => void;
  onCollapse: () => void;
}

const MIN_PANEL_WIDTH = 220;
const MAX_PANEL_WIDTH = 420;
const KEYBOARD_RESIZE_STEP = 16;

function clampPanelWidth(width: number) {
  return Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, width));
}

function FolderIcon() {
  return <span className="module-panel__folder-icon" aria-hidden="true" />;
}

function toModuleNodes(modules: TestModule[]): ModuleNode[] {
  return visibleModuleTree(modules).map((module) => ({
    id: module.id,
    label: module.name,
    children: toModuleNodes(module.children),
  }));
}

type DialogState =
  | { type: 'rename'; node: ModuleNode }
  | { type: 'add'; node: ModuleNode }
  | { type: 'addRoot' }
  | { type: 'delete'; node: ModuleNode }
  | null;

function updateNode(
  nodes: ModuleNode[],
  nodeId: string,
  update: (node: ModuleNode) => ModuleNode,
): ModuleNode[] {
  return nodes.map((node) => {
    if (node.id === nodeId) return update(node);
    if (!node.children?.length) return node;
    return { ...node, children: updateNode(node.children, nodeId, update) };
  });
}

function removeNode(nodes: ModuleNode[], nodeId: string): ModuleNode[] {
  return nodes
    .filter((node) => node.id !== nodeId)
    .map((node) => ({
      ...node,
      children: node.children?.length ? removeNode(node.children, nodeId) : node.children,
    }));
}

function findNode(nodes: ModuleNode[], nodeId: string): ModuleNode | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    const child = findNode(node.children ?? [], nodeId);
    if (child) return child;
  }
  return undefined;
}

export function ModuleTreePanel({
  selectedModule,
  width,
  hidden,
  refreshToken = 0,
  onSelect,
  onWidthChange,
  onCollapse,
}: ModuleTreePanelProps) {
  const service = usePlatformService();
  const { message } = App.useApp();
  const [moduleTree, setModuleTree] = useState<ModuleNode[]>([]);
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(() => new Set());
  const [dialog, setDialog] = useState<DialogState>(null);
  const [draftName, setDraftName] = useState('');
  const [isMutating, setIsMutating] = useState(false);
  const resizeOrigin = useRef<{ pointerX: number; width: number } | null>(null);

  const reloadModules = async () => {
    const modules = await service.listTestModules(1);
    setModuleTree(toModuleNodes(modules));
  };

  useEffect(() => {
    let active = true;
    void service.listTestModules(1).then((modules) => {
      if (active) setModuleTree(toModuleNodes(modules));
    });
    return () => {
      active = false;
    };
  }, [refreshToken, service]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!resizeOrigin.current) return;
      onWidthChange(
        clampPanelWidth(resizeOrigin.current.width + event.clientX - resizeOrigin.current.pointerX),
      );
    };
    const stopResizing = () => {
      resizeOrigin.current = null;
      document.body.classList.remove('is-resizing-module-panel');
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResizing);
    window.addEventListener('pointercancel', stopResizing);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResizing);
      window.removeEventListener('pointercancel', stopResizing);
      document.body.classList.remove('is-resizing-module-panel');
    };
  }, [onWidthChange]);

  const openDialog = (type: Exclude<DialogState, null>['type'], node: ModuleNode) => {
    setDraftName(type === 'rename' ? node.label : '');
    setDialog({ type, node } as DialogState);
  };

  const handleMenuClick = (node: ModuleNode, key: string) => {
    if (key === 'delete') {
      setDialog({ type: 'delete', node });
      return;
    }
    openDialog(key as 'rename' | 'add', node);
  };

  const menuFor = (node: ModuleNode): MenuProps => ({
    items: [
      { key: 'add', label: '新增子目录' },
      { key: 'rename', label: '重命名' },
      { type: 'divider' },
      { key: 'delete', label: '删除', danger: true },
    ],
    onClick: ({ key }) => handleMenuClick(node, key),
  });

  const submitName = async () => {
    const label = draftName.trim();
    if (!label || !dialog || dialog.type === 'delete') return;

    const currentDialog = dialog;
    setIsMutating(true);
    if (currentDialog.type === 'addRoot') {
      setModuleTree((nodes) => [...nodes, { id: `pending-${Date.now()}`, label, children: [] }]);
    } else if (currentDialog.type === 'rename') {
      setModuleTree((nodes) => updateNode(nodes, currentDialog.node.id, (node) => ({ ...node, label })));
    } else {
      setModuleTree((nodes) =>
        updateNode(nodes, currentDialog.node.id, (node) => ({
          ...node,
          children: [...(node.children ?? []), { id: `pending-${Date.now()}`, label, children: [] }],
        })),
      );
      setExpandedNodeIds((currentIds) => new Set(currentIds).add(currentDialog.node.id));
    }
    try {
      if (currentDialog.type === 'addRoot') {
        await service.createTestModule({ name: label, projectId: 1 });
      } else if (currentDialog.type === 'rename') {
        await service.updateTestModule(currentDialog.node.id, { name: label });
      } else {
        await service.createTestModule({
          name: label,
          parentId: currentDialog.node.id,
          projectId: 1,
        });
      }
      await reloadModules();
      setDialog(null);
    } catch (error) {
      await reloadModules().catch(() => undefined);
      void message.error(error instanceof Error ? error.message : '保存模块失败');
    } finally {
      setIsMutating(false);
    }
  };

  const deleteNode = async () => {
    if (!dialog || dialog.type !== 'delete') return;

    const currentDialog = dialog;
    setIsMutating(true);
    setModuleTree((nodes) => removeNode(nodes, currentDialog.node.id));
    setExpandedNodeIds((currentIds) => {
      const nextIds = new Set(currentIds);
      nextIds.delete(currentDialog.node.id);
      return nextIds;
    });
    if (selectedModule === currentDialog.node.id || findNode([currentDialog.node], selectedModule)) {
      onSelect('all');
    }
    try {
      await service.deleteTestModule(currentDialog.node.id);
      await reloadModules();
      setDialog(null);
    } catch (error) {
      await reloadModules().catch(() => undefined);
      void message.error(error instanceof Error ? error.message : '删除模块失败');
    } finally {
      setIsMutating(false);
    }
  };

  const renderActions = (node: ModuleNode) => (
    <Dropdown trigger={['click']} menu={menuFor(node)} placement="bottomRight">
      <Button
        type="text"
        size="small"
        className="module-panel__actions"
        aria-label={`${node.label} 操作`}
        icon={<EllipsisOutlined />}
        onClick={(event) => event.stopPropagation()}
      />
    </Dropdown>
  );

  const renderNode = (node: ModuleNode, depth = 0) => {
    const hasChildren = Boolean(node.children?.length);
    const isExpanded = hasChildren && expandedNodeIds.has(node.id);

    return (
      <div key={node.id} className="module-panel__branch">
        <div className="module-panel__item-row" style={{ paddingInlineStart: depth * 18 }}>
          {hasChildren ? (
            <Button
              type="text"
              size="small"
              className="module-panel__tree-toggle"
              aria-label={`${isExpanded ? '折叠' : '展开'} ${node.label}`}
              icon={isExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
              onClick={() => {
                setExpandedNodeIds((currentIds) => {
                  const nextIds = new Set(currentIds);
                  if (isExpanded) nextIds.delete(node.id);
                  else nextIds.add(node.id);
                  return nextIds;
                });
              }}
            />
          ) : (
            <span className="module-panel__tree-toggle-spacer" aria-hidden="true" />
          )}
          <button
            type="button"
            role="treeitem"
            aria-level={depth + 1}
            aria-expanded={hasChildren ? isExpanded : undefined}
            aria-selected={selectedModule === node.id}
            className={`module-panel__item${selectedModule === node.id ? ' is-selected' : ''}`}
            onClick={() => onSelect(node.id)}
          >
            <FolderIcon />
            <span className="module-panel__label">{node.label}</span>
          </button>
          {renderActions(node)}
        </div>
        {isExpanded ? (
          <div role="group">{node.children?.map((child) => renderNode(child, depth + 1))}</div>
        ) : null}
      </div>
    );
  };

  return (
    <aside className="module-panel" aria-label="模块树" hidden={hidden}>
      <div className="module-panel__title">
        <h2>模块</h2>
        <span className="module-panel__count">{moduleTree.length} 个根目录</span>
        <Tooltip title="新增根目录">
          <Button
            type="text"
            size="small"
            className="module-panel__root-action"
            aria-label="新增根目录"
            icon={<PlusOutlined />}
            onClick={() => {
              setDraftName('');
              setDialog({ type: 'addRoot' });
            }}
          />
        </Tooltip>
        <Tooltip title="隐藏模块栏">
          <Button
            type="text"
            size="small"
            className="module-panel__collapse"
            aria-label="隐藏模块栏"
            icon={<MenuFoldOutlined />}
            onClick={onCollapse}
          />
        </Tooltip>
      </div>
      <div role="tree" aria-label="用例模块">
        <button
          type="button"
          role="treeitem"
          aria-selected={selectedModule === 'all'}
          className={`module-panel__item module-panel__all-item${selectedModule === 'all' ? ' is-selected' : ''}`}
          onClick={() => onSelect('all')}
        >
          <FolderIcon />
          <span className="module-panel__label">全部模块</span>
        </button>
        {moduleTree.map((node) => renderNode(node))}
      </div>

      <div
        role="separator"
        aria-label="调整模块栏宽度"
        aria-orientation="vertical"
        aria-valuemin={MIN_PANEL_WIDTH}
        aria-valuemax={MAX_PANEL_WIDTH}
        aria-valuenow={width}
        className="module-panel__resize-handle"
        tabIndex={0}
        onPointerDown={(event) => {
          event.preventDefault();
          resizeOrigin.current = { pointerX: event.clientX, width };
          document.body.classList.add('is-resizing-module-panel');
        }}
        onKeyDown={(event) => {
          const nextWidth = {
            ArrowLeft: clampPanelWidth(width - KEYBOARD_RESIZE_STEP),
            ArrowRight: clampPanelWidth(width + KEYBOARD_RESIZE_STEP),
            Home: MIN_PANEL_WIDTH,
            End: MAX_PANEL_WIDTH,
          }[event.key];
          if (nextWidth === undefined) return;
          event.preventDefault();
          onWidthChange(nextWidth);
        }}
      />

      <Modal
        title={
          dialog?.type === 'rename'
            ? '重命名模块'
            : dialog?.type === 'add'
              ? '新增子目录'
              : dialog?.type === 'addRoot'
                ? '新增根目录'
                : undefined
        }
        open={dialog?.type === 'rename' || dialog?.type === 'add' || dialog?.type === 'addRoot'}
        destroyOnHidden
        okText="确定"
        cancelText="取消"
        onOk={submitName}
        onCancel={() => setDialog(null)}
        okButtonProps={{ 'aria-label': '确定', disabled: !draftName.trim(), loading: isMutating }}
        cancelButtonProps={{ 'aria-label': '取消' }}
      >
        <Input
          aria-label="目录名称"
          placeholder="请输入目录名称"
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          onPressEnter={submitName}
        />
      </Modal>

      <Modal
        title="删除模块"
        open={dialog?.type === 'delete'}
        destroyOnHidden
        okText="删除"
        cancelText="取消"
        okButtonProps={{ 'aria-label': '删除', danger: true, loading: isMutating }}
        cancelButtonProps={{ 'aria-label': '取消' }}
        onOk={deleteNode}
        onCancel={() => setDialog(null)}
      >
        确定删除“{dialog?.type === 'delete' ? dialog.node.label : ''}”及其子目录吗？
      </Modal>
    </aside>
  );
}
